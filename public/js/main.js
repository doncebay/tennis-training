// Game screen entry point: wires the scene, the match and the phone connection.
import { createWorld } from './world.js';
import { Match, DIFFICULTY } from './match.js';
import { Sfx } from './audio.js';
import { createHud } from './hud.js';
import { RACKET_SKINS, hexToCss } from './characters.js';
import { SURFACES } from './physics.js';
import { createRacketPreview } from './racketPreview.js';
import { t, lang, applyI18n, setLang } from './i18n.js';
import { createHostLink, mode } from './net.js';
import { ENV } from './config.js';
import { renderSVG } from '../vendor/uqr/index.mjs';

const $ = (id) => document.getElementById(id);

applyI18n();
document.title = t('title');
if (ENV === 'staging') {
  document.title = `Staging · ${document.title}`;
  document.body.insertAdjacentHTML('beforeend', '<div class="env-badge">STAGING</div>');
}
// Online (peer-to-peer) there is no local certificate to accept.
if (mode === 'p2p') $('steps').innerHTML = t('menu.stepsOnline');

const world = createWorld($('game'));
const sfx = new Sfx();
const hud = createHud();

// ---------------------------------------------------------------------------
// Link to the phone (this screen hosts the room; see net.js)
// ---------------------------------------------------------------------------

let controllerOn = false;
const link = createHostLink({
  lang,
  onRoom({ code, url }) {
    const svg = renderSVG(url, { border: 1, whiteColor: '#ffffff', blackColor: '#0b1d33' });
    $('qr').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    $('code').textContent = code;
    // Short, typeable address: .../c opens the controller.
    $('url').textContent = url.replace(/\?.*$/, '').replace(/controller\.html$/, 'c');
  },
  onController: (on) => setController(on),
  onMessage: (msg) => onMessage(msg),
});

const match = new Match({ world, sfx, hud, notify: (m) => link.send(m) });

function onMessage(msg) {
  switch (msg.t) {
    case 'q':
      if (Array.isArray(msg.q) && msg.q.length === 4) match.setPhoneQuaternion(msg.q);
      break;
    case 'swing':
      onSwing(Math.min(1, Math.max(0, Number(msg.p) || 0)), 'phone');
      break;
    case 'hello':
    case 'cfg':
      match.setHand(msg.hand);
      break;
    case 'cal':
      hud.feedback(t('hud.calibrated'), 'good');
      break;
  }
}

function setController(on) {
  const was = controllerOn;
  controllerOn = on;
  if (!on) match.clearPhone();
  document.body.classList.toggle('has-ctrl', on);
  $('conn').textContent = t(on ? 'hud.phoneMode' : 'hud.mouseMode');
  $('ctrl-pill').textContent = t(on ? 'menu.ctrlConnected' : 'menu.ctrlWaiting');
  $('ctrl-status').innerHTML = t(on ? 'menu.statusConnected' : 'menu.statusWaiting');
  if (on && !was) {
    hud.feedback(t('hud.ctrlConnected'), 'good');
    sendSkin();
    link.send({ t: 'hint', text: inMenu() ? t('hint.calibrateToStart') : '' });
  }
  if (!on && was) hud.feedback(t('hud.ctrlLost'), 'bad');
}

// ---------------------------------------------------------------------------
// Menu and match
// ---------------------------------------------------------------------------

const DEFAULTS = { difficulty: 'normal', games: 3, surface: 'hard', racket: 'classic' };
const VALID = {
  difficulty: Object.keys(DIFFICULTY),
  games: [1, 3, 6],
  surface: Object.keys(SURFACES),
  racket: Object.keys(RACKET_SKINS),
};
const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem('tt-settings') || '{}');
  // Ignore anything unknown (e.g. values saved by an older version).
  for (const key of Object.keys(DEFAULTS)) {
    if (VALID[key].includes(saved[key])) settings[key] = saved[key];
  }
} catch {
  // Corrupt preferences: keep the defaults.
}

function saveSettings() {
  try {
    localStorage.setItem('tt-settings', JSON.stringify(settings));
  } catch {
    // Storage blocked: settings just won't persist.
  }
}

const preview = createRacketPreview($('racket-preview'));

