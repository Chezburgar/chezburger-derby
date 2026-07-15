// Garage: customization UI with a live 3D preview (drag to orbit)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, BODIES, WHEELS, TOPPERS, TRAILS } from './carbuilder.js';
import { DEFAULT_CUSTOM } from './config.js';

const STORE_KEY = 'chezburger-derby-custom';

export function loadCustom() {
  try {
    return { ...DEFAULT_CUSTOM, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_CUSTOM };
  }
}
export function saveCustom(c) {
  localStorage.setItem(STORE_KEY, JSON.stringify(c));
}

const SWATCHES = ['#e63946', '#ff8c1a', '#ffd166', '#a3e635', '#22c55e', '#22d3ee',
  '#2f8bff', '#7c3aed', '#d946ef', '#f43f5e', '#f5f5f5', '#94a3b8', '#334155', '#111116'];

export class Garage {
  constructor(canvas, sfx) {
    this.sfx = sfx;
    this.custom = loadCustom();
    this.canvas = canvas;
    this.active = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xaaccff, 0x221a2e, 1.4));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7c3aed, 1.2);
    rim.position.set(-6, 3, -6);
    this.scene.add(rim);

    // turntable disc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.3, 40),
      new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.6, roughness: 0.4 }));
    disc.position.y = -1.1;
    this.scene.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.75, 0.06, 8, 60),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.94;
    this.scene.add(ring);

    this.carGroup = null;
    this.orbit = { yaw: 0.6, pitch: 0.35, dist: 12, auto: true };
    this._dragging = false;

    canvas.addEventListener('pointerdown', (e) => {
      this._dragging = true; this.orbit.auto = false;
      this._px = e.clientX; this._py = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      this.orbit.yaw += (e.clientX - this._px) * 0.008;
      this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + (e.clientY - this._py) * 0.006, -0.1, 1.2);
      this._px = e.clientX; this._py = e.clientY;
    });
    canvas.addEventListener('pointerup', () => { this._dragging = false; });
    canvas.addEventListener('wheel', (e) => {
      this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist + e.deltaY * 0.01, 7, 20);
      e.preventDefault();
    }, { passive: false });

    this._buildUi();
    this._rebuildCar();
  }

  _rebuildCar() {
    if (this.carGroup) this.scene.remove(this.carGroup);
    this.carGroup = buildCar(this.custom);
    this.carGroup.position.y = 0;
    this.scene.add(this.carGroup);
  }

  _set(key, val) {
    this.custom[key] = val;
    saveCustom(this.custom);
    this._rebuildCar();
    this.sfx.ui();
    this._refreshSelected();
  }

  _optRow(container, label, options, key) {
    const row = document.createElement('div');
    row.className = 'g-row';
    row.innerHTML = `<div class="g-label">${label}</div>`;
    const opts = document.createElement('div');
    opts.className = 'g-opts';
    for (const [val, name] of Object.entries(options)) {
      const b = document.createElement('button');
      b.className = 'g-opt';
      b.dataset.key = key; b.dataset.val = val;
      b.textContent = name;
      b.onclick = () => this._set(key, val);
      opts.appendChild(b);
    }
    row.appendChild(opts);
    container.appendChild(row);
  }

  _colorRow(container, label, key) {
    const row = document.createElement('div');
    row.className = 'g-row';
    row.innerHTML = `<div class="g-label">${label}</div>`;
    const opts = document.createElement('div');
    opts.className = 'g-opts g-swatches';
    for (const hex of SWATCHES) {
      const b = document.createElement('button');
      b.className = 'g-swatch';
      b.dataset.key = key; b.dataset.val = hex;
      b.style.background = hex;
      b.onclick = () => this._set(key, hex);
      opts.appendChild(b);
    }
    const pick = document.createElement('input');
    pick.type = 'color';
    pick.className = 'g-picker';
    pick.value = this.custom[key];
    pick.oninput = () => this._set(key, pick.value);
    opts.appendChild(pick);
    row.appendChild(opts);
    container.appendChild(row);
  }

  _buildUi() {
    const panel = document.getElementById('garage-options');
    panel.innerHTML = '';

    const nameRow = document.createElement('div');
    nameRow.className = 'g-row';
    nameRow.innerHTML = '<div class="g-label">Driver name</div>';
    const nameIn = document.createElement('input');
    nameIn.className = 'g-name';
    nameIn.maxLength = 14;
    nameIn.value = this.custom.name;
    nameIn.oninput = () => { this.custom.name = nameIn.value || 'Player'; saveCustom(this.custom); };
    nameRow.appendChild(nameIn);
    panel.appendChild(nameRow);

    this._optRow(panel, 'Body', BODIES, 'body');
    this._colorRow(panel, 'Primary paint', 'primary');
    this._colorRow(panel, 'Accent', 'accent');
    this._optRow(panel, 'Wheels', WHEELS, 'wheels');
    this._colorRow(panel, 'Wheel glow', 'wheelColor');
    const trailNames = Object.fromEntries(Object.entries(TRAILS).map(([k, v]) => [k, v.name]));
    this._optRow(panel, 'Boost trail', trailNames, 'trail');
    this._optRow(panel, 'Topper', TOPPERS, 'topper');
    this._refreshSelected();
  }

  _refreshSelected() {
    for (const b of document.querySelectorAll('.g-opt, .g-swatch')) {
      b.classList.toggle('selected', String(this.custom[b.dataset.key]) === b.dataset.val);
    }
  }

  show() {
    this.active = true;
    this.custom = loadCustom();
    this._buildUi();
    this._rebuildCar();
    this._resize();
    this._last = performance.now();
    const loop = (now) => {
      if (!this.active) return;
      requestAnimationFrame(loop);
      const dt = (now - this._last) / 1000;
      this._last = now;
      if (this.orbit.auto) this.orbit.yaw += dt * 0.4;
      const { yaw, pitch, dist } = this.orbit;
      this.camera.position.set(
        Math.cos(yaw) * Math.cos(pitch) * dist,
        Math.sin(pitch) * dist + 0.8,
        Math.sin(yaw) * Math.cos(pitch) * dist);
      this.camera.lookAt(0, 0.6, 0);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  hide() { this.active = false; }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(r.width, r.height);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }
}
