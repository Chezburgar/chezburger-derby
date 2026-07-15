// Arcade physics: arena collision, ball, car dynamics, car-ball / car-car impacts
import * as THREE from 'three';
import { ARENA, BALL, CAR } from './config.js';

const V = () => new THREE.Vector3();
const tmp1 = V(), tmp2 = V(), tmp3 = V();

// Inward-facing planes {n, d}: point is inside when dot(n,p) - d >= 0
const S2 = Math.SQRT1_2;
const PLANES = [
  { n: new THREE.Vector3(0, 1, 0), d: 0, floor: true },
  { n: new THREE.Vector3(0, -1, 0), d: -ARENA.height },
  { n: new THREE.Vector3(-1, 0, 0), d: -ARENA.halfL, goal: 1 },   // +x wall (orange goal side)
  { n: new THREE.Vector3(1, 0, 0), d: -ARENA.halfL, goal: -1 },   // -x wall (blue goal side)
  { n: new THREE.Vector3(0, 0, -1), d: -ARENA.halfW },
  { n: new THREE.Vector3(0, 0, 1), d: -ARENA.halfW },
];
// 4 corner cut planes
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const n = new THREE.Vector3(-sx * S2, 0, -sz * S2);
  const p0 = new THREE.Vector3(sx * ARENA.halfL, 0, sz * (ARENA.halfW - ARENA.corner));
  PLANES.push({ n, d: n.dot(p0) });
}

// Resolve a sphere against the arena (including goal pockets).
// Mutates pos & vel. Returns { onGround, hitWall }
export function collideSphereArena(pos, vel, r, rest, wallRest, friction, dt) {
  let onGround = false, hitWall = false;

  const inGoalMouth = Math.abs(pos.z) < ARENA.goalW / 2 - r * 0.0 &&
                      pos.y < ARENA.goalH - r * 0.0;

  for (const pl of PLANES) {
    if (pl.goal && inGoalMouth) continue; // ball/car may pass through goal opening
    const dist = pl.n.dot(pos) - pl.d;
    if (dist < r) {
      pos.addScaledVector(pl.n, r - dist);
      const vn = pl.n.dot(vel);
      if (vn < 0) {
        const e = pl.floor ? rest : wallRest;
        vel.addScaledVector(pl.n, -vn * (1 + e));
        if (!pl.floor) hitWall = true;
      }
      if (pl.floor) {
        onGround = true;
        // rolling friction on ground tangential velocity
        const f = Math.exp(-friction * dt);
        vel.x *= f; vel.z *= f;
      }
    }
  }

  // Goal pocket interior (only matters when |x| > halfL - r)
  if (Math.abs(pos.x) > ARENA.halfL - r) {
    const s = Math.sign(pos.x);
    const backX = ARENA.halfL + ARENA.goalD;
    if (s * pos.x > backX - r) {          // back of net
      pos.x = s * (backX - r);
      if (s * vel.x > 0) vel.x *= -0.4;
    }
    if (Math.abs(pos.x) > ARENA.halfL + 0.01) {
      const hw = ARENA.goalW / 2;
      if (Math.abs(pos.z) > hw - r) {     // net side walls
        pos.z = Math.sign(pos.z) * (hw - r);
        vel.z *= -0.4;
      }
      if (pos.y > ARENA.goalH - r) {      // net ceiling
        pos.y = ARENA.goalH - r;
        if (vel.y > 0) vel.y *= -0.4;
      }
    }
  }
  return { onGround, hitWall };
}

// ---------------------------------------------------------------- Ball

export class Ball {
  constructor() {
    this.pos = new THREE.Vector3(0, BALL.radius, 0);
    this.vel = V();
    this.spin = V();          // for visual rolling
    this.lastTouch = null;    // player id
  }

  reset() {
    this.pos.set(0, BALL.radius, 0);
    this.vel.set(0, 0, 0);
    this.lastTouch = null;
  }

  update(dt) {
    this.vel.y += BALL.gravity * dt;
    this.vel.multiplyScalar(Math.exp(-BALL.airDrag * dt));
    if (this.vel.length() > BALL.maxSpeed) this.vel.setLength(BALL.maxSpeed);
    this.pos.addScaledVector(this.vel, dt);
    const res = collideSphereArena(this.pos, this.vel, BALL.radius,
      BALL.restitution, BALL.wallRestitution, BALL.rollFriction, dt);
    // kill tiny bounce jitter
    if (res.onGround && Math.abs(this.vel.y) < 2.2) this.vel.y = 0;
    // visual spin from horizontal motion
    this.spin.set(this.vel.z, 0, -this.vel.x).multiplyScalar(1 / BALL.radius);
    return res;
  }

