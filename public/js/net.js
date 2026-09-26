// Screen <-> phone transport, with two interchangeable backends:
//  - 'server': the bundled Node server relays messages over WebSocket
//    (works on a local network, even offline).
//  - 'p2p': for static hosting such as GitHub Pages. The phone talks straight
//    to the screen over a WebRTC data channel; PeerJS's free public broker is
//    only used to introduce the two devices.
// Both sides exchange the same small JSON messages ({t: 'q' | 'swing' | ...}).
import { MODE } from './config.js';

const params = new URLSearchParams(location.search);
const forced = params.get('mode');
export const mode = forced === 'p2p' || forced === 'server' ? forced : MODE;

const PEER_PREFIX = 'tennis-training-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const randomCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

let peerJs = null;
function loadPeerJs() {
  peerJs ??= new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const script = document.createElement('script');
    script.src = new URL('../vendor/peerjs/peerjs.min.js', import.meta.url).href;
    script.onload = () => resolve(window.Peer);
    script.onerror = () => reject(new Error('Could not load PeerJS'));
    document.head.appendChild(script);
  });
  return peerJs;
}

// ---------------------------------------------------------------------------
// Screen side
// ---------------------------------------------------------------------------

/**
 * Opens a room for a phone to join.
 * Handlers: onRoom({code, url}) once the room exists (url = controller link for
 * the QR code), onController(connected), onMessage(msg) for phone messages.
 * Returns {send(msg)}; messages are dropped while no phone is connected.
 */
export function createHostLink(handlers) {
  return mode === 'p2p' ? p2pHost(handlers) : serverHost(handlers);
}

function serverHost({ lang, onRoom, onController, onMessage }) {
  let ws = null;
  let room = sessionStorage.getItem('tt-room') || '';
  let controller = false;
  let retry = 500;
  const setController = (on) => {
    if (on === controller) return;
    controller = on;
    onController(on);
  };

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = new URLSearchParams({ role: 'host', lang });
    if (room) qs.set('room', room);
    ws = new WebSocket(`${proto}://${location.host}/ws?${qs}`);
    ws.onopen = () => (retry = 500);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'room') {
        room = msg.code;
        sessionStorage.setItem('tt-room', room);
        onRoom({ code: room, url: msg.url });
        setController(Boolean(msg.ctrl));
      } else if (msg.t === 'ctrl') {
        setController(Boolean(msg.on));
      } else {
        onMessage(msg);
      }
    };
    ws.onclose = () => {
      setController(false);
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 5000);
    };
  }
  connect();

  return {
    send(msg) {
      if (controller && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}

function p2pHost({ lang, onRoom, onController, onMessage }) {
  let code = sessionStorage.getItem('tt-room') || randomCode();
  let peer = null;
  let conn = null;
  let takenRetries = 0;

  function controllerUrl() {
    const url = new URL('controller.html', location.href);
    url.search = new URLSearchParams({ room: code, lang, ...(forced ? { mode } : {}) });
    return url.href;
  }

  async function start() {
    const Peer = await loadPeerJs();
    peer = new Peer(PEER_PREFIX + code, { debug: 0 });

    peer.on('open', () => {
      takenRetries = 0;
      sessionStorage.setItem('tt-room', code);
      onRoom({ code, url: controllerUrl() });
    });

    peer.on('connection', (c) => {
      c.on('open', () => {
        // One phone per screen: a new phone replaces the previous one.
        if (conn && conn !== c) {
          const old = conn;
          old.send({ t: 'replaced' });
          setTimeout(() => old.close(), 300);
        }
        conn = c;
        c.send({ t: 'joined', code, host: true });
        onController(true);
      });
      c.on('data', (msg) => {
        if (c === conn && msg && typeof msg === 'object') onMessage(msg);
      });
      c.on('close', () => {
        if (c !== conn) return;
        conn = null;
        onController(false);
      });
      c.on('error', () => {});
    });

    // Losing the broker doesn't drop an open phone connection; just re-register.
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // After a reload the old registration can linger for a few seconds:
        // retry the same code briefly so the phone can reconnect, then give up on it.
        peer.destroy();
        if (++takenRetries > 3) {
          code = randomCode();
          takenRetries = 0;
        }
        setTimeout(start, 1500);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        setTimeout(() => peer.disconnected && !peer.destroyed && peer.reconnect(), 3000);
      }
    });
  }

  addEventListener('pagehide', () => peer?.destroy());
  start().catch(() => setTimeout(start, 3000));

  return {
    send(msg) {
      if (conn?.open) conn.send(msg);
    },
  };
}

