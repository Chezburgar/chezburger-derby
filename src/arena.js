// Visual arena: field, glass walls, neon goals, boost pads, stadium dressing
import * as THREE from 'three';
import { ARENA, PADS, TEAMS } from './config.js';

function fieldTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1600; cv.height = 1024;
  const ctx = cv.getContext('2d');
  // base
  const grad = ctx.createRadialGradient(800, 512, 100, 800, 512, 950);
  grad.addColorStop(0, '#20304a');
  grad.addColorStop(0.6, '#16213a');
  grad.addColorStop(1, '#0d1424');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1600, 1024);
  // mow stripes (each half tinted toward its team)
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(i * 100, 0, 100, 1024);
  }
  ctx.fillStyle = 'rgba(47,139,255,0.05)';
  ctx.fillRect(0, 0, 800, 1024);
  ctx.fillStyle = 'rgba(255,140,26,0.05)';
  ctx.fillRect(800, 0, 800, 1024);
  ctx.strokeStyle = 'rgba(180,215,255,0.65)';
  ctx.lineWidth = 6;
  ctx.shadowColor = 'rgba(140,190,255,0.6)';
  ctx.shadowBlur = 8;
  // border + halves
  ctx.strokeRect(30, 30, 1540, 964);
  ctx.beginPath(); ctx.moveTo(800, 30); ctx.lineTo(800, 994); ctx.stroke();
  // center circle
  ctx.beginPath(); ctx.arc(800, 512, 130, 0, Math.PI * 2); ctx.stroke();
  // goal boxes
  ctx.strokeStyle = 'rgba(47,139,255,0.55)';
  ctx.strokeRect(30, 512 - 220, 190, 440);
  ctx.strokeStyle = 'rgba(255,140,26,0.55)';
  ctx.strokeRect(1570 - 190, 512 - 220, 190, 440);
  // center logo (no glow)
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,209,102,0.18)';
  ctx.font = 'bold 120px Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🍔', 800, 556);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  return tex;
}

function crowdTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0d16';
  ctx.fillRect(0, 0, 512, 128);
  const cols = ['#2f8bff', '#ff8c1a', '#ffd166', '#e63946', '#8ecae6', '#a3e635'];
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
    ctx.globalAlpha = 0.25 + Math.random() * 0.6;
    ctx.fillRect(Math.random() * 512, Math.random() * 128, 2.5, 2.5);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 6;
  return tex;
}

function buildGoal(scene, side /* +1 orange end, -1 blue end */) {
  const team = side > 0 ? TEAMS.orange : TEAMS.blue;
  const { halfL, goalW, goalH, goalD } = ARENA;
  const glow = new THREE.MeshBasicMaterial({ color: team.glow });
  const frameT = 0.7;
  // frame around opening
  const top = new THREE.Mesh(new THREE.BoxGeometry(frameT, frameT, goalW + frameT * 2), glow);
  top.position.set(side * halfL, goalH + frameT / 2, 0);
  const l = new THREE.Mesh(new THREE.BoxGeometry(frameT, goalH + frameT, frameT), glow);
  l.position.set(side * halfL, (goalH + frameT) / 2, -goalW / 2 - frameT / 2);
  const r = l.clone(); r.position.z = goalW / 2 + frameT / 2;
  scene.add(top, l, r);

  // net box (wireframe-ish planes)
  const netMat = new THREE.MeshBasicMaterial({
    color: team.color, transparent: true, opacity: 0.10, side: THREE.DoubleSide,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(goalW, goalH), netMat);
  back.position.set(side * (halfL + goalD), goalH / 2, 0);
  back.rotation.y = Math.PI / 2;
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(goalD, goalH), netMat);
  sideL.position.set(side * (halfL + goalD / 2), goalH / 2, -goalW / 2);
  const sideR = sideL.clone(); sideR.position.z = goalW / 2;
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(goalD, goalW), netMat);
  roof.position.set(side * (halfL + goalD / 2), goalH, 0);
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  scene.add(back, sideL, sideR, roof);

  // net floor glow
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(goalD, goalW),
    new THREE.MeshBasicMaterial({ color: team.glow, transparent: true, opacity: 0.35 }));
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.rotation.z = Math.PI / 2;
  floorGlow.position.set(side * (halfL + goalD / 2), 0.03, 0);
  scene.add(floorGlow);

  // goal spotlight
  const light = new THREE.PointLight(team.color, 220, 70, 1.8);
  light.position.set(side * (halfL - 6), 10, 0);
  scene.add(light);
}