  // goal check: returns 'blue'|'orange' (team that CONCEDED... returns scoring team)
  checkGoal() {
    if (this.pos.x > ARENA.halfL + BALL.radius * 0.8) return 'blue';   // ball in +x net → blue scores on orange
    if (this.pos.x < -ARENA.halfL - BALL.radius * 0.8) return 'orange';
    return null;
  }
}

// ---------------------------------------------------------------- Car

export class CarPhys {
  constructor() {
    this.pos = new THREE.Vector3(0, CAR.hoverY, 0);
    this.vel = V();
    this.yaw = 0;
    this.pitch = 0;           // air pitch
    this.roll = 0;            // visual / air roll
    this.onGround = true;
    this.boost = 34;
    this.jumps = 0;           // jumps used since last grounded
    this.flipTimer = 0;       // time remaining to use flip
    this.flipping = 0;        // flip animation time remaining
    this.flipDir = new THREE.Vector2();
    this.demolished = 0;      // respawn timer
    this.boosting = false;
    this.drifting = false;
    this.supersonic = false;
  }

  forward(out = tmp1) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.cos(this.yaw) * cp, Math.sin(this.pitch), -Math.sin(this.yaw) * cp);
  }
  right(out = tmp2) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  spawn(x, z, yaw) {
    this.pos.set(x, CAR.hoverY, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.boost = 34; this.jumps = 0; this.flipping = 0; this.demolished = 0;
    this.onGround = true;
  }

  update(dt, inp) {
    if (this.demolished > 0) {
      this.demolished -= dt;
      return;
    }
    const fwd = this.forward(tmp1).clone();
    const rgt = this.right(tmp2).clone();

    this.drifting = inp.drift && this.onGround;
    this.boosting = inp.boost && this.boost > 0;

    if (this.onGround) {
      this.pitch *= Math.exp(-10 * dt);
      this.roll *= Math.exp(-8 * dt);

      let vf = this.vel.dot(fwd);
      let vlat = this.vel.dot(rgt);
      const vy = this.vel.y;

      // steering: responsive from low speed, gently tightened at high speed.
      // reversed when driving backwards. Only steer when actually rolling.
      const absVf = Math.abs(vf);
      const speedFac = absVf < 0.4 ? 0 : THREE.MathUtils.clamp(0.35 + absVf / 7, 0, 1);
      const highSpeedDamp = 1 / (1 + absVf * 0.010);
      const yawIn = inp.steer * CAR.yawRate * speedFac * highSpeedDamp *
                    (this.drifting ? CAR.driftYawMult : 1) * (vf < -0.5 ? -1 : 1);
      this.yaw -= yawIn * dt;
      // recompute axes after steering so velocity follows the car
      this.forward(fwd); this.right(rgt);

      // throttle
      if (inp.throttle > 0) {
        vf += CAR.accel * inp.throttle * dt;
      } else if (inp.throttle < 0) {
        vf += (vf > 0.5 ? -CAR.brake : -CAR.accel) * dt;
      } else {
        vf *= Math.exp(-CAR.rollFriction * dt);
      }
      // boost
      if (this.boosting) {
        vf += CAR.boostAccel * dt;
        this.boost = Math.max(0, this.boost - CAR.boostUse * dt);
      }
      const maxF = this.boosting || vf > CAR.maxDrive ? CAR.maxBoost : CAR.maxDrive;
      vf = THREE.MathUtils.clamp(vf, -CAR.maxReverse, maxF);
      // over-max decay (after boost runs out, bleed back toward drive max)
      if (!this.boosting && vf > CAR.maxDrive) vf = Math.max(CAR.maxDrive, vf - 12 * dt);

      // lateral grip
      const grip = this.drifting ? CAR.driftLatFriction : CAR.latFriction;
      vlat *= Math.exp(-grip * dt);

      this.vel.copy(fwd).multiplyScalar(vf).addScaledVector(rgt, vlat);
      this.vel.y = vy;

      // visual body roll from lateral slip / steering
      this.roll = THREE.MathUtils.lerp(this.roll, -inp.steer * 0.07 - vlat * 0.006, 0.3);

      if (inp.jump) {
        this.vel.y = CAR.jumpImpulse;
        this.onGround = false;
        this.jumps = 1;
        this.flipTimer = CAR.flipWindow;
        this.pos.y += 0.05;
      }
    } else {
      // ---- airborne
      this.flipTimer = Math.max(0, this.flipTimer - dt);
      this.yaw -= inp.steer * CAR.airYawRate * dt;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + inp.pitch * CAR.airPitchRate * dt, -1.35, 1.35);
      if (inp.roll) this.roll += inp.roll * 3.4 * dt;
      else this.roll *= Math.exp(-2.5 * dt);

      if (this.boosting) {
        this.forward(fwd);
        this.vel.addScaledVector(fwd, CAR.boostAccel * dt);
        if (this.vel.length() > CAR.maxBoost) this.vel.setLength(CAR.maxBoost);
        this.boost = Math.max(0, this.boost - CAR.boostUse * dt);
      }

      if (inp.jump && this.jumps === 1) {
        this.jumps = 2;
        const hasDir = Math.abs(inp.steer) > 0.3 || Math.abs(inp.throttle) > 0.3;
        if (this.flipTimer > 0 && hasDir) {
          // dodge/flip: impulse in input direction relative to car facing
          const dir = tmp3.set(0, 0, 0)
            .addScaledVector(this.forward(tmp1).setY(0).normalize(), inp.throttle)
            .addScaledVector(this.right(tmp2), inp.steer);
          if (dir.lengthSq() > 0.01) {
            dir.normalize();
            this.vel.addScaledVector(dir, CAR.flipImpulse);
            this.vel.y = Math.max(this.vel.y * 0.35, 1.5);
            this.flipping = 0.65;
            this.flipDir.set(inp.throttle, inp.steer);
          }
        } else {
          this.vel.y += CAR.doubleJumpImpulse;
        }
      }
      this.vel.y += CAR.gravity * dt;
    }

    if (this.flipping > 0) this.flipping -= dt;

    this.pos.addScaledVector(this.vel, dt);

    // arena collision (sphere approx)
    const wasAir = !this.onGround;
    const res = collideSphereArena(this.pos, this.vel, CAR.hoverY, 0.05, 0.25, 0, dt);
    if (res.onGround) {
      if (wasAir && this.vel.y <= 0.01) {
        this.onGround = true;
        this.jumps = 0;
        this.flipping = 0;
      }
    } else if (this.pos.y > CAR.hoverY + 0.15) {
      this.onGround = false;
    }

    this.supersonic = this.vel.length() >= CAR.supersonic;
  }
}

