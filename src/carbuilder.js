// Procedural car meshes built from the customization object
import * as THREE from 'three';

export const BODIES = {
  burger: 'The Chezburger',
  wedge:  'Wedgie',
  flat:   'Pancake GT',
  brick:  'Brick Truck',
};
export const WHEELS = { sport: 'Sport', spike: 'Spiked', neon: 'Neon Disc' };
export const TOPPERS = { none: 'None', burger: 'Burger', crown: 'Crown', cone: 'Cone', antenna: 'Antenna', halo: 'Halo' };
export const TRAILS = {
  flame:  { name: 'Flame',    colors: [0xffd166, 0xff6b1a, 0xff2d00] },
  ice:    { name: 'Ice',      colors: [0xe0fbff, 0x7dd3fc, 0x38bdf8] },
  toxic:  { name: 'Toxic',    colors: [0xd9f99d, 0x84cc16, 0x22c55e] },
  plasma: { name: 'Plasma',   colors: [0xf5d0fe, 0xd946ef, 0x7c3aed] },
  rainbow:{ name: 'Rainbow',  colors: [0xff0044, 0x00ff88, 0x2266ff], rainbow: true },
  gold:   { name: 'Gold Rush',colors: [0xfff7cc, 0xffd700, 0xb8860b] },
};

function paintMat(hex, metal = 0.35, rough = 0.35) {
  // glossy automotive paint: clearcoat over a satin base
  return new THREE.MeshPhysicalMaterial({
    color: hex, metalness: metal, roughness: rough,
    clearcoat: 1.0, clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Wedge (triangular prism) pointing +x, base w×d, height h
function wedgeMesh(w, h, d, mat, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(-w / 2, h); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function buildWheel(style, colorHex) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.46, 18),
    new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.9 }));
  tire.rotation.x = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);
  const rimMat = new THREE.MeshStandardMaterial({
    color: colorHex, metalness: 0.6, roughness: 0.25,
    emissive: colorHex, emissiveIntensity: style === 'neon' ? 1.6 : 0.25,
  });
  if (style === 'spike') {
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 6), rimMat);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
      spike.rotation.z = a - Math.PI / 2;
      g.add(spike);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12), rimMat);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
  } else if (style === 'neon') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.48, 20), rimMat);
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
  } else {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 6), rimMat);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.05), rimMat);
      spoke.rotation.z = (i / 5) * Math.PI * 2;
      spoke.position.z = 0.22;
      g.add(spoke);
    }
  }
  return g;
}

function buildTopper(kind, accentHex) {
  const g = new THREE.Group();
  if (kind === 'burger') {
    const bun = new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.7 });
    const patty = new THREE.MeshStandardMaterial({ color: 0x6b3a1f, roughness: 0.9 });
    const cheese = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.5 });
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), bun);
    b1.position.y = 0.42;
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.95), cheese);
    ch.position.y = 0.32; ch.rotation.y = 0.5;
    const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.16, 14), patty);
    pt.position.y = 0.22;
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.14, 14), bun);
    b2.position.y = 0.07;
    g.add(b1, ch, pt, b2);
  } else if (kind === 'crown') {
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2, emissive: 0x664d00, emissiveIntensity: 0.4 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.25, 10, 1, true), gold);
    band.position.y = 0.12;
    g.add(band);
    for (let i = 0; i < 5; i++) {
      const pt = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 4), gold);
      const a = (i / 5) * Math.PI * 2;
      pt.position.set(Math.cos(a) * 0.4, 0.38, Math.sin(a) * 0.4);
      g.add(pt);
    }
  } else if (kind === 'cone') {
    const or = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 });
    const wh = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 12), or);
    c.position.y = 0.5;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.31, 0.14, 12), wh);
    ring.position.y = 0.45;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.85), or);
    base.position.y = 0.04;
    g.add(c, ring, base);
  } else if (kind === 'antenna') {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333 }));
    rod.position.y = 0.7;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 0.9 }));
    ball.position.y = 1.42;
    g.add(rod, ball);
  } else if (kind === 'halo') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 24),
      new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 2.2 }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.55;
    g.add(halo);
  }
  return g;
}