// One color swatch per racket design
$('opt-racket').innerHTML = Object.entries(RACKET_SKINS)
  .map(([id, s]) => {
    const name = t(`racket.${id}`);
    return (
      `<button data-v="${id}" title="${name}" aria-label="${t('menu.racket')}: ${name}" ` +
      `style="--a:${hexToCss(s.paint)};--b:${hexToCss(s.side)};--c:${hexToCss(s.stripe)}"></button>`
    );
  })
  .join('');

const applySetting = {
  surface(v) {
    world.setSurface(v);
    sfx.setSurface(v);
  },
  racket(v) {
    match.setRacketSkin(v);
    preview.setSkin(v);
    $('racket-name').textContent = t(`racket.${v}`);
    sendSkin();
  },
};

function sendSkin() {
  const s = RACKET_SKINS[settings.racket] || RACKET_SKINS.classic;
  link.send({ t: 'skin', paint: hexToCss(s.paint), side: hexToCss(s.side), stripe: hexToCss(s.stripe) });
}

function bindChoice(groupId, key, parse = (v) => v) {
  const group = $(groupId);
  const select = (value) =>
    group.querySelectorAll('button[data-v]').forEach((b) => b.classList.toggle('on', parse(b.dataset.v) === value));
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    settings[key] = parse(btn.dataset.v);
    select(settings[key]);
    applySetting[key]?.(settings[key]);
    saveSettings();
  });
  select(settings[key]);
  applySetting[key]?.(settings[key]);
}
bindChoice('opt-court', 'surface');
bindChoice('opt-racket', 'racket');
bindChoice('opt-diff', 'difficulty');
bindChoice('opt-games', 'games', Number);

// Language switch (reloads the page; the room code survives in sessionStorage)
$('opt-lang').querySelectorAll('button').forEach((b) => {
  b.classList.toggle('on', b.dataset.v === lang);
  b.addEventListener('click', () => b.dataset.v !== lang && setLang(b.dataset.v));
});

const inMenu = () => $('menu').classList.contains('show');

function startMatch() {
  sfx.unlock();
  preview.stop();
  $('menu').classList.remove('show');
  hud.hideOver();
  document.body.classList.add('playing');
  match.start({ ...settings });
}

function toMenu() {
  hud.hideOver();
  document.body.classList.remove('playing');
  $('menu').classList.add('show');
  preview.start();
  match.backToMenu();
  hud.hint('');
}

$('play').addEventListener('click', startMatch);
$('again').addEventListener('click', startMatch);
$('to-menu').addEventListener('click', toMenu);

function onSwing(power, source) {
  if (inMenu() || match.phase === 'over') {
    // In the menu a phone swing starts the match (Wii style).
    if (source === 'phone') startMatch();
    return;
  }
  match.swing(power, source);
}

// ---------------------------------------------------------------------------
// Mouse / keyboard (to play without a phone)
// ---------------------------------------------------------------------------

const canvas = $('game');
window.addEventListener('pointermove', (e) => {
  match.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (!inMenu()) onSwing(e.shiftKey ? 1 : 0.7, 'mouse');
});
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.code === 'Space' && !inMenu()) {
    e.preventDefault();
    if (!e.repeat) onSwing(e.shiftKey ? 1 : 0.7, 'mouse');
  } else if (e.code === 'KeyF') {
    toggleFullscreen();
  } else if (e.code === 'Escape' && !inMenu()) {
    toMenu();
  }
});
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}
$('fullscreen').addEventListener('click', toggleFullscreen);

// Browsers block audio until the first click; show a hint until then.
setInterval(() => $('sound').classList.toggle('show', !sfx.unlocked), 500);
$('sound').addEventListener('click', () => sfx.unlock());

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!debug.paused) {
    match.update(dt);
    world.render(dt, now / 1000, match.excitementLevel);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setController(false);
preview.start();

// Console debugging: tt.paused = true; tt.tick(30) advances 30 frames.
const debug = {
  match,
  world,
  link,
  paused: false,
  tick(frames = 1) {
    for (let i = 0; i < frames; i++) match.update(1 / 60);
    world.render(1 / 60, performance.now() / 1000, match.excitementLevel);
  },
};
window.tt = debug;
