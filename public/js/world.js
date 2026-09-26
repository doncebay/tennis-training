// 3D scene: stadium, court (hard, clay or grass), net, crowd, ball and camera.
import * as THREE from 'three';
import { COURT, BALL_R, netHeight, setSurface as setPhysicsSurface } from './physics.js';
import { createEnvMap } from './characters.js';

const AREA_W = 20; // visible surface around the court (m)
const AREA_L = 37;
const PX = 100; // pixels per meter in the court texture

/** Stadium look for each surface. */
const THEMES = {
  hard: { ground: 0x2f5a3f, wall: 0x14365c, banner: ['#14365c', '#ffffff'], rough: 0.8, dust: null, marks: false },
  clay: { ground: 0x24452f, wall: 0x1c4a32, banner: ['#1c4a32', '#f3ede0'], rough: 1, dust: 0xd9895a, marks: true },
  grass: { ground: 0x27472a, wall: 0x3a2466, banner: ['#3a2466', '#efe9ff'], rough: 0.95, dust: 0xb5d69a, marks: false },
};

let noiseTile = null;
function noisePattern(g) {
  if (!noiseTile) {
    noiseTile = document.createElement('canvas');
    noiseTile.width = noiseTile.height = 256;
    const ng = noiseTile.getContext('2d');
    const img = ng.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 96 + Math.random() * 64;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ng.putImageData(img, 0, 0);
  }
  return g.createPattern(noiseTile, 'repeat');
}

function courtTexture(renderer, surface) {
  const c = document.createElement('canvas');
  c.width = AREA_W * PX;
  c.height = AREA_L * PX;
  const g = c.getContext('2d');
  const u = (x) => (x + AREA_W / 2) * PX;
  const v = (z) => (z + AREA_L / 2) * PX;
  const { halfL, halfW, halfDW, service } = COURT;

  const grain = (alpha, mode = 'overlay') => {
    g.save();
    g.globalAlpha = alpha;
    g.globalCompositeOperation = mode;
    g.fillStyle = noisePattern(g);
    g.fillRect(0, 0, c.width, c.height);
    g.restore();
  };
  // Worn (oval) patch where players stand most
  const wear = (x, z, rx, rz, color) => {
    g.save();
    g.translate(u(x), v(z));
    g.scale(rx * PX, rz * PX);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  if (surface === 'clay') {
    g.fillStyle = '#c4643c';
    g.fillRect(0, 0, c.width, c.height);
    // Drag-net brushing streaks
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,215,180,0.05)' : 'rgba(90,30,10,0.05)';
      g.fillRect(0, Math.random() * c.height, c.width, 2 + Math.random() * 6);
    }
    for (const s of [-1, 1]) {
      wear(0, s * (halfL + 0.8), 4.8, 2.2, 'rgba(236,168,120,0.35)');
      wear(s * 1.2, s * (halfL - 0.2), 1.6, 1.0, 'rgba(236,168,120,0.25)');
    }
  } else if (surface === 'grass') {
    g.fillStyle = '#4b8b39';
    g.fillRect(0, 0, c.width, c.height);
    // Mowing stripes
    const band = 1.2;
    for (let z = -AREA_L / 2, i = 0; z < AREA_L / 2; z += band, i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,220,0.08)' : 'rgba(0,30,0,0.07)';
      g.fillRect(0, v(z), c.width, band * PX);
    }
    // Worn grass behind the baseline
    for (const s of [-1, 1]) {
      wear(0, s * (halfL + 0.7), 3.6, 1.5, 'rgba(160,130,75,0.6)');
      wear(0, s * (halfL - 0.4), 1.8, 0.8, 'rgba(170,140,85,0.4)');
    }
  } else {
    g.fillStyle = '#3f7f5f';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#2d5d9f';
    g.fillRect(u(-halfDW - 0.6), v(-halfL - 0.9), (halfDW + 0.6) * 2 * PX, (halfL + 0.9) * 2 * PX);
  }
  if (surface !== 'clay') grain(surface === 'grass' ? 0.35 : 0.2);

  g.fillStyle = surface === 'clay' ? 'rgba(246,242,234,0.95)' : '#f4f6f8';
  const line = (x1, z1, x2, z2, w = 0.05) => {
    if (x1 === x2) g.fillRect(u(x1 - w / 2), v(z1), w * PX, (z2 - z1) * PX);
    else g.fillRect(u(x1), v(z1 - w / 2), (x2 - x1) * PX, w * PX);
  };
  for (const s of [-1, 1]) {
    line(-halfDW, s * (halfL - 0.05), halfDW, s * (halfL - 0.05), 0.1); // baseline
    line(s * halfDW, -halfL, s * halfDW, halfL); // doubles sideline
    line(s * halfW, -halfL, s * halfW, halfL); // singles sideline
    line(-halfW, s * service, halfW, s * service); // service line
    line(0, s * halfL - (s > 0 ? 0.15 : 0), 0, s * halfL + (s > 0 ? 0 : 0.15)); // center mark
  }
  line(0, -service, 0, service); // center service line

  // On clay the dust dirties the lines too.
  if (surface === 'clay') grain(0.55, 'soft-light');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(20,20,24,0.9)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12.8 / 0.045, 1.07 / 0.045);
  tex.anisotropy = 8;
  return tex;
}

function bannerTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 640; // 12 m x 1.2 m of wall per repeat
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = 'bold 34px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, c.width / 2, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3a78c4');
  grad.addColorStop(0.55, '#8fc1ea');
  grad.addColorStop(1, '#dcebf5');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildNet(scene) {
  const group = new THREE.Group();
  const width = COURT.postX * 2;
  const geo = new THREE.PlaneGeometry(width, 1, 64, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setY(i, pos.getY(i) > 0 ? netHeight(x) - 0.03 : 0.02);
  }
  geo.computeVertexNormals();
  const net = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: netTexture(),
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      color: 0x222222,
    }),
  );
  group.add(net);

  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const x = -COURT.postX + (width * i) / 40;
    pts.push(new THREE.Vector3(x, netHeight(x) - 0.015, 0));
  }
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.6 });
  const tape = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.028, 6), white);
  tape.castShadow = true;
  group.add(tape);

  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, COURT.netH, 0.01), white);
  strap.position.y = COURT.netH / 2;
  group.add(strap);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x1e3a2c, roughness: 0.4, metalness: 0.4 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, COURT.postH + 0.04, 10), postMat);
    post.position.set(s * COURT.postX, (COURT.postH + 0.04) / 2, 0);
    post.castShadow = true;
    group.add(post);
  }
  scene.add(group);
}

function buildUmpire(scene) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1e3a2c, roughness: 0.6 });
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), mat);
    leg.position.set(x, 0.95, z);
    group.add(leg);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), mat);
  seat.position.y = 1.9;
  group.add(seat);
  const person = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.45, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x14213d }),
  );
  person.position.y = 2.35;
  group.add(person);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd9a77f }));
  head.position.y = 2.82;
  group.add(head);
  group.traverse((o) => o.isMesh && (o.castShadow = true));
  group.position.set(-(COURT.postX + 1.1), 0, 0);
  scene.add(group);
}