// ---------------------------------------------------------------- Impacts

const localBall = V();

// Sphere (ball) vs car oriented box. Returns impact speed (0 = no hit)
export function collideCarBall(car, ball) {
  if (car.demolished > 0) return 0;
  // ball into car local frame (yaw only — good enough for arcade feel)
  localBall.copy(ball.pos).sub(car.pos);
  const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
  const lx = localBall.x * c - localBall.z * s;
  const lz = localBall.x * s + localBall.z * c;
  const ly = localBall.y;

  const cx = THREE.MathUtils.clamp(lx, -CAR.boxL, CAR.boxL);
  const cy = THREE.MathUtils.clamp(ly, -CAR.boxH, CAR.boxH);
  const cz = THREE.MathUtils.clamp(lz, -CAR.boxW, CAR.boxW);
  const dx = lx - cx, dy = ly - cy, dz = lz - cz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > BALL.radius * BALL.radius) return 0;

  const d = Math.sqrt(d2) || 0.001;
  // normal back to world space
  let nx = dx / d, ny = dy / d, nz = dz / d;
  const wnx = nx * c + nz * s;
  const wnz = -nx * s + nz * c;
  const n = tmp1.set(wnx, ny, wnz);
  if (n.lengthSq() < 0.5) n.set(0, 1, 0);

  // separate ball
  ball.pos.addScaledVector(n, BALL.radius - d + 0.02);

  // impulse
  const rel = tmp2.copy(ball.vel).sub(car.vel);
  const vn = rel.dot(n);
  const impact = Math.max(0, -vn) + car.vel.length() * 0.35;
  if (vn < 0) {
    ball.vel.addScaledVector(n, -vn * 1.55);
  }
  // car "power" push + slight lift so hits feel meaty
  ball.vel.addScaledVector(n, 4 + car.vel.length() * 0.28);
  ball.vel.y += 1.5;
  if (ball.vel.length() > BALL.maxSpeed) ball.vel.setLength(BALL.maxSpeed);
  // recoil on car
  car.vel.addScaledVector(n, -impact * 0.10);
  return impact;
}

// Car vs car: push apart; returns 'demo' if b gets demolished by a, 'bump', or null
export function collideCarCar(a, b) {
  if (a.demolished > 0 || b.demolished > 0) return null;
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const R = 3.1;
  if (d2 > R * R || d2 < 0.0001) return null;
  const d = Math.sqrt(d2);
  const n = tmp1.set(dx / d, dy / d, dz / d);
  const push = (R - d) / 2;
  a.pos.addScaledVector(n, -push);
  b.pos.addScaledVector(n, push);
  const rel = tmp2.copy(a.vel).sub(b.vel);
  const vn = rel.dot(n);
  if (vn <= 0) return null;
  // demolition: supersonic head-on
  if (a.supersonic && vn > 40) return 'demo';
  a.vel.addScaledVector(n, -vn * 0.6);
  b.vel.addScaledVector(n, vn * 0.6);
  return vn > 12 ? 'bump' : null;
}
