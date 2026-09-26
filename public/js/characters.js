// Rackets (yours, in first person), your hand, and the Mii-style CPU opponent.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------------------
// Racket
// ---------------------------------------------------------------------------

/** Available designs. paint = frame face, side = frame edge, stripe = accent stripe. */
export const RACKET_SKINS = {
  classic: {
    paint: 0xd62839,
    side: 0x1b1b1f,
    stripe: 0xffffff,
    guard: 0x1b1b1f,
    grip: '#f2f1ec',
    gripLine: '#c8c6bd',
    cap: 0xd62839,
    strings: '#f4f0e2',
    logo: '#d62839',
  },
  pro: {
    paint: 0x1c1e23,
    side: 0x3a3e47,
    stripe: 0xdff23a,
    guard: 0x0f1012,
    grip: '#1d1d1f',
    gripLine: '#3b3b40',
    cap: 0xdff23a,
    strings: '#dff23a',
    logo: '#1c1e23',
  },
  ocean: {
    paint: 0x1f6fd1,
    side: 0x0b1d33,
    stripe: 0x7fd6ff,
    guard: 0x0b1d33,
    grip: '#0e2440',
    gripLine: '#24466e',
    cap: 0x7fd6ff,
    strings: '#ffffff',
    logo: '#1f6fd1',
  },
  neon: {
    paint: 0xff4fa3,
    side: 0x6a1fc9,
    stripe: 0xdff23a,
    guard: 0x2a1040,
    grip: '#ffffff',
    gripLine: '#ffc4e0',
    cap: 0x6a1fc9,
    strings: '#ffffff',
    logo: '#6a1fc9',
  },
};

export const hexToCss = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

// Dimensions (m). Handle at the origin, head toward +Y, strings on the XY plane.
const HEAD_CY = 0.5;
const IN_RX = 0.118;
const IN_RY = 0.155;
const OUT_RX = 0.132;
const OUT_RY = 0.169;
const BEAM = 0.018;
const BEVEL = 0.002;

function ellipsePath(path, rx, ry, clockwise = false) {
  path.absellipse(0, HEAD_CY, rx, ry, 0, Math.PI * 2, clockwise);
  return path;
}

function extrude(shape, depth, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 72,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

let geos = null;

function racketGeometries() {
  if (geos) return geos;

  // Head hoop
  const ring = ellipsePath(new THREE.Shape(), OUT_RX, OUT_RY);
  ring.holes.push(ellipsePath(new THREE.Path(), IN_RX, IN_RY, true));

  // Open throat: two arms leave the shaft and wrap into the hoop.
  const t0 = Math.PI + Math.asin((HEAD_CY - 0.4) / 0.162);
  const throat = new THREE.Shape();
  throat.moveTo(-0.016, 0.12);
  throat.lineTo(-0.016, 0.2);
  throat.quadraticCurveTo(-0.045, 0.27, 0.125 * Math.cos(t0), 0.4);
  throat.absellipse(0, HEAD_CY, 0.125, 0.162, t0, 3 * Math.PI - t0, false);
  throat.quadraticCurveTo(0.045, 0.27, 0.016, 0.2);
  throat.lineTo(0.016, 0.12);
  throat.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0, 0.232);
  hole.quadraticCurveTo(-0.03, 0.285, -0.052, 0.33);
  hole.lineTo(0.052, 0.33);
  hole.quadraticCurveTo(0.03, 0.285, 0, 0.232);
  throat.holes.push(hole);

  // Accent stripe around the frame edge
  const stripe = ellipsePath(new THREE.Shape(), OUT_RX + 0.0029, OUT_RY + 0.0029);
  stripe.holes.push(ellipsePath(new THREE.Path(), OUT_RX - 0.003, OUT_RY - 0.003, true));

  // Bumper guard on top
  const guardPts = [];
  for (let i = 0; i <= 40; i++) {
    const t = 0.5 + ((Math.PI - 1) * i) / 40;
    guardPts.push(new THREE.Vector3((OUT_RX + 0.003) * Math.cos(t), HEAD_CY + (OUT_RY + 0.003) * Math.sin(t), 0));
  }

  // String bed with UVs normalized to the oval
  const bed = new THREE.ShapeGeometry(ellipsePath(new THREE.Shape(), IN_RX - 0.001, IN_RY - 0.001), 48);
  const uv = bed.attributes.uv;
  const pos = bed.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + IN_RX) / (2 * IN_RX), (pos.getY(i) - (HEAD_CY - IN_RY)) / (2 * IN_RY));
  }

  geos = {
    ring: extrude(ring, BEAM, BEVEL),
    throat: extrude(throat, BEAM, BEVEL),
    stripe: extrude(stripe, 0.005, 0),
    guard: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(guardPts), 60, 0.0062, 8),
    bed,
    grip: new THREE.CylinderGeometry(0.0172, 0.0172, 0.19, 8, 1),
    butt: new THREE.CylinderGeometry(0.0196, 0.0178, 0.016, 8),
    collar: new THREE.CylinderGeometry(0.0182, 0.0176, 0.012, 8),
  };
  return geos;
}

const texCache = new Map();

