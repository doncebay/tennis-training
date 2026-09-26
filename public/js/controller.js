// Phone controller: reads the gyroscope, turns it into the racket's orientation
// (a quaternion), detects swings and sends everything to the game screen.
import { t, applyI18n } from './i18n.js';
import { createControllerLink } from './net.js';
import { ENV } from './config.js';

applyI18n();
document.title = t('c.pageTitle');
if (ENV === 'staging') {
  document.title = `Staging · ${document.title}`;
  document.body.insertAdjacentHTML('beforeend', '<div class="env-badge">STAGING</div>');
}

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

const state = {
  link: null,
  room: '',
  hand: Number(localStorage.getItem('tt-hand') || 1),
  threshold: Number(localStorage.getItem('tt-sens') || 300), // deg/s needed to count as a swing
  yawOffset: 0,
  calibrated: false,
  q: [0, 0, 0, 1],
  rawQ: [0, 0, 0, 1],
  lastSend: 0,
  motionSeen: false,
  audio: null,
  wakeLock: null,
  joined: false,
};

// ---------------------------------------------------------------------------
// Quaternions (x, y, z, w)
// three.js world frame: y = up, -z = toward the game screen.
// Phone frame: -z = top edge of the phone, +y = screen normal.
// ---------------------------------------------------------------------------

