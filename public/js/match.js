// Match logic: serve, rally, AI opponent, rules, scoring and the first-person camera.
import * as THREE from 'three';
import {
  COURT,
  DT,
  G,
  stepBall,
  predictHit,
  solveShot,
  inSingles,
  inServiceBox,
  clamp,
  rand,
} from './physics.js';
import { createOpponent, createRacket, createFist, createForearm, RACKET_SKINS } from './characters.js';
import { t } from './i18n.js';

/**
 * CPU tuning. speed = shot pace (m/s), move = run speed (m/s), react = reaction
 * time (s), err = error chance, wide = how close to the lines it aims (m),
 * serve = first-serve pace (m/s), chaseOut = chance it plays a ball going out.
 */
export const DIFFICULTY = {
  easy: { speed: [15, 20], move: 4.0, react: 0.32, err: 0.14, wide: 2.3, serve: 28, serveErr: 0.1, chaseOut: 0.25 },
  normal: { speed: [18, 26], move: 5.0, react: 0.24, err: 0.08, wide: 3.0, serve: 36, serveErr: 0.08, chaseOut: 0.1 },
  hard: { speed: [22, 31], move: 6.3, react: 0.16, err: 0.045, wide: 3.5, serve: 44, serveErr: 0.06, chaseOut: 0.03 },
};

const EYE_H = 1.45;
const PLAYER_SPEED = 7.2; // m/s — movement is automatic, like Wii Sports
const TOSS_VY = 5.2;
const TOSS_APEX = TOSS_VY / G;
const SWING_LAG = 0.04; // time for a phone swing to reach the screen (s)
const POINT_NAMES = ['0', '15', '30', '40'];

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Phone-style orientation = yaw (turn) · roll (lean sideways) · tilt (raise). */
function racketPose(yaw, roll, tilt) {
  _qz.setFromAxisAngle(Z_AXIS, roll);
  _qx.setFromAxisAngle(X_AXIS, tilt);
  return _q.setFromAxisAngle(Y_AXIS, yaw).multiply(_qz).multiply(_qx);
}

export class Match {
  constructor({ world, sfx, hud, notify }) {
    this.world = world;
    this.sfx = sfx;
    this.hud = hud;
    this.notify = notify; // messages for the phone

    this.phase = 'menu';
    this.step = 0;
    this.acc = 0;
    this.timers = [];
    this.excitement = 0;
    this.time = 0;

    this.ball = { x: 0, y: -5, z: 0, vx: 0, vy: 0, vz: 0, rolling: false };
    this.ballMode = 'hidden'; // hidden | held-player | held-ai | toss | play | dead
    this.rally = { lastHitter: null, bounces: 0, isServe: false, netTouched: false };

    this.player = {
      pos: new THREE.Vector3(0, 0, COURT.halfL + 1),
      target: new THREE.Vector3(0, 0, COURT.halfL + 1),
      speed: 0,
      hand: 1, // 1 right-handed, -1 left-handed
      plan: null,
      moveFrom: 0,
    };
    this.pendingHit = null;
    this.tossStep = 0;

    const model = createOpponent({ envMap: world.envMap });
    world.scene.add(model.root);
    this.ai = {
      model,
      pos: new THREE.Vector3(0, 0, -COURT.halfL - 1),
      target: new THREE.Vector3(0, 0, -COURT.halfL - 1),
      speed: 0,
      plan: null,
      moveFrom: 0,
    };

    // First-person racket: its orientation comes from the phone.
    this.racketRoot = new THREE.Group();
    this.racket = createRacket('classic', { envMap: world.envMap });
    this.racket.rotation.x = -Math.PI / 2; // head along local -Z = top of the phone
    this.fist = createFist();
    this.racket.add(this.fist);
    this.racketRoot.add(this.racket);
    world.scene.add(this.racketRoot);
    this.forearm = createForearm();
    world.scene.add(this.forearm.group);
    this.racketQ = new THREE.Quaternion().setFromAxisAngle(X_AXIS, Math.PI / 2);
    this.phoneQ = null;
    this.pointer = { x: 0, y: 0 };
    this.fakeSwing = null;

    this.look = new THREE.Vector3(0, 0.8, 0);
    this.bob = 0;

    this.stats = { aces: 0, winners: 0, maxSpeed: 0 };
    this.settings = { difficulty: 'normal', games: 3, surface: 'hard', racket: 'classic' };
    this.score = { points: [0, 0], games: [0, 0] };
    this.server = 'player';
    this.faults = 0;

    this.#placeForMenu();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  setPhoneQuaternion(arr) {
    this.phoneQ ??= new THREE.Quaternion();
    this.phoneQ.fromArray(arr);
  }