function stringsTexture(skin) {
  const key = `s:${skin.strings}:${skin.logo}`;
  if (texCache.has(key)) return texCache.get(key);
  const W = 512;
  const H = Math.round((W * IN_RY) / IN_RX);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.strokeStyle = skin.strings;
  g.lineWidth = 4;
  const mains = 16;
  const crosses = 19;
  g.beginPath();
  for (let i = 0; i < mains; i++) {
    const x = ((i + 0.5) / mains) * W;
    g.moveTo(x, 0);
    g.lineTo(x, H);
  }
  for (let j = 0; j < crosses; j++) {
    const y = ((j + 0.5) / crosses) * H;
    g.moveTo(0, y);
    g.lineTo(W, y);
  }
  g.stroke();
  // Stencil logo painted only onto the strings
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = skin.logo;
  g.font = `900 ${Math.round(W * 0.42)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TT', W / 2, H / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  texCache.set(key, tex);
  return tex;
}

function gripTexture(skin) {
  const key = `g:${skin.grip}:${skin.gripLine}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = skin.grip;
  g.fillRect(0, 0, 64, 256);
  // Overgrip wrapped in a spiral
  g.strokeStyle = skin.gripLine;
  g.lineWidth = 3;
  for (let y = -64; y < 320; y += 26) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y - 22);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1.5);
  texCache.set(key, tex);
  return tex;
}

/** Reflection map (a lit "room") so the paint has something to shine with. */
export function createEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return tex;
}

/**
 * Racket with the handle at the origin, head toward +Y and strings on the XY
 * plane (normal ±Z). About 0.69 m long, like a real one.
 */
export function createRacket(skinName = 'classic', { envMap = null } = {}) {
  const g = racketGeometries();
  const group = new THREE.Group();

  // Glossy paint: the clearcoat gives the shine; keep the env map low so dark colors don't turn silver.
  const gloss = { roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12, envMap, envMapIntensity: 0.22 };
  const paint = new THREE.MeshPhysicalMaterial(gloss);
  const side = new THREE.MeshPhysicalMaterial(gloss);
  const stripe = new THREE.MeshStandardMaterial({ roughness: 0.35, envMap, envMapIntensity: 0.3 });
  const guard = new THREE.MeshStandardMaterial({ roughness: 0.65 });
  const grip = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const cap = new THREE.MeshPhysicalMaterial(gloss);
  const strings = new THREE.MeshStandardMaterial({
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.5,
  });

  // ExtrudeGeometry: group 0 = faces, group 1 = edges.
  group.add(new THREE.Mesh(g.ring, [paint, side]));
  group.add(new THREE.Mesh(g.throat, [paint, side]));
  group.add(new THREE.Mesh(g.stripe, stripe));
  const guardMesh = new THREE.Mesh(g.guard, guard);
  guardMesh.scale.z = 1.7;
  group.add(guardMesh);
  group.add(new THREE.Mesh(g.bed, strings));

  const gripMesh = new THREE.Mesh(g.grip, grip);
  gripMesh.position.y = 0.025;
  group.add(gripMesh);
  const butt = new THREE.Mesh(g.butt, cap);
  butt.position.y = -0.076;
  group.add(butt);
  const collar = new THREE.Mesh(g.collar, stripe);
  collar.position.y = 0.124;
  group.add(collar);

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  function setSkin(name) {
    const skin = RACKET_SKINS[name] || RACKET_SKINS.classic;
    paint.color.setHex(skin.paint);
    side.color.setHex(skin.side);
    stripe.color.setHex(skin.stripe);
    guard.color.setHex(skin.guard);
    cap.color.setHex(skin.cap);
    grip.map = gripTexture(skin);
    strings.map = stringsTexture(skin);
    grip.needsUpdate = true;
    strings.needsUpdate = true;
  }
  setSkin(skinName);

  group.userData.setSkin = setSkin;
  group.userData.headCenter = new THREE.Vector3(0, HEAD_CY, 0);
  return group;
}

// ---------------------------------------------------------------------------
// Hand and forearm (first person)
// ---------------------------------------------------------------------------

/** Fist closed around the handle, in racket coordinates. */
export function createFist(tone = 0xf0c29c) {
  const skin = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.7 });
  const fist = new THREE.Group();
  fist.scale.setScalar(0.92);
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.05, 6, 16), skin);
  palm.scale.set(1.18, 1, 1.12);
  palm.position.set(0, 0.03, 0.002);
  fist.add(palm);
  // Knuckles
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), skin);
    k.position.set(0.026, 0.058 - i * 0.019, 0.02);
    fist.add(k);
  }
  // Thumb wrapped across the front
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 4, 8), skin);
  thumb.position.set(-0.012, 0.055, 0.033);
  thumb.rotation.z = -0.9;
  fist.add(thumb);
  fist.traverse((o) => o.isMesh && (o.castShadow = true));
  return fist;
}

