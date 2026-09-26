// Ball physics, court dimensions and shot helpers.
// Axes: x = court width, y = height, z = court length.
// You play at z > 0 looking toward -z; the CPU plays at z < 0.

export const G = 9.81;
export const BALL_R = 0.033;
export const DT = 1 / 240; // fixed step: prediction and gameplay share the same integration

export const COURT = {
  halfL: 11.885, // half court length (23.77 m)
  halfW: 4.115, // singles (8.23 m)
  halfDW: 5.485, // doubles (10.97 m)
  service: 6.4, // service line, measured from the net
  netH: 0.914, // height at the center strap
  postX: 6.4, // posts (0.914 m outside the doubles line)
  postH: 1.07,
};

export function netHeight(x) {
  const a = Math.min(Math.abs(x) / COURT.postX, 1);
  return COURT.netH + (COURT.postH - COURT.netH) * a * a;
}

/**
 * Surfaces: `bounce` = vertical speed kept on a bounce, `grip` = horizontal
 * speed kept (lower = slower court), `roll` = rolling friction.
 */
export const SURFACES = {
  hard: { bounce: 0.74, grip: 0.8, roll: 1.8 },
  clay: { bounce: 0.8, grip: 0.68, roll: 3.2 },
  grass: { bounce: 0.64, grip: 0.88, roll: 1.2 },
};

let surface = SURFACES.hard;

export function setSurface(name) {
  surface = SURFACES[name] || SURFACES.hard;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/**
 * Advance the ball one fixed step. `b` = {x,y,z,vx,vy,vz,rolling}.
 * Returns an event {type:'bounce'|'net', ...} or null.
 */
export function stepBall(b, dt = DT, withNet = true) {
  const pz = b.z;
  let ev = null;

  if (b.rolling) {
    const f = Math.max(0, 1 - surface.roll * dt);
    b.vx *= f;
    b.vz *= f;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    return null;
  }

  // Exact parabola within the step.
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.y += b.vy * dt - 0.5 * G * dt * dt;
  b.vy -= G * dt;

  if (withNet && pz !== 0 && pz > 0 !== b.z > 0) {
    const f = pz / (pz - b.z);
    const xc = b.x - b.vx * dt * (1 - f);
    if (Math.abs(xc) < COURT.postX + 0.05 && b.y - BALL_R < netHeight(xc)) {
      b.z = Math.sign(pz) * (BALL_R + 0.02);
      b.vz = -b.vz * 0.12;
      b.vx *= 0.35;
      b.vy = Math.min(b.vy, 0) * 0.3;
      ev = { type: 'net', x: xc, y: b.y };
    }
  }

  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < 0) {
      const impact = -b.vy;
      if (impact > 0.7) {
        b.vy = impact * surface.bounce;
        b.vx *= surface.grip;
        b.vz *= surface.grip;
      } else {
        b.vy = 0;
        b.rolling = true;
      }
      ev = { type: 'bounce', x: b.x, z: b.z, speed: impact };
    }
  }
  return ev;
}

/**
 * Predict where to hit a ball travelling toward `side` (+1 you, -1 CPU):
 * after the first bounce, near the baseline if it arrives at a good height;
 * if it lands short, when it drops back to ~1 m.
 */
export function predictHit(ball, side, hitH = 1.0) {
  const b = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, rolling: false };
  const maxDepth = COURT.halfL + 3.2;
  const baseline = COURT.halfL + 0.4;
  let bounce = null;
  for (let i = 1; i <= 240 * 6; i++) {
    const ev = stepBall(b, DT, false);
    if (ev && ev.type === 'bounce') {
      if (!bounce) {
        bounce = { x: b.x, z: b.z, steps: i };
        if (Math.sign(b.z) !== side) return { bounce, hit: null };
      } else {
        return { bounce, hit: { x: b.x, y: b.y, z: b.z, steps: i } };
      }
    }
    if (bounce) {
      const atBaseline = side * b.z >= baseline && b.y >= 0.7 && b.y <= 1.6;
      if (atBaseline || (b.vy < 0 && b.y <= hitH) || side * b.z >= maxDepth) {
        return { bounce, hit: { x: b.x, y: b.y, z: b.z, steps: i } };
      }
    } else if (side * b.z > maxDepth + 6) {
      return { bounce: null, hit: null };
    }
  }
  return { bounce, hit: null };
}

/**
 * Launch velocity to go from `from` to `target` (on the ground) at roughly the
 * given horizontal speed, clearing the net by `clearance` meters.
 */
export function solveShot(from, target, speed, clearance = 0.3) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  let T = Math.max(d / speed, 0.3);
  let v = null;
  for (let i = 0; i < 60; i++) {
    const vx = dx / T;
    const vz = dz / T;
    const vy = (BALL_R - from.y + 0.5 * G * T * T) / T;
    v = { vx, vy, vz };
    const tn = -from.z / vz;
    if (tn > 0 && tn < T) {
      const yn = from.y + vy * tn - 0.5 * G * tn * tn;
      if (yn - BALL_R < netHeight(from.x + vx * tn) + clearance) {
        T *= 1.05;
        continue;
      }
    }
    break;
  }
  return v;
}

export function inSingles(x, z) {
  return Math.abs(x) <= COURT.halfW + BALL_R && Math.abs(z) <= COURT.halfL + BALL_R;
}

/**
 * Does it land in the correct service box?
 * `side` = receiver's side (+1/-1). `deuce` = serving from the right.
 * The deuce box is on the receiver's right: for you (facing -z) that is +x;
 * for the CPU (facing +z) it is -x.
 */
export function inServiceBox(x, z, side, deuce) {
  const sx = deuce ? side : -side;
  const inX = sx * x >= -BALL_R && sx * x <= COURT.halfW + BALL_R;
  const inZ = side * z >= -BALL_R && side * z <= COURT.service + BALL_R;
  return inX && inZ;
}