function buildStadium(scene) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x14365c, roughness: 0.8 });
  const bannerMats = [];
  const standMat = new THREE.MeshStandardMaterial({ color: 0x3b4b5c, roughness: 0.9 });
  const zEnd = AREA_L / 2 + 0.2;
  const xSide = AREA_W / 2 + 0.2;

  // Walls with generic ad boards
  const addWall = (w, x, z, ry) => {
    const bannerMat = new THREE.MeshStandardMaterial();
    bannerMat.userData.repeat = w / 12;
    bannerMats.push(bannerMat);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.2), [wallMat, wallMat, wallMat, wallMat, bannerMat, wallMat]);
    wall.position.set(x, 0.6, z);
    wall.rotation.y = ry;
    scene.add(wall);
  };
  addWall(AREA_W + 0.6, 0, -zEnd, 0);
  addWall(AREA_W + 0.6, 0, zEnd, Math.PI);
  addWall(AREA_L, -xSide, 0, Math.PI / 2);
  addWall(AREA_L, xSide, 0, -Math.PI / 2);

  // Stands (far end and sides; the one behind you is never visible)
  const rows = 12;
  const seats = [];
  const stands = [
    { len: AREA_W + 8, origin: new THREE.Vector3(0, 0, -zEnd - 0.6), out: new THREE.Vector3(0, 0, -1), along: new THREE.Vector3(1, 0, 0) },
    { len: AREA_L + 6, origin: new THREE.Vector3(-xSide - 0.6, 0, -2), out: new THREE.Vector3(-1, 0, 0), along: new THREE.Vector3(0, 0, 1) },
    { len: AREA_L + 6, origin: new THREE.Vector3(xSide + 0.6, 0, -2), out: new THREE.Vector3(1, 0, 0), along: new THREE.Vector3(0, 0, 1) },
  ];
  for (const st of stands) {
    for (let r = 0; r < rows; r++) {
      const h = 1.3 + r * 0.45;
      const center = st.origin.clone().addScaledVector(st.out, r * 0.85 + 0.4);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(st.along.x ? st.len : 0.85, h, st.along.z ? st.len : 0.85),
        standMat,
      );
      step.position.set(center.x, h / 2, center.z);
      step.receiveShadow = true;
      scene.add(step);
      for (let s = -st.len / 2 + 0.4; s < st.len / 2 - 0.3; s += 0.55) {
        if (Math.random() < 0.12) continue; // empty seats
        const p = center.clone().addScaledVector(st.along, s + (Math.random() - 0.5) * 0.08);
        p.y = h;
        seats.push({ p, face: st.out.clone().negate(), phase: Math.random() * Math.PI * 2 });
      }
    }
  }

  const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.3, 3, 6);
  const headGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), seats.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), seats.length);
  const shirts = [0xe63946, 0xf1faee, 0xa8dadc, 0x457b9d, 0x2a9d8f, 0xf4a261, 0x8338ec, 0x6c757d, 0x222222];
  const skins = [0xf1c7a0, 0xd9a77f, 0xa5754f, 0x6f4a2f, 0xf6d5b8];
  const col = new THREE.Color();
  seats.forEach((s, i) => {
    // Muted colors so the ball never gets lost against the crowd.
    col.setHex(shirts[i % shirts.length]);
    const hsl = col.getHSL({});
    bodies.setColorAt(i, col.setHSL(hsl.h, hsl.s * 0.45, hsl.l * 0.62 + (Math.random() - 0.5) * 0.06));
    heads.setColorAt(i, col.setHex(skins[Math.floor(Math.random() * skins.length)]));
  });
  scene.add(bodies, heads);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  function updateCrowd(time, excitement) {
    seats.forEach((s, i) => {
      const jump = excitement > 0 ? Math.max(0, Math.sin(time * 9 + s.phase)) * 0.35 * excitement : 0;
      const sway = Math.sin(time * 1.3 + s.phase) * 0.02;
      pos.set(s.p.x, s.p.y + 0.32 + jump + sway, s.p.z);
      m.compose(pos, q, scale);
      bodies.setMatrixAt(i, m);
      pos.y += 0.37;
      m.compose(pos, q, scale);
      heads.setMatrixAt(i, m);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }
  updateCrowd(0, 0);

  // Floodlight towers
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a939e, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.5 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (xSide + 12);
      const z = sz * (zEnd + 2);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 22, 8), poleMat);
      pole.position.set(x, 11, z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 0.4), lampMat);
      lamp.position.set(x, 22.5, z);
      lamp.lookAt(0, 0, 0);
      scene.add(pole, lamp);
    }
  }

  function setTheme(theme) {
    wallMat.color.setHex(theme.wall);
    const banner = bannerTexture('TENNIS TRAINING  •  WEB CUP', ...theme.banner);
    for (const m of bannerMats) {
      m.map?.dispose();
      const t = banner.clone();
      t.repeat.set(m.userData.repeat, 1);
      t.needsUpdate = true;
      m.map = t;
      m.needsUpdate = true;
    }
  }

  return { updateCrowd, setTheme };
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xc9dff0, 60, 160);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 400);
  camera.position.set(0, 1.5, 14);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x4b6b4b, 1.6));
  const sun = new THREE.DirectionalLight(0xfff6e5, 2.6);
  sun.position.set(-12, 30, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 22, bottom: -22, near: 5, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x2f5a3f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const court = new THREE.Mesh(new THREE.PlaneGeometry(AREA_W, AREA_L), new THREE.MeshStandardMaterial({ roughness: 0.85 }));
  court.rotation.x = -Math.PI / 2;
  court.receiveShadow = true;
  scene.add(court);

  buildNet(scene);
  buildUmpire(scene);
  const stadium = buildStadium(scene);

  // --- Ball ---
  // Drawn larger than life when far away so you can track it in first person.
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xdff23a, emissive: 0x7a8c00, roughness: 0.55 }),
  );
  ball.castShadow = true;
  scene.add(ball);
  // Dark outline so the ball pops against the crowd and the sky.
  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R * 1.3, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x14210a, side: THREE.BackSide }),
  );
  ball.add(outline);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(240,255,120,0.55)', 'rgba(240,255,120,0)'),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.setScalar(0.22);
  ball.add(glow);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 24),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  const TRAIL = 14;
  const trailMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(BALL_R * 1.6, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xf6ff9a, transparent: true, opacity: 0.35, depthWrite: false }),
    TRAIL,
  );
  trailMesh.frustumCulled = false;
  scene.add(trailMesh);
  const trail = Array.from({ length: TRAIL }, () => new THREE.Vector3(0, -10, 0));
  const tm = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  const ts = new THREE.Vector3();

  function setBall(x, y, z, { visible = true, trailOn = true } = {}) {
    ball.visible = visible;
    blob.visible = visible;
    ball.position.set(x, y, z);
    // Real size close to you, up to ~3x far away, so you can track it.
    const dist = ball.position.distanceTo(camera.position);
    ball.scale.setScalar(1 + Math.min(Math.max((dist - 1.5) / 5, 0), 2.2));
    glow.material.opacity = Math.min(Math.max((dist - 1) / 4, 0), 1);
    outline.visible = dist > 2.5; // up close the outline would look like a black ring
    const h = Math.max(0, y);
    blob.position.set(x, 0.006, z);
    blob.scale.setScalar(1 + h * 0.5);
    blob.material.opacity = Math.max(0.15, 1 - h * 0.25);

    trail.pop();
    trail.unshift(trailOn && visible ? new THREE.Vector3(x, y, z) : new THREE.Vector3(0, -10, 0));
    trail.forEach((p, i) => {
      ts.setScalar(Math.max(0.05, 1 - i / TRAIL));
      tm.compose(p, tq, ts);
      trailMesh.setMatrixAt(i, tm);
    });
    trailMesh.instanceMatrix.needsUpdate = true;
  }

  // Flash on contact
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,255,230,1)', 'rgba(255,255,200,0)'),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    }),
  );
  flash.visible = false;
  scene.add(flash);
  let flashT = 0;
  function spark(pos, size = 1) {
    flash.position.copy(pos);
    flash.visible = true;
    flash.userData.size = size;
    flashT = 0.18;
  }

  // --- Bounce marks and dust (clay / grass) ---
  const markTex = radialTexture('rgba(110,42,18,0.6)', 'rgba(110,42,18,0)');
  const marks = Array.from({ length: 48 }, () => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.visible = false;
    scene.add(m);
    return m;
  });
  let nextMark = 0;
  const dustTex = radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  const dust = Array.from({ length: 10 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false }));
    sp.visible = false;
    sp.userData.t = 0;
    scene.add(sp);
    return sp;
  });
  let nextDust = 0;

  let theme = THEMES.hard;
  let surfaceName = null;

  function clearMarks() {
    marks.forEach((m) => (m.visible = false));
  }

  function bounceFx(x, z, vx, vz, strength = 1) {
    if (Math.abs(x) > AREA_W / 2 || Math.abs(z) > AREA_L / 2) return;
    if (theme.marks) {
      const m = marks[nextMark++ % marks.length];
      m.position.set(x, 0.004, z);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(-vx, -vz));
      m.scale.set(0.1, 0.24, 1);
      m.visible = true;
    }
    if (theme.dust) {
      const d = dust[nextDust++ % dust.length];
      d.material.color.setHex(theme.dust);
      d.position.set(x, 0.06, z);
      d.userData.t = 0.7;
      d.userData.size = 0.5 + 0.5 * Math.min(1, strength);
      d.visible = true;
    }
  }

  function setSurface(name) {
    if (!THEMES[name]) name = 'hard';
    setPhysicsSurface(name);
    if (name === surfaceName) return;
    surfaceName = name;
    theme = THEMES[name];
    court.material.map?.dispose();
    court.material.map = courtTexture(renderer, name);
    court.material.roughness = theme.rough;
    court.material.needsUpdate = true;
    ground.material.color.setHex(theme.ground);
    stadium.setTheme(theme);
    clearMarks();
  }
  setSurface('hard');

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On portrait screens widen the field of view so the court still fits.
    camera.fov = w / h < 1.2 ? 76 : 60;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function render(dt, time, excitement) {
    if (flashT > 0) {
      flashT -= dt;
      const k = Math.max(0, flashT / 0.18);
      flash.scale.setScalar((0.2 + (1 - k) * 0.9) * flash.userData.size);
      flash.material.opacity = k;
      if (flashT <= 0) flash.visible = false;
    }
    for (const d of dust) {
      if (!d.visible) continue;
      d.userData.t -= dt;
      const k = Math.max(0, d.userData.t / 0.7);
      d.scale.setScalar((0.15 + (1 - k) * 0.8) * d.userData.size);
      d.position.y += dt * 0.35;
      d.material.opacity = 0.55 * k;
      if (k <= 0) d.visible = false;
    }
    stadium.updateCrowd(time, excitement);
    renderer.render(scene, camera);
  }

  const envMap = createEnvMap(renderer);

  return {
    renderer,
    scene,
    camera,
    envMap,
    setBall,
    spark,
    bounceFx,
    clearMarks,
    setSurface,
    get surface() {
      return surfaceName;
    },
    render,
  };
}