// ---------------------------------------------------------------------------
// Phone side
// ---------------------------------------------------------------------------

/**
 * Joins the screen's room.
 * Handlers: onMessage(msg) for screen messages (including {t:'joined'} and
 * {t:'host', on}), onStatus(state) with 'connecting' | 'reconnecting' |
 * 'replaced' | 'no-room' | 'unreachable'.
 * Returns {send(msg), canSend(), close()}; canSend() is false while the link is busy.
 */
export function createControllerLink(handlers) {
  return mode === 'p2p' ? p2pController(handlers) : serverController(handlers);
}

function serverController({ room, onMessage, onStatus }) {
  let ws = null;
  let retry = 500;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?${new URLSearchParams({ role: 'ctrl', room })}`);
    ws.onopen = () => (retry = 500);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = (e) => {
      if (e.code === 4004) return onStatus('no-room');
      if (e.code === 4000) return onStatus('replaced');
      onStatus('reconnecting');
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 5000);
    };
  }
  onStatus('connecting');
  connect();

  return {
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    canSend: () => ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 2048,
    close() {
      ws.onclose = null;
      ws.close();
    },
  };
}

function p2pController({ room, onMessage, onStatus }) {
  let peer = null;
  let conn = null;
  let stopped = false;
  let everConnected = false;
  let failures = 0;

  function retryLater(ms = 2000) {
    if (!stopped) setTimeout(connectToScreen, ms);
  }

  // A wrong code and an unreachable screen look the same from here (the broker
  // reports unknown peers late), so both end the same way.
  function attemptFailed() {
    conn = null;
    if (!everConnected && ++failures >= 2) {
      stopped = true;
      onMessage({ t: 'error', code: 'no-room', room });
      onStatus('no-room');
      return;
    }
    if (everConnected) onStatus('unreachable');
    retryLater();
  }

  function connectToScreen() {
    if (stopped || !peer || peer.destroyed) return;
    if (peer.disconnected) {
      peer.reconnect();
      return; // 'open' fires again and calls us back
    }
    onStatus(everConnected ? 'reconnecting' : 'connecting');
    const c = peer.connect(PEER_PREFIX + room, { reliable: true, serialization: 'json' });
    conn = c;
    // No TURN relay: devices on different networks may never connect.
    const timeout = setTimeout(() => {
      if (c.open || c !== conn) return;
      c.close();
      attemptFailed();
    }, 8000);
    c.on('open', () => {
      clearTimeout(timeout);
      failures = 0;
      everConnected = true;
    });
    c.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'replaced') {
        stopped = true;
        onStatus('replaced');
        return;
      }
      onMessage(msg);
    });
    c.on('close', () => {
      clearTimeout(timeout);
      if (c !== conn || stopped) return;
      conn = null;
      if (everConnected) onMessage({ t: 'host', on: false });
      retryLater();
    });
    c.on('error', () => {});
  }

  async function start() {
    const Peer = await loadPeerJs();
    peer = new Peer({ debug: 0 });
    peer.on('open', () => connectToScreen());
    peer.on('disconnected', () => {
      if (!peer.destroyed && !stopped) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        // The screen isn't registered (wrong code, or it is reloading).
        if (conn) attemptFailed();
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        onStatus('reconnecting');
      }
    });
  }

  onStatus('connecting');
  start().catch(() => onStatus('unreachable'));

  return {
    send(msg) {
      if (conn?.open) conn.send(msg);
    },
    canSend: () => Boolean(conn?.open) && (conn.dataChannel?.bufferedAmount ?? 0) < 2048,
    close() {
      stopped = true;
      peer?.destroy();
    },
  };
}