/** Forearm with a wristband, stretched every frame between hand and elbow. */
export function createForearm(tone = 0xf0c29c, band = 0xffffff) {
  const group = new THREE.Group();
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.033, 0.042, 1, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: tone, roughness: 0.75 }),
  );
  arm.geometry.translate(0, 0.5, 0);
  group.add(arm);
  const bandMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.039, 0.04, 0.06, 14),
    new THREE.MeshStandardMaterial({ color: band, roughness: 0.9 }),
  );
  bandMesh.position.y = 0.07;
  group.add(bandMesh);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  function update(from, to) {
    dir.subVectors(to, from);
    const len = dir.length();
    group.position.copy(from);
    group.quaternion.setFromUnitVectors(up, dir.divideScalar(len));
    arm.scale.y = len;
  }
  return { group, update, setBand: (hex) => bandMesh.material.color.setHex(hex) };
}

const SKIN = 0xf1c7a0;

/** CPU opponent. Faces +Z (toward you). */
export function createOpponent({
  shirt = 0x2a9d8f,
  shorts = 0xf8f9fa,
  hair = 0x3b2417,
  band = 0xe63946,
  racketSkin = 'ocean',
  envMap = null,
} = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const skinMat = mat(SKIN, 0.7);

  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1, 0.72, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), skinMat);
    leg.position.y = -0.36;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), mat(0xffffff, 0.4));
    shoe.position.set(0, -0.68, 0.04);
    pivot.add(leg, shoe);
    body.add(pivot);
    legs.push(pivot);
  }

  const shortsMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.26, 12), mat(shorts));
  shortsMesh.position.y = 0.78;
  body.add(shortsMesh);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.36, 4, 12), mat(shirt, 0.55));
  torso.position.y = 1.14;
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = 1.6;
  body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skinMat));
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.168, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
    mat(hair, 0.9),
  );
  hairMesh.rotation.x = -0.25;
  head.add(hairMesh);
  const headband = new THREE.Mesh(new THREE.TorusGeometry(0.162, 0.022, 6, 24), mat(band));
  headband.rotation.x = Math.PI / 2 - 0.2;
  headband.position.y = 0.05;
  head.add(headband);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mat(0x111111, 0.3));
    eye.position.set(s * 0.055, 0.02, 0.145);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), skinMat);
  nose.position.set(0, -0.02, 0.16);
  head.add(nose);

  // Left arm (the CPU's, at +x)
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), skinMat);
  armL.position.set(0.27, 1.13, 0);
  armL.rotation.z = 0.25;
  body.add(armL);

  // Right arm with the racket (the CPU's right is -x because it faces +z)
  const armPivot = new THREE.Group();
  armPivot.rotation.order = 'YXZ';
  armPivot.position.set(-0.25, 1.36, 0);
  body.add(armPivot);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.44, 4, 8), skinMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.x = -0.28;
  armPivot.add(arm);
  const racket = createRacket(racketSkin, { envMap });
  racket.rotation.z = Math.PI / 2; // head points to -x (outward)
  racket.position.x = -0.56;
  armPivot.add(racket);

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  // --- Animation ---
  const anim = { swing: null, run: 0, t: 0 };

  function swing(kind) {
    // kind: 'fore' | 'back' | 'serve' | 'toss' (the toss pose is held until the serve)
    anim.swing = { kind, t: 0, dur: kind === 'serve' ? 0.4 : 0.36 };
  }

  function rest() {
    anim.swing = null;
  }

  const ease = (x) => 1 - Math.pow(1 - x, 3);

  function update(dt, speed) {
    anim.t += dt;
    anim.run = THREE.MathUtils.lerp(anim.run, Math.min(speed / 5, 1), 1 - Math.exp(-dt * 10));
    const phase = anim.t * 13;
    legs[0].rotation.x = Math.sin(phase) * 0.7 * anim.run;
    legs[1].rotation.x = -Math.sin(phase) * 0.7 * anim.run;
    body.position.y = Math.abs(Math.sin(phase)) * 0.06 * anim.run;
    body.rotation.x = 0.12 * anim.run;

    // yaw swings the arm around the body; droop raises (<0) or lowers (>0) it.
    let yaw = 0.5;
    let droop = 0.55;
    const s = anim.swing;
    if (s) {
      s.t += dt;
      const k = Math.min(s.t / s.dur, 1);
      const e = ease(k);
      if (s.kind === 'fore') {
        yaw = THREE.MathUtils.lerp(-1.6, 2.0, e);
        droop = 0.15;
      } else if (s.kind === 'back') {
        yaw = THREE.MathUtils.lerp(4.7, 1.3, e);
        droop = 0.15;
      } else if (s.kind === 'toss') {
        yaw = 1.2;
        droop = -2.0;
      } else {
        yaw = 1.2;
        droop = THREE.MathUtils.lerp(-2.2, 0.8, e);
      }
      if (k >= 1 && s.kind !== 'toss') anim.swing = null;
    }
    const snap = s && s.kind !== 'toss';
    const k = 1 - Math.exp(-dt * 8);
    armPivot.rotation.y = snap ? yaw : THREE.MathUtils.lerp(armPivot.rotation.y, yaw, k);
    armPivot.rotation.z = snap ? droop : THREE.MathUtils.lerp(armPivot.rotation.z, droop, k);
  }

  return { root, swing, rest, update, racket };
}