function qmul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function qAxis(ax, ay, az, angle) {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

function qRotate(q, v) {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

/** deviceorientation (alpha, beta, gamma) -> quaternion in the game's frame. */
function quatFromDevice(alpha, beta, gamma, screenAngle) {
  const x = beta * DEG;
  const y = alpha * DEG;
  const z = -gamma * DEG;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  // 'YXZ' order (same as THREE.Euler)
  let q = [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
  if (screenAngle) q = qmul(q, qAxis(0, 1, 0, -screenAngle * DEG));
  return q;
}

function screenAngle() {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

async function requestSensorPermission() {
  const needs = [];
  // iOS 13+: permission must be requested inside the user's tap, before any await.
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    needs.push(DeviceMotionEvent.requestPermission());
  }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    needs.push(DeviceOrientationEvent.requestPermission());
  }
  const results = await Promise.all(needs);
  if (results.some((r) => r !== 'granted')) {
    throw new Error(t('c.errPermission'));
  }
}

function onOrientation(e) {
  if (e.alpha == null && e.beta == null) return;
  state.rawQ = quatFromDevice(e.alpha || 0, e.beta || 0, e.gamma || 0, screenAngle());
  // First reading: when you tap "Connect" you're usually holding the phone in
  // front of you, facing the screen, so it works as an initial calibration.
  if (!state.calibrated) calibrate(true);
  state.q = qmul(qAxis(0, 1, 0, -state.yawOffset), state.rawQ);

  const now = performance.now();
  if (now - state.lastSend >= 14 && state.link?.canSend()) {
    state.lastSend = now;
    send({ t: 'q', q: state.q.map((v) => Math.round(v * 1e4) / 1e4) });
  }
  drawRacket();
}

// Swing detection from angular velocity (raw gyroscope).
const swing = { active: false, peak: 0, start: 0, last: 0, rate: null };

function onMotion(e) {
  const rr = e.rotationRate;
  if (!rr) return;
  state.motionSeen = true;
  const w = Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0); // deg/s
  updateMeter(w);

  const now = performance.now();
  if (!swing.active) {
    if (w > state.threshold && now - swing.last > 380) {
      Object.assign(swing, { active: true, peak: w, start: now, rate: rr });
    }
    return;
  }
  if (w > swing.peak) {
    swing.peak = w;
    swing.rate = { alpha: rr.alpha, beta: rr.beta, gamma: rr.gamma };
  }
  // Fire at the peak (maximum racket speed ≈ moment of contact).
  if (w < swing.peak * 0.78 || now - swing.start > 140) {
    swing.active = false;
    swing.last = now;
    fireSwing(swing.peak, swing.rate);
  }
}

function fireSwing(peak, rate) {
  const power = Math.min(1, Math.max(0.1, (peak - state.threshold * 0.8) / 1100));
  // Spin around the world's vertical axis: + = right to left (right-handed forehand).
  const wDev = [rate.beta || 0, rate.alpha || 0, -(rate.gamma || 0)];
  const wWorld = qRotate(state.rawQ, wDev);
  const dir = Math.sign(wWorld[1]) * state.hand;
  send({ t: 'swing', p: Math.round(power * 100) / 100, dir });
  showSwing(power, dir);
}

function calibrate(silent = false) {
  // Use where the top of the phone points; if it's nearly vertical, use where
  // the back (the camera) faces instead.
  let v = qRotate(state.rawQ, [0, 0, -1]);
  if (Math.hypot(v[0], v[2]) < 0.5) v = qRotate(state.rawQ, [0, -1, 0]);
  state.yawOffset = Math.atan2(-v[0], -v[2]);
  state.calibrated = true;
  if (silent) return;
  send({ t: 'cal' });
  buzz(25);
  setHint(t('c.calibrated'));
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function send(msg) {
  state.link?.send(msg);
}

function connect() {
  state.link?.close();
  state.link = createControllerLink({
    room: state.room,
    onMessage,
    onStatus(status) {
      if (status !== 'connecting') state.joined = false;
      if (status === 'no-room') showScreen('connect');
      else if (status === 'connecting') setStatus(t('c.connecting'));
      else if (status === 'replaced') setStatus(t('c.replaced'), 'bad');
      else if (status === 'unreachable') {
        setStatus(t('c.reconnecting'), 'bad');
        setHint(t('c.unreachable'));
      } else setStatus(t('c.reconnecting'), 'bad');
    },
  });
}

function onMessage(m) {
  switch (m.t) {
    case 'joined':
      state.joined = true;
      localStorage.setItem('tt-room', m.code);
      $('roomtag').textContent = t('c.room', { code: m.code });
      setStatus(t(m.host ? 'c.connected' : 'c.waitingScreen'), m.host ? 'ok' : '');
      send({ t: 'hello', hand: state.hand });
      break;
    case 'host':
      setStatus(t(m.on ? 'c.connected' : 'c.screenGone'), m.on ? 'ok' : 'bad');
      if (m.on) send({ t: 'hello', hand: state.hand });
      break;
    case 'error':
      $('err').textContent = m.code === 'no-room' ? t('c.errNoRoom', { code: m.room || '—' }) : m.msg;
      break;
    case 'hit':
      buzz(25 + m.p * 45);
      pock(m.p);
      break;
    case 'point':
      flashMessage(m.text, m.win ? 'good' : 'bad');
      buzz(m.win ? [60, 60, 120] : 200);
      break;
    case 'over':
      flashMessage(t(m.win ? 'c.overWin' : 'c.overLose'), m.win ? 'good' : 'bad', 6000);
      break;
    case 'hint':
      if (m.text) setHint(m.text);
      break;
    case 'skin': {
      // The racket icon takes the colors of the design picked on the screen.
      const icon = $('racket');
      icon.style.setProperty('--paint', m.paint);
      icon.style.setProperty('--side', m.side);
      icon.style.setProperty('--stripe', m.stripe);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Feedback on the phone
// ---------------------------------------------------------------------------

function buzz(pattern) {
  navigator.vibrate?.(pattern);
}

// Like the Wiimote speaker: a "pock" on every hit.
function pock(power = 0.6) {
  const ctx = state.audio;
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600 + power * 200, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.07);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.6, now + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

let meterPeak = 0;
function updateMeter(w) {
  meterPeak = Math.max(w, meterPeak * 0.9);
  $('meter-fill').style.width = `${Math.min(100, (meterPeak / 1500) * 100)}%`;
}

function drawRacket() {
  // Simple drawing: the on-phone racket leans with the phone's tilt.
  const top = qRotate(state.q, [0, 0, -1]);
  const angle = Math.atan2(top[0], top[1]) / DEG;
  $('racket').style.transform = `rotate(${angle.toFixed(1)}deg)`;
}

let swingTimer = 0;
function showSwing(power, dir) {
  const label = $('swing-label');
  label.textContent = `${t(dir >= 0 ? 'c.forehand' : 'c.backhand')} · ${Math.round(power * 100)}%`;
  label.classList.add('show');
  $('ring').classList.remove('pulse');
  void $('ring').offsetWidth;
  $('ring').classList.add('pulse');
  clearTimeout(swingTimer);
  swingTimer = setTimeout(() => label.classList.remove('show'), 700);
}

let msgTimer = 0;
function flashMessage(text, kind = '', ms = 2200) {
  const el = $('message');
  el.textContent = text;
  el.className = `message show ${kind}`;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (el.className = 'message'), ms);
}

function setHint(text) {
  $('hint').textContent = text;
}

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `pill ${kind}`;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
}

async function keepAwake() {
  try {
    state.wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    // Not critical.
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function bindSeg(id, onPick) {
  $(id).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    onPick(Number(btn.dataset.v));
  });
}

function selectSeg(id, value) {
  $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === value));
}

function setHand(v) {
  state.hand = v;
  localStorage.setItem('tt-hand', String(v));
  selectSeg('hand', v);
  selectSeg('hand2', v);
  send({ t: 'cfg', hand: v });
}

bindSeg('hand', setHand);
bindSeg('hand2', setHand);
bindSeg('sens', (v) => {
  state.threshold = v;
  localStorage.setItem('tt-sens', String(v));
});
selectSeg('hand', state.hand);
selectSeg('hand2', state.hand);
selectSeg('sens', state.threshold);
$('meter-th').style.left = `${(state.threshold / 1500) * 100}%`;
$('sens').addEventListener('click', () => ($('meter-th').style.left = `${(state.threshold / 1500) * 100}%`));

const params = new URLSearchParams(location.search);
$('room').value = (params.get('room') || localStorage.getItem('tt-room') || '').toUpperCase();
$('room').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '')));

