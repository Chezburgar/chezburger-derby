// Particle effects: boost trails, goal explosions, bump sparks, supersonic streaks
import * as THREE from 'three';
import { TRAILS } from './carbuilder.js';

const MAX = 3000;

export class Particles {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);   // remaining
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.head = 0;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * (180.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){ float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vC, a); }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, color, size, life, grav = 0) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this._c.set(color);
    this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
    this.size[i] = size;
    this.life[i] = this.maxLife[i] = life;
    this.grav[i] = grav;
  }

  burst(p, color, count, speed, size = 1.4, life = 0.9, grav = -20) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit(p.x, p.y, p.z,
        Math.cos(a) * Math.cos(b) * s, Math.abs(Math.sin(b)) * s, Math.sin(a) * Math.cos(b) * s,
        color, size * (0.6 + Math.random() * 0.8), life * (0.5 + Math.random()), grav);
    }
  }

  boostTrail(anchor, backDir, trailKey, dt, t) {
    const def = TRAILS[trailKey] ?? TRAILS.flame;
    const n = Math.min(6, Math.max(2, Math.round(240 * dt)));
    for (let i = 0; i < n; i++) {
      let color;
      if (def.rainbow) {
        this._c.setHSL((t * 0.6 + Math.random() * 0.12) % 1, 1, 0.6);
        color = this._c.getHex();
      } else {
        color = def.colors[(Math.random() * def.colors.length) | 0];
      }
      const jx = (Math.random() - 0.5) * 0.5, jy = (Math.random() - 0.5) * 0.5, jz = (Math.random() - 0.5) * 0.5;
      this.emit(anchor.x + jx, anchor.y + jy, anchor.z + jz,
        backDir.x * 14 + jx * 6, backDir.y * 14 + 2 + jy * 6, backDir.z * 14 + jz * 6,
        color, 1.5 + Math.random(), 0.28 + Math.random() * 0.2, 4);
    }
  }

  goalExplosion(p, teamColor) {
    this.burst(p, teamColor, 320, 55, 2.6, 1.6, -14);
    this.burst(p, 0xffffff, 90, 30, 1.6, 1.0, -8);
    this.burst(p, 0xffd166, 120, 42, 2.0, 1.3, -10);
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.4; }
      const frac = this.life[i] / this.maxLife[i];
      this.size[i] *= (0.9 + frac * 0.1);
      this.col[i * 3] *= 0.995; this.col[i * 3 + 1] *= 0.99; this.col[i * 3 + 2] *= 0.99;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// simple stretched-quad speed trail behind supersonic cars
export class SpeedLines {
  constructor(scene, color = 0xffffff) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 0.5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(this.mesh);
  }
  update(carPos, vel, active) {
    const m = this.mesh.material;
    m.opacity += ((active ? 0.35 : 0) - m.opacity) * 0.15;
    if (m.opacity < 0.01) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mesh.position.copy(carPos);
    this.mesh.position.y += 0.4;
    const dir = vel.clone().setY(0).normalize();
    this.mesh.position.addScaledVector(dir, -3.5);
    this.mesh.lookAt(carPos.x, carPos.y + 0.4, carPos.z);
  }
}