  clearPhone() {
    this.phoneQ = null;
  }

  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  setRacketSkin(name) {
    const skin = RACKET_SKINS[name] ? name : 'classic';
    this.settings.racket = skin;
    this.racket.userData.setSkin(skin);
    this.forearm.setBand(RACKET_SKINS[skin].stripe);
  }

  setHand(hand) {
    this.player.hand = hand === -1 ? -1 : 1;
  }

  /** A swing was detected. power 0..1, source 'phone' | 'mouse'. */
  swing(power = 0.7, source = 'phone') {
    const lag = source === 'phone' ? SWING_LAG : 0;
    const plan = this.player.plan;
    const fb = plan ? plan.fb : 1;
    if (source !== 'phone') this.fakeSwing = { t: 0, fb };

    if (this.phase === 'serve' && this.server === 'player') {
      if (this.ballMode === 'held-player') return this.#toss();
      if (this.ballMode === 'toss') return this.#playerServe(power, lag);
      return;
    }
    if (this.phase !== 'rally' || this.ballMode !== 'play') return;
    if (this.rally.lastHitter !== 'ai' || !plan || this.pendingHit) return;

    const delta = (this.step - plan.hitStep) * DT - lag;
    if (delta < -0.4) {
      if (delta > -1.1) this.hud.feedback(t('fb.tooEarly'), 'bad');
      return;
    }
    if (delta > 0.14) {
      this.hud.feedback(t('fb.tooLate'), 'bad');
      return;
    }
    const reach = Math.hypot(this.player.pos.x - plan.stand.x, this.player.pos.z - plan.stand.z);
    if (reach > 1.2) {
      this.hud.feedback(t('fb.cantReach'), 'bad');
      return;
    }
    if (delta < 0) this.pendingHit = { step: plan.hitStep, delta, power };
    else this.#playerHit(delta, power);
  }

  // -------------------------------------------------------------------------
  // Match flow
  // -------------------------------------------------------------------------

  start(settings = {}) {
    Object.assign(this.settings, settings);
    this.diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY.normal;
    this.score = { points: [0, 0], games: [0, 0] };
    this.stats = { aces: 0, winners: 0, maxSpeed: 0 };
    this.server = 'player';
    this.timers = [];
    this.world.setSurface(this.settings.surface);
    this.world.clearMarks();
    this.#startPoint();
  }