export function buildArena(scene) {
  const { halfL, halfW, height, corner } = ARENA;

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfL * 2 + 2, halfW * 2 + 2),
    new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.85, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // glass walls
  const glass = new THREE.MeshBasicMaterial({
    color: 0x88bbff, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false,
  });
  const mkWall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  mkWall(halfL * 2, height, 0, height / 2, -halfW, 0);
  mkWall(halfL * 2, height, 0, height / 2, halfW, Math.PI);
  mkWall(halfW * 2, height, -halfL, height / 2, 0, Math.PI / 2);
  mkWall(halfW * 2, height, halfL, height / 2, 0, -Math.PI / 2);
  // corner cut panels
  const cLen = Math.hypot(corner, corner);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(cLen, height), glass);
    m.position.set(sx * (halfL - corner / 2), height / 2, sz * (halfW - corner / 2));
    m.lookAt(0, height / 2, 0);
    scene.add(m);
  }

  // neon trim along wall base
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x35507a });
  const mkTrim = (len, x, z, ry) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.5), trimMat);
    t.position.set(x, 0.25, z);
    t.rotation.y = ry;
    scene.add(t);
  };
  mkTrim(2 * (halfL - corner), 0, -halfW, 0);
  mkTrim(2 * (halfL - corner), 0, halfW, 0);
  mkTrim(2 * (halfW - corner), -halfL, 0, Math.PI / 2);
  mkTrim(2 * (halfW - corner), halfL, 0, Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mkTrim(cLen, sx * (halfL - corner / 2), sz * (halfW - corner / 2), sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4);
  }

  buildGoal(scene, 1);
  buildGoal(scene, -1);

  // crowd stands: two long tilted planes each side
  const crowd = crowdTexture();
  for (const sz of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.PlaneGeometry(halfL * 2.6, 26),
      new THREE.MeshBasicMaterial({ map: crowd }));
    stand.position.set(0, 18, sz * (halfW + 22));
    stand.rotation.x = sz > 0 ? -0.5 : 0.5;
    stand.rotation.y = sz > 0 ? Math.PI : 0;
    scene.add(stand);
  }
  for (const sx of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2.6, 22),
      new THREE.MeshBasicMaterial({ map: crowd }));
    stand.position.set(sx * (halfL + 26), 16, 0);
    stand.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    stand.rotation.x = -0.35;
    scene.add(stand);
  }

  // light towers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 46, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.8 }));
    pole.position.set(sx * (halfL + 14), 23, sz * (halfW + 14));
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xf5f9ff }));
    lamp.position.set(sx * (halfL + 14), 46, sz * (halfW + 14));
    lamp.lookAt(0, 0, 0);
    scene.add(lamp);
  }

  // sky dome (gradient shader)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color(0x0b1230) }, bot: { value: new THREE.Color(0x1c1230) } },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          float h = normalize(vP).y * 0.5 + 0.5;
          vec3 c = mix(bot, top, h);
          vec2 sp = floor(vP.xz*0.5)+floor(vP.y*0.5);
          float star = step(0.998, hash(normalize(vP).xy*400.0)) * smoothstep(0.2,0.6,h);
          gl_FragColor = vec4(c + star*0.8, 1.0);
        }`,
    }));
  scene.add(sky);
  return { floor };
}

// ------- boost pads (visual + state) -------
export class BoostPads {
  constructor(scene) {
    this.pads = PADS.map(([x, z, big]) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const r = big ? 2.2 : 1.3;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, big ? 0.22 : 0.13, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xffc93c }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      group.add(ring);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(big ? 1.1 : 0.55, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 }));
      orb.position.y = big ? 1.6 : 0.8;
      group.add(orb);
      scene.add(group);
      return { x, z, big, timer: 0, orb, ring, group, r: big ? 3.4 : 2.2 };
    });
  }

  update(dt, t) {
    for (const p of this.pads) {
      if (p.timer > 0) {
        p.timer -= dt;
        p.orb.visible = false;
        p.ring.material.color.setHex(0x3a3f52);
      } else {
        p.orb.visible = true;
        p.ring.material.color.setHex(p.big ? 0xffc93c : 0xd9a23c);
        p.orb.position.y = (p.big ? 1.6 : 0.8) + Math.sin(t * 3 + p.x) * 0.15;
        p.orb.rotation.y = t * 2;
      }
    }
  }
}