$('go').addEventListener('click', async () => {
  $('err').textContent = '';
  const room = $('room').value.trim().toUpperCase();
  if (room.length !== 4) {
    $('err').textContent = t('c.errCode');
    return;
  }
  if (!window.isSecureContext) {
    $('err').textContent = t('c.errHttps');
    return;
  }
  // Audio and sensor permissions must be unlocked inside this tap.
  const permission = requestSensorPermission();
  try {
    state.audio = new (window.AudioContext || window.webkitAudioContext)();
    state.audio.resume();
  } catch {
    state.audio = null;
  }
  try {
    await permission;
  } catch (err) {
    $('err').textContent = err.message || t('c.errSensors');
    return;
  }

  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);
  try {
    screen.orientation?.lock?.('portrait')?.catch(() => {});
  } catch {
    // iOS doesn't allow locking the orientation.
  }
  keepAwake();

  state.room = room;
  showScreen('pad');
  connect();

  setTimeout(() => {
    if (!state.motionSeen) {
      setHint(t('c.noGyro'));
    }
  }, 2500);
});

$('calibrate').addEventListener('click', () => calibrate());
$('tap').addEventListener('click', () => {
  send({ t: 'swing', p: 0.7, dir: 1 });
  showSwing(0.7, 1);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.link) keepAwake();
});

// Debug readout in Settings
setInterval(() => {
  const top = qRotate(state.q, [0, 0, -1]).map((v) => v.toFixed(2));
  $('debug').textContent = t('c.debug', { w: Math.round(meterPeak), v: top.join(', ') });
}, 250);