// Builds a car group facing +x. userData: { wheels, boostAnchors, glassMats }
export function buildCar(custom, teamGlow = null) {
  const g = new THREE.Group();
  const primary = paintMat(new THREE.Color(custom.primary));
  const accent = paintMat(new THREE.Color(custom.accent), 0.85, 0.25);
  const dark = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0c1420, metalness: 0.9, roughness: 0.08,
    emissive: teamGlow ?? 0x000000, emissiveIntensity: teamGlow ? 0.25 : 0,
  });

  let wheelPos, topperY = 1.55, boostAnchors;
  const body = custom.body;

  if (body === 'wedge') {
    g.add(wedgeMesh(5.2, 1.5, 3.2, primary, 0.4, 0.1, 0));
    g.add(box(2.0, 0.5, 2.2, glass, -1.15, 1.05, 0));
    g.add(box(0.9, 0.22, 3.5, accent, -2.3, 1.35, 0));       // rear wing
    g.add(box(5.0, 0.25, 3.3, dark, 0, 0.12, 0));            // floor pan
    g.add(box(0.5, 0.35, 1.2, accent, 2.75, 0.35, 0));       // nose tip
    wheelPos = [[1.7, -1.55], [1.7, 1.55], [-1.7, -1.55], [-1.7, 1.55]];
    topperY = 1.4;
    boostAnchors = [[-2.7, 0.65, -0.7], [-2.7, 0.65, 0.7]];
  } else if (body === 'flat') {
    g.add(box(5.6, 0.85, 3.4, primary, 0, 0.5, 0));
    g.add(box(2.6, 0.55, 2.6, glass, -0.4, 1.15, 0));
    g.add(box(1.3, 0.2, 3.4, accent, 2.2, 0.95, 0));         // hood stripe
    g.add(box(0.4, 0.5, 3.4, dark, 2.7, 0.45, 0));           // front bumper
    g.add(box(0.35, 0.6, 3.4, dark, -2.7, 0.5, 0));
    wheelPos = [[1.85, -1.62], [1.85, 1.62], [-1.85, -1.62], [-1.85, 1.62]];
    topperY = 1.5;
    boostAnchors = [[-2.85, 0.55, -1.0], [-2.85, 0.55, 0], [-2.85, 0.55, 1.0]];
  } else if (body === 'brick') {
    g.add(wedgeMesh(6.2, 1.9, 3.3, primary, -0.6, 0.15, 0)); // big angular slab
    g.add(box(3.4, 0.35, 3.3, primary, 0.9, 1.0, 0));
    g.add(box(2.2, 0.6, 2.9, glass, 0.2, 1.35, 0));
    g.add(box(0.3, 0.9, 3.3, dark, 2.9, 0.6, 0));
    g.add(box(6.0, 0.28, 3.4, dark, 0, 0.14, 0));
    g.add(box(0.25, 0.12, 3.3, accent, 3.0, 1.05, 0));       // light bar
    wheelPos = [[1.9, -1.6], [1.9, 1.6], [-1.9, -1.6], [-1.9, 1.6]];
    topperY = 1.8;
    boostAnchors = [[-2.95, 0.8, -0.85], [-2.95, 0.8, 0.85]];
  } else { // burger (octane-ish default)
    g.add(box(5.0, 1.0, 3.0, primary, 0, 0.62, 0));
    g.add(box(1.6, 0.75, 2.2, glass, -0.3, 1.45, 0));        // cabin
    g.add(box(1.4, 0.45, 2.6, primary, 1.9, 0.95, 0));       // hood
    g.add(box(0.18, 0.35, 3.2, accent, -2.45, 1.35, 0));     // spoiler blade
    g.add(box(0.12, 0.55, 0.12, dark, -2.45, 1.0, -1.2));
    g.add(box(0.12, 0.55, 0.12, dark, -2.45, 1.0, 1.2));
    g.add(box(5.2, 0.3, 3.1, dark, 0, 0.15, 0));
    g.add(box(1.6, 0.18, 3.02, accent, 0.4, 1.13, 0));       // racing stripe
    wheelPos = [[1.65, -1.42], [1.65, 1.42], [-1.65, -1.42], [-1.65, 1.42]];
    topperY = 1.85;
    boostAnchors = [[-2.6, 0.6, -0.6], [-2.6, 0.6, 0.6]];
  }

  const wheels = wheelPos.map(([x, z]) => {
    const w = buildWheel(custom.wheels, new THREE.Color(custom.wheelColor));
    w.position.set(x, 0.62 - 0.95, z); // wheel center relative to car center (hoverY offset applied by parent)
    g.add(w);
    return w;
  });

  const topper = buildTopper(custom.topper, new THREE.Color(custom.accent));
  topper.position.y = topperY;
  topper.position.x = -0.3;
  g.add(topper);

  // team underglow light strip
  if (teamGlow !== null) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.06, 2.8),
      new THREE.MeshBasicMaterial({ color: teamGlow }));
    strip.position.y = -0.86;
    g.add(strip);
  }

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { wheels, boostAnchors, glass };
  return g;
}