  #placeForMenu() {
    this.phase = 'menu';
    this.player.pos.set(0.6, 0, COURT.halfL + 1);
    this.player.target.copy(this.player.pos);
    this.ai.pos.set(0, 0, -COURT.halfL - 0.8);
    this.ai.target.copy(this.ai.pos);
    this.ballMode = 'hidden';
  }

  get deuceSide() {
    return (this.score.points[0] + this.score.points[1]) % 2 === 0;
  }

  #startPoint() {
    this.phase = 'serve';
    this.pendingHit = null;
    this.player.plan = null;
    this.ai.plan = null;
    this.rally = { lastHitter: null, bounces: 0, isServe: true, netTouched: false };
    const deuce = this.deuceSide;

    if (this.server === 'player') {
      this.player.pos.set(deuce ? 0.9 : -0.9, 0, COURT.halfL + 0.6);
      this.ai.pos.set(deuce ? -2.7 : 2.7, 0, -COURT.halfL - 0.8);
      this.ballMode = 'held-player';
      // Rough hand position; every frame snaps it to the camera.
      Object.assign(this.ball, { x: this.player.pos.x - 0.2 * this.player.hand, y: 1.18, z: this.player.pos.z - 0.62 });
      this.#hint(t(this.faults > 0 ? 'hint.secondServe' : 'hint.yourServe'));
    } else {
      this.ai.pos.set(deuce ? -0.9 : 0.9, 0, -COURT.halfL - 0.5);
      // You receive on your right (deuce, +x) or left (advantage, -x) box.
      this.player.pos.set(deuce ? 2.1 : -2.1, 0, COURT.halfL + 1.2);
      this.ballMode = 'held-ai';
      this.#hint(t(this.faults > 0 ? 'hint.cpuSecondServe' : 'hint.cpuServe'));
      this.#after(1.4, () => this.#aiToss());
    }
    this.player.target.copy(this.player.pos);
    this.ai.target.copy(this.ai.pos);
    this.ai.model.rest();
    this.#updateScoreboard();
  }

  #toss() {
    // Leaves your hand (where the ball already is) and rises in front of the racket.
    const p = this.player.pos;
    const b = this.ball;
    b.vx = (p.x + 0.15 * this.player.hand - b.x) / TOSS_APEX;
    b.vz = (p.z - 0.6 - b.z) / TOSS_APEX;
    b.vy = TOSS_VY;
    b.rolling = false;
    this.sfx.whoosh();
    this.ballMode = 'toss';
    this.tossStep = this.step;
    this.#hint(t('hint.hitNow'));
  }

  #playerServe(power, lag) {
    const sinceToss = (this.step - this.tossStep) * DT - lag;
    if (sinceToss < 0.18 || this.ball.y < 1.7) return;
    const quality = clamp(1 - Math.abs(sinceToss - (TOSS_APEX + 0.05)) / 0.42, 0, 1);
    const deuce = this.deuceSide;
    const sx = deuce ? -1 : 1; // opponent's box as seen from your side
    const noise = (1 - quality) * 1.4 + power * 0.3;
    const target = {
      x: sx * rand(0.5, 3.5) + rand(-noise, noise),
      z: -rand(4.6, 6.0) + rand(-noise, noise) * 0.8 - power * 0.35,
    };
    const speed = 26 + power * 14 + quality * 8;
    this.#launch(target, speed, 0.1);
    this.rally = { lastHitter: 'player', bounces: 0, isServe: true, netTouched: false };
    this.phase = 'rally';
    this.ballMode = 'play';
    if (quality > 0.75) this.#afterPlayerContact(power, t('fb.perfectServe'), 'good');
    else this.#afterPlayerContact(power, quality < 0.3 ? t('fb.weakServe') : null, 'meh');
    this.#planAi(true);
  }

  #aiToss() {
    if (this.phase !== 'serve') return;
    const a = this.ai.pos;
    Object.assign(this.ball, { x: a.x - 0.1, y: 1.3, z: a.z + 0.5, vx: 0, vy: TOSS_VY, vz: 0.1, rolling: false });
    this.ballMode = 'toss';
    this.ai.model.swing('toss');
    this.#after(TOSS_APEX + 0.05, () => this.#aiServe());
  }

  #aiServe() {
    if (this.phase !== 'serve') return;
    const d = this.diff;
    const deuce = this.deuceSide;
    const sx = deuce ? 1 : -1; // your box: deuce = your right (+x)
    const target = { x: sx * rand(0.6, 3.4), z: rand(4.4, 5.9) };
    const errChance = this.faults > 0 ? d.serveErr * 0.5 : d.serveErr * 1.6;
    if (Math.random() < errChance) {
      if (Math.random() < 0.6) target.z = rand(6.7, 7.8);
      else target.x = sx * rand(4.4, 5.2);
    }
    const speed = this.faults > 0 ? d.serve * 0.8 : d.serve + rand(-3, 3);
    this.ai.model.swing('serve');
    this.#launch(target, speed, 0.1);
    this.sfx.hit(0.8, 0);
    this.rally = { lastHitter: 'ai', bounces: 0, isServe: true, netTouched: false };
    this.phase = 'rally';
    this.ballMode = 'play';
    this.#hint('');
    this.#planPlayer();
  }

  #launch(target, speed, clearance) {
    const v = solveShot(this.ball, target, speed, clearance);
    this.ball.vx = v.vx;
    this.ball.vy = v.vy;
    this.ball.vz = v.vz;
    this.ball.rolling = false;
    this.lastShotKmh = Math.round(Math.hypot(v.vx, v.vy, v.vz) * 3.6);
  }

  #afterPlayerContact(power, label, kind = 'good') {
    this.sfx.hit(power, 0.3 * this.player.hand);
    this.world.spark(_v.set(this.ball.x, this.ball.y, this.ball.z), 0.6 + power * 0.6);
    this.hud.speed(this.lastShotKmh);
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, this.lastShotKmh);
    if (label) this.hud.feedback(label, kind);
    this.notify({ t: 'hit', p: power });
    this.player.plan = null;
    this.player.target.set(0.3 * this.player.hand, 0, COURT.halfL + 0.9);
    this.player.moveFrom = this.step + 0.15 / DT;
    this.#hint('');
  }

  #playerHit(delta, power) {
    const plan = this.player.plan;
    const aim = clamp(delta / 0.26, -1, 1); // <0 early, >0 late
    const perfect = Math.abs(delta + 0.03) < 0.07;
    const hand = this.player.hand;
    // Early = cross-court, late = down the line (like Wii Sports).
    const target = {
      x: plan.fb * hand * aim * 3.9 + rand(-0.4, 0.4),
      z: -(7.6 + power * 3.9 + rand(-0.5, 0.5)),
    };
    const speed = 16 + power * 14 + (perfect ? 4 : 0);
    this.#launch(target, speed, 0.28);
    this.rally.lastHitter = 'player';
    this.rally.bounces = 0;
    this.rally.isServe = false;
    this.rally.netTouched = false;
    this.pendingHit = null;
    const label = perfect ? t('fb.perfect') : aim < -0.45 ? t('fb.early') : aim > 0.45 ? t('fb.late') : null;
    this.#afterPlayerContact(power, label, perfect ? 'good' : 'meh');
    this.#planAi(false);
  }

  // --- Shot planning ---

  #planPlayer() {
    const pred = predictHit(this.ball, 1, 1.0);
    const p = this.player;
    if (!pred.hit) {
      p.plan = null;
      return;
    }
    const hit = pred.hit;
    const hand = p.hand;
    // Contact ~0.9 m in front and ~0.55 m to the side (your right on a forehand).
    const fore = { x: hit.x - hand * 0.55, z: hit.z + 0.9 };
    const back = { x: hit.x + hand * 0.55, z: hit.z + 0.9 };
    const df = Math.abs(fore.x - p.pos.x) - 0.8;
    const db = Math.abs(back.x - p.pos.x);
    const fb = df <= db ? 1 : -1;
    const stand = fb === 1 ? fore : back;
    stand.z = clamp(stand.z, 1.5, COURT.halfL + 4.5);
    p.plan = { hitStep: this.step + hit.steps, hit, fb, stand };
    p.target.set(stand.x, 0, stand.z);
    p.moveFrom = this.step + 0.1 / DT;
  }

  #planAi(isServe) {
    const pred = predictHit(this.ball, -1, 1.0);
    const a = this.ai;
    a.plan = null;
    a.target.set(0, 0, -COURT.halfL - 0.9);
    if (!pred.hit || !pred.bounce) return;
    const b = pred.bounce;
    const willBeIn = isServe ? inServiceBox(b.x, b.z, -1, this.deuceSide) : inSingles(b.x, b.z);
    if (!willBeIn && (isServe || Math.random() > this.diff.chaseOut)) {
      a.moveFrom = this.step + this.diff.react / DT;
      return; // lets it go
    }
    const hit = pred.hit;
    // The CPU faces +z, so its right is -x.
    const fore = { x: hit.x + 0.55, z: hit.z - 0.75 };
    const back = { x: hit.x - 0.55, z: hit.z - 0.75 };
    const fb = Math.abs(fore.x - a.pos.x) - 0.6 <= Math.abs(back.x - a.pos.x) ? 1 : -1;
    const stand = fb === 1 ? fore : back;
    stand.z = clamp(stand.z, -COURT.halfL - 4.5, -1.5);
    a.plan = { hitStep: this.step + hit.steps, hit, fb, stand, dist: Math.hypot(stand.x - a.pos.x, stand.z - a.pos.z) };
    a.target.set(stand.x, 0, stand.z);
    a.moveFrom = this.step + this.diff.react / DT;
  }

  #aiHit() {
    const a = this.ai;
    const plan = a.plan;
    a.plan = null;
    const off = Math.hypot(a.pos.x - plan.stand.x, a.pos.z - plan.stand.z);
    a.model.swing(plan.fb === 1 ? 'fore' : 'back');
    if (off > 0.55) return; // didn't get there

    const d = this.diff;
    const stretch = clamp(plan.dist / 6, 0, 1);
    const px = this.player.pos.x;
    let tx = Math.random() < 0.6 ? -Math.sign(px || rand(-1, 1)) * rand(1.2, d.wide) : rand(-d.wide, d.wide);
    let tz = rand(7.6, 11.2);
    let clearance = 0.3;
    if (Math.random() < d.err * (1 + stretch * 1.5)) {
      const r = Math.random();
      if (r < 0.45) tz = rand(12.3, 13.8);
      else if (r < 0.8) tx = Math.sign(tx || 1) * rand(4.4, 5.3);
      else clearance = -0.35;
    }
    const speed = rand(d.speed[0], d.speed[1]) * (1 - stretch * 0.25);
    this.#launch({ x: tx, z: tz }, speed, clearance);
    this.sfx.hit(0.7, clamp(this.ball.x / 6, -1, 1) * 0.5);
    this.world.spark(_v.set(this.ball.x, this.ball.y, this.ball.z), 0.8);
    this.rally.lastHitter = 'ai';
    this.rally.bounces = 0;
    this.rally.isServe = false;
    this.rally.netTouched = false;
    a.target.set(0, 0, -COURT.halfL - 0.9);
    a.moveFrom = this.step + 0.25 / DT;
    this.#planPlayer();
  }

  // --- Rules ---

  #onBallEvent(ev) {
    if (ev.type === 'net') {
      this.sfx.net();
      this.rally.netTouched = true;
      return;
    }
    const pan = clamp(ev.x / 8, -1, 1);
    const near = 1 - clamp((COURT.halfL - ev.z) / 30, 0, 0.8);
    this.sfx.bounce(near * clamp(ev.speed / 6, 0.2, 1), pan);
    this.world.bounceFx(ev.x, ev.z, this.ball.vx, this.ball.vz, ev.speed / 6);

    if (this.ballMode === 'toss') return;
    if (this.ballMode !== 'play') return;

    const side = ev.z > 0 ? 1 : -1;
    const r = this.rally;
    const hitterSide = r.lastHitter === 'player' ? 1 : -1;
    const receiver = r.lastHitter === 'player' ? 'ai' : 'player';

    if (r.bounces === 0) {
      if (side === hitterSide) {
        return r.isServe ? this.#fault('call.net') : this.#endPoint(receiver, 'call.net');
      }
      if (r.isServe) {
        const ok = inServiceBox(ev.x, ev.z, side, this.deuceSide);
        if (!ok) return this.#fault('call.fault');
        if (r.netTouched) return this.#let();
      } else if (!inSingles(ev.x, ev.z)) {
        this.sfx.call();
        return this.#endPoint(receiver, 'call.out');
      }
      r.bounces = 1;
      return;
    }
    // Second bounce: the receiver didn't get to it.
    const ace = r.isServe;
    if (r.lastHitter === 'player') {
      if (ace) this.stats.aces++;
      else this.stats.winners++;
    }
    const mine = r.lastHitter === 'player';
    this.#endPoint(r.lastHitter, ace ? (mine ? 'call.ace' : 'call.cpuAce') : mine ? 'call.winner' : 'call.cpuPoint');
  }

  #let() {
    this.ballMode = 'dead';
    this.phase = 'between';
    this.hud.toast(t('call.let'), t('call.replay'));
    this.#after(1.3, () => this.#startPoint());
  }

  #fault(callKey) {
    this.ballMode = 'dead';
    this.phase = 'between';
    this.player.plan = null;
    this.ai.plan = null;
    this.pendingHit = null;
    if (this.faults === 0) {
      this.faults = 1;
      this.hud.toast(t(callKey), t('call.secondServe'));
      this.sfx.call();
      this.#after(1.5, () => this.#startPoint());
    } else {
      const receiver = this.server === 'player' ? 'ai' : 'player';
      this.#endPoint(receiver, 'call.doubleFault');
    }
  }

  #endPoint(winner, callKey) {
    this.ballMode = 'dead';
    this.phase = 'between';
    this.player.plan = null;
    this.ai.plan = null;
    this.pendingHit = null;
    this.faults = 0;
    this.player.target.copy(this.player.pos);
    this.ai.target.copy(this.ai.pos);

    const w = winner === 'player' ? 0 : 1;
    const result = this.#awardPoint(w);
    const mine = w === 0;
    if (mine) this.sfx.cheer(callKey === 'call.ace' || callKey === 'call.winner' ? 1 : 0.6);
    else this.sfx.groan();
    this.excitement = mine ? 1 : 0.35;

    const label = t(callKey);
    const games = `${this.score.games[0]}-${this.score.games[1]}`;
    const sub = result.matchOver
      ? t(mine ? 'score.youWinMatch' : 'score.cpuWinsMatch')
      : result.gameOver
        ? t(mine ? 'score.gameYou' : 'score.gameCpu', { g: games })
        : this.#scoreCall();
    this.hud.toast(label, sub, mine ? 'good' : 'bad');
    this.notify({ t: 'point', win: mine, text: `${label} ${sub}` });
    this.#updateScoreboard();

    if (result.matchOver) {
      this.#after(2.6, () => {
        this.phase = 'over';
        this.ballMode = 'hidden';
        this.hud.matchOver(mine, this.score.games, this.stats);
        this.notify({ t: 'over', win: mine });
      });
    } else {
      this.#after(2.2, () => this.#startPoint());
    }
  }

  #awardPoint(w) {
    const l = 1 - w;
    const s = this.score;
    s.points[w]++;
    if (s.points[w] >= 4 && s.points[w] - s.points[l] >= 2) {
      s.games[w]++;
      s.points = [0, 0];
      this.server = this.server === 'player' ? 'ai' : 'player';
      const target = this.settings.games;
      const gw = s.games[w];
      const gl = s.games[l];
      const matchOver = (gw >= target && gw - gl >= 2) || gw >= target + 1 || (target === 1 && gw === 1);
      return { gameOver: true, matchOver };
    }
    return { gameOver: false, matchOver: false };
  }

  #scoreCall() {
    const [a, b] = this.score.points;
    if (a >= 3 && b >= 3) {
      if (a === b) return t('score.deuce');
      return t(a > b ? 'score.advYou' : 'score.advCpu');
    }
    // The server's score is called first.
    const [s, r] = this.server === 'player' ? [a, b] : [b, a];
    if (s === r && s > 0) return t('score.all', { p: POINT_NAMES[s] });
    return `${POINT_NAMES[s]} - ${POINT_NAMES[r]}`;
  }

  #pointLabel(i) {
    const [a, b] = this.score.points;
    const me = i === 0 ? a : b;
    const other = i === 0 ? b : a;
    if (a >= 3 && b >= 3) return me > other ? 'AD' : me === other ? '40' : '';
    return POINT_NAMES[Math.min(me, 3)];
  }

  #updateScoreboard() {
    this.hud.score({
      games: this.score.games,
      points: [this.#pointLabel(0), this.#pointLabel(1)],
      server: this.server,
      difficulty: this.diff ? `${t(`diff.${this.settings.difficulty}`)} · ${t(`surface.${this.settings.surface}`)}` : '',
    });
  }

  #hint(text) {
    this.hud.hint(text);
    this.notify({ t: 'hint', text });
  }

  #after(seconds, fn) {
    this.timers.push({ at: this.step + Math.round(seconds / DT), fn });
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.#fixedStep();
    }
    this.excitement = Math.max(0, this.excitement - dt * 0.45);
    this.#updateVisuals(dt);
  }

  #fixedStep() {
    this.step++;

    if (this.timers.length) {
      const due = this.timers.filter((timer) => timer.at <= this.step);
      if (due.length) {
        this.timers = this.timers.filter((timer) => timer.at > this.step);
        due.forEach((timer) => timer.fn());
      }
    }

    if (this.ballMode === 'toss' || this.ballMode === 'play' || this.ballMode === 'dead') {
      const ev = stepBall(this.ball, DT, true);
      if (ev) this.#onBallEvent(ev);
      if (this.ballMode === 'toss' && this.ball.vy < 0 && this.ball.y < 1.1 && this.phase === 'serve') {
        // Tossed but never hit: toss again, no fault.
        if (this.server === 'player') {
          this.ballMode = 'held-player';
          this.#hint(t('hint.tossAgain'));
        }
      }
    }

    if (this.pendingHit && this.step >= this.pendingHit.step) {
      const { delta, power } = this.pendingHit;
      this.pendingHit = null;
      if (this.phase === 'rally' && this.ballMode === 'play' && this.player.plan) this.#playerHit(delta, power);
    }

    if (this.ai.plan && this.step >= this.ai.plan.hitStep && this.ballMode === 'play') this.#aiHit();

    const p = this.player;
    if (p.plan && this.step > p.plan.hitStep + 0.3 / DT) {
      p.plan = null; // it got past us
    }

    this.#move(p, PLAYER_SPEED);
    this.#move(this.ai, this.diff?.move ?? 5);
  }

  #move(who, maxSpeed) {
    if (this.step < who.moveFrom || this.phase === 'serve') {
      who.speed = 0;
      return;
    }
    const dx = who.target.x - who.pos.x;
    const dz = who.target.z - who.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-3) {
      who.speed = 0;
      return;
    }
    const step = Math.min(dist, maxSpeed * DT);
    who.pos.x += (dx / dist) * step;
    who.pos.z += (dz / dist) * step;
    who.speed = step / DT;
  }

  #updateVisuals(dt) {
    const cam = this.world.camera;
    const p = this.player;
    const hand = p.hand;

    // --- Camera ---
    const inMenu = this.phase === 'menu';
    this.racketRoot.visible = !inMenu;
    this.forearm.group.visible = !inMenu;
    if (inMenu) {
      // Slow TV-broadcast sweep to show off the chosen court
      // (stays inside the walls, never flies into the stands).
      const a = Math.sin(this.time * 0.12) * 1.1;
      cam.position.set(Math.sin(a) * 8.5, 7 + Math.cos(this.time * 0.17) * 1.2, 12 + Math.cos(a) * 6);
      this.look.set(Math.sin(a) * 2, 0.3, -3);
      cam.lookAt(this.look);
    } else {
      // Your eyes
      this.bob += dt * p.speed * 2.2;
      const bobY = Math.sin(this.bob) * 0.03 * Math.min(p.speed / 4, 1);
      _v.set(p.pos.x, EYE_H + bobY, p.pos.z);
      cam.position.lerp(_v, 1 - Math.exp(-dt * 16));

      const lookTarget = new THREE.Vector3();
      const watchingToss = this.ballMode === 'toss' && this.server === 'player' && this.phase === 'serve';
      if (watchingToss) {
        lookTarget.set(this.ball.x, this.ball.y + 0.2, this.ball.z - 0.8);
      } else {
        const bx = this.ballMode === 'play' ? this.ball.x : 0;
        lookTarget.set(THREE.MathUtils.lerp(p.pos.x * 0.35, bx, 0.3), 0.55, p.pos.z - 16);
      }
      this.look.lerp(lookTarget, 1 - Math.exp(-dt * (watchingToss ? 9 : 5)));
      cam.lookAt(this.look);
    }
    cam.updateMatrixWorld();

    // --- Racket ---
    if (this.phoneQ && !this.fakeSwing) {
      this.racketQ.slerp(this.phoneQ, 1 - Math.exp(-dt * 30));
    } else {
      this.racketQ.slerp(this.#mouseRacketPose(dt), this.fakeSwing ? 1 : 1 - Math.exp(-dt * 14));
    }
    // Hand on your right (left if left-handed) without leaving narrow screens.
    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
    const handPos = _v.set(Math.min(0.33, 0.55 * halfW * 0.62) * hand, -0.38, -0.55);
    cam.localToWorld(handPos);
    this.racketRoot.position.copy(handPos);
    this.racketRoot.quaternion.copy(this.racketQ);
    // Forearm: from your fist to an off-screen elbow (down and to the side).
    this.racketRoot.updateMatrixWorld(true);
    const wrist = this.fist.localToWorld(new THREE.Vector3(0, 0.01, 0));
    const elbow = cam.localToWorld(new THREE.Vector3(0.45 * hand, -0.85, 0.1));
    this.forearm.update(wrist, elbow);

    // --- Ball ---
    let bx = this.ball.x;
    let by = this.ball.y;
    let bz = this.ball.z;
    if (this.ballMode === 'held-player') {
      const hp = new THREE.Vector3(-0.2 * hand, -0.27, -0.62);
      cam.localToWorld(hp);
      ({ x: bx, y: by, z: bz } = hp);
      Object.assign(this.ball, { x: bx, y: by, z: bz });
    } else if (this.ballMode === 'held-ai') {
      bx = this.ai.pos.x + 0.3;
      by = 1.0;
      bz = this.ai.pos.z + 0.25;
    }
    const visible = this.ballMode !== 'hidden';
    this.world.setBall(bx, by, bz, { visible, trailOn: this.ballMode === 'play' || this.ballMode === 'dead' });

    // --- CPU ---
    const a = this.ai;
    a.model.root.position.copy(a.pos);
    const face = Math.atan2(this.ball.x - a.pos.x, Math.max(2, this.ball.z - a.pos.z));
    a.model.root.rotation.y = THREE.MathUtils.lerp(a.model.root.rotation.y, clamp(face, -0.8, 0.8), 1 - Math.exp(-dt * 6));
    a.model.update(dt, a.speed);
  }

  /** Racket pose when playing with the mouse (no phone). */
  #mouseRacketPose(dt) {
    const hand = this.player.hand;
    if (this.fakeSwing) {
      const s = this.fakeSwing;
      s.t += dt;
      const k = Math.min(s.t / 0.26, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const dir = s.fb * hand; // +1 = right-handed forehand
      const yaw = THREE.MathUtils.lerp(-1.8, 1.9, e) * dir;
      const roll = (-Math.PI / 2) * dir;
      if (k >= 1) this.fakeSwing = null;
      return racketPose(yaw, roll, Math.PI / 2 - 0.15);
    }
    // At rest the racket leans toward the side the ball is coming to.
    const side = (this.player.plan?.fb ?? 1) * hand;
    const yaw = -this.pointer.x * 0.9;
    const roll = (side > 0 ? -0.55 * hand : 0.15 * hand) + this.pointer.x * 0.3;
    const tilt = Math.PI / 2 - 0.25 + this.pointer.y * 0.6;
    return racketPose(yaw, roll, tilt);
  }

  get excitementLevel() {
    return this.excitement;
  }

  backToMenu() {
    this.timers = [];
    this.#placeForMenu();
  }
}
