// Game server: serves the web app, pairs a screen with a phone and relays
// messages between them over WebSocket.
//
// - HTTP  :8080 -> for the computer (localhost counts as a "secure context").
// - HTTPS :8443 -> for the phone. iOS/Android only expose the gyroscope to
//   secure pages, so we generate a self-signed certificate on first run.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import selfsigned from 'selfsigned';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HTTP_PORT = Number(process.env.PORT) || 8080;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 8443;

// ---------------------------------------------------------------------------
// Local network
// ---------------------------------------------------------------------------

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // Prefer Wi-Fi/Ethernet over virtual interfaces (docker, VPN...).
      const score = /^(en|eth|wlan|wl)/.test(name) ? 0 : 1;
      out.push({ ip: a.address, score });
    }
  }
  return out.sort((a, b) => a.score - b.score).map((a) => a.ip);
}

const LAN_IPS = lanAddresses();
const LAN_IP = process.env.HOST_IP || LAN_IPS[0] || 'localhost';

// ---------------------------------------------------------------------------
// Self-signed certificate (regenerated when the LAN IP changes)
// ---------------------------------------------------------------------------

async function loadCertificate() {
  const dir = path.join(ROOT, '.cert');
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  const metaFile = path.join(dir, 'meta.json');
  const ips = [...new Set([LAN_IP, ...LAN_IPS])];

  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const fresh = Date.now() < meta.expires - 7 * 864e5;
    if (fresh && ips.every((ip) => meta.ips.includes(ip))) {
      return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
    }
  } catch {
    // No certificate yet: generate one.
  }

  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 1);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'TennisTraining' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...ips.filter((ip) => ip !== 'localhost').map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(metaFile, JSON.stringify({ ips, expires: notAfter.getTime() }));
  return { key: pems.private, cert: pems.cert };
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const MOUNTS = [
  ['/vendor/three/addons/', path.join(ROOT, 'node_modules/three/examples/jsm')],
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/build')],
  ['/', path.join(ROOT, 'public')],
];

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  // Short URL that is easy to type on a phone: https://IP:8443/c
  if (pathname === '/c' || pathname === '/c/') pathname = '/controller.html';

  for (const [prefix, dir] of MOUNTS) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.join(dir, pathname.slice(prefix.length));
    if (!file.startsWith(dir + path.sep)) break;
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404).end();
}

// ---------------------------------------------------------------------------
// Rooms: one screen (host) + one phone (ctrl)
// ---------------------------------------------------------------------------

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

async function attachHost(ws, requested, lang) {
  let code = requested;
  let room = code && rooms.get(code);
  // If the requested room already has an active screen, create a new one. If it
  // doesn't exist (e.g. the server restarted), recreate it with the same code so
  // the phone reconnects on its own.
  if (!room || (room.host && room.host.readyState === room.host.OPEN)) {
    code = !room && /^[A-Z]{4}$/.test(requested || '') ? requested : newCode();
    room = { host: null, ctrl: null, expire: null };
    rooms.set(code, room);
  }
  clearTimeout(room.expire);
  room.host = ws;

  // The phone opens the controller in the same language as the screen.
  const langParam = /^[a-z]{2}$/.test(lang || '') ? `&lang=${lang}` : '';
  const url = `https://${LAN_IP}:${HTTPS_PORT}/controller.html?room=${code}${langParam}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b1d33', light: '#ffffff' } });
  send(ws, { t: 'room', code, url, qr, ctrl: Boolean(room.ctrl) });
  send(room.ctrl, { t: 'host', on: true });

  ws.on('message', (data) => send(room.ctrl, data.toString()));
  ws.on('close', () => {
    if (room.host !== ws) return;
    room.host = null;
    send(room.ctrl, { t: 'host', on: false });
    // Allow a minute to reload the page without losing the phone.
    room.expire = setTimeout(() => {
      if (room.host) return;
      room.ctrl?.close(4001, 'room closed');
      rooms.delete(code);
    }, 60_000);
  });
}

function attachController(ws, code) {
  const room = rooms.get(code);
  if (!room) {
    send(ws, { t: 'error', code: 'no-room', room: code, msg: `Room ${code || '(empty)'} does not exist.` });
    ws.close(4004, 'no such room');
    return;
  }
  if (room.ctrl && room.ctrl !== ws) room.ctrl.close(4000, 'replaced');
  room.ctrl = ws;
  send(ws, { t: 'joined', code, host: Boolean(room.host) });
  send(room.host, { t: 'ctrl', on: true });

  ws.on('message', (data) => send(room.host, data.toString()));
  ws.on('close', () => {
    if (room.ctrl !== ws) return;
    room.ctrl = null;
    send(room.host, { t: 'ctrl', on: false });
  });
}

// Messages are tiny (orientation, swings); cap them so nobody can flood the relay.
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const role = url.searchParams.get('role');
  const code = (url.searchParams.get('room') || '').trim().toUpperCase();
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws._socket?.setNoDelay(true);

  if (role === 'host') attachHost(ws, code, url.searchParams.get('lang'));
  else if (role === 'ctrl') attachController(ws, code);
  else ws.close(4002, 'invalid role');
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10_000);

function onUpgrade(req, socket, head) {
  if (new URL(req.url, 'http://x').pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const tls = await loadCertificate();
const httpServer = http.createServer(serveStatic);
const httpsServer = https.createServer(tls, serveStatic);
httpServer.on('upgrade', onUpgrade);
httpsServer.on('upgrade', onUpgrade);

httpServer.listen(HTTP_PORT, () => {
  httpsServer.listen(HTTPS_PORT, () => {
    console.log('\n🎾  Tennis Training is ready\n');
    console.log(`   Game screen (this computer):   http://localhost:${HTTP_PORT}`);
    console.log(`   Game screen (another device):  https://${LAN_IP}:${HTTPS_PORT}`);
    console.log(`   Controller (phone):            https://${LAN_IP}:${HTTPS_PORT}/c`);
    console.log('\n   The phone must be on the same Wi-Fi network.');
    console.log('   The first time, accept the certificate warning ("Advanced" -> "Proceed").\n');
  });
});
