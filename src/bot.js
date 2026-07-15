// Simple but competent bot: chases ball from the right side, boosts, dodges into shots,
// retreats to defend when the ball is on its own half behind it.
import * as THREE from 'three';
import { ARENA, TEAMS } from './config.js';

const target = new THREE.Vector3();
const toT = new THREE.Vector3();

export class Bot {
  constructor(team) {
    this.team = team;                       // 'blue' | 'orange'
    this.goalX = TEAMS[team].goalX * ARENA.halfL;   // own goal x
    this.kickoffDelay = 0;
    this.jumpCooldown = 0;
  }

  // returns an input object compatible with CarPhys.update
  think(dt, car, ball, phase) {
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    const inp = { throttle: 0, steer: 0, pitch: 0, roll: 0, boost: false, drift: false, jump: false };
    if (phase === 'countdown' || car.demolished > 0) return inp;

    const attackDir = -Math.sign(this.goalX);       // +1 means attack toward +x
    const ballAhead = (ball.pos.x - car.pos.x) * attackDir > -2;

    // pick target
    if (!ballAhead && Math.abs(ball.pos.x - this.goalX) < ARENA.halfL * 1.2) {
      // ball is behind us → loop back toward own goal side of the ball
      target.set(ball.pos.x - attackDir * 14, 0, ball.pos.z * 0.7);
    } else {
      // aim a point slightly behind the ball (so we push it goalward)
      const lead = Math.min(10, 3 + ball.vel.length() * 0.12);
      target.set(ball.pos.x - attackDir * 4 + ball.vel.x * 0.25,
                 0, ball.pos.z + ball.vel.z * 0.25);
      // shade toward net line
      target.z *= 0.92;
      void lead;
    }
    // clamp inside arena
    target.x = THREE.MathUtils.clamp(target.x, -ARENA.halfL + 6, ARENA.halfL - 6);
    target.z = THREE.MathUtils.clamp(target.z, -ARENA.halfW + 6, ARENA.halfW - 6);

    // steering
    toT.copy(target).sub(car.pos); toT.y = 0;
    const dist = toT.length();
    const desired = Math.atan2(-toT.z, toT.x);
    let diff = desired - car.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    inp.steer = THREE.MathUtils.clamp(-diff * 2.2, -1, 1);
    inp.throttle = Math.abs(diff) > 2.4 && dist < 18 ? -0.6 : 1;
    inp.drift = Math.abs(diff) > 1.1 && car.vel.length() > 18;
    inp.boost = Math.abs(diff) < 0.18 && dist > 22 && car.boost > 8 && car.onGround;

    // dodge into the ball for a shot
    const ballDist = car.pos.distanceTo(ball.pos);
    if (ballDist < 9 && ball.pos.y < 4.5 && Math.abs(diff) < 0.4 &&
        car.onGround && this.jumpCooldown <= 0 && car.vel.length() > 14) {
      inp.jump = true;
      this.jumpCooldown = 1.6;
      this._flipQueued = 0.16;
    }
    if (this._flipQueued != null) {
      this._flipQueued -= dt;
      if (this._flipQueued <= 0 && !car.onGround && car.jumps === 1) {
        inp.jump = true;               // second press = forward flip
        inp.throttle = 1;
        this._flipQueued = null;
      }
    }
    // slow boost regen so the bot stays fun without pathing to pads
    car.boost = Math.min(100, car.boost + 4.5 * dt);
    return inp;
  }
}
