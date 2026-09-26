// 3D racket preview for the menu (spins on its own; drag to rotate it).
import * as THREE from 'three';
import { createRacket, createEnvMap } from './characters.js';

export function createRacketPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 10);
  camera.position.set(0, 0, 2.05);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a4d, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(1.2, 1.5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdff23a, 1.4);
  rim.position.set(-2, 0.5, -1.5);
  scene.add(rim);

  const racket = createRacket('classic', { envMap: createEnvMap(renderer) });
  racket.position.y = -0.3; // racket centered on the origin
  const pivot = new THREE.Group();
  pivot.rotation.z = -0.35;
  pivot.add(racket);
  scene.add(pivot);

  let yaw = 0.6;
  let spin = 0.6; // rad/s
  let dragging = false;
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  canvas.addEventListener('pointerup', () => (dragging = false));
  canvas.addEventListener('pointercancel', () => (dragging = false));

  let running = false;
  let last = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!dragging) yaw += spin * dt;
    pivot.rotation.y = yaw;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || camera.aspect !== w / h)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  return {
    setSkin(name) {
      racket.userData.setSkin(name);
      spin = 4; // quick "showcase" spin when switching
      setTimeout(() => (spin = 0.6), 350);
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
  };
}
