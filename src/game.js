// Game engine: scene/rendering, match state machine, camera, HUD, net glue
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { ARENA, BALL, CAR, MATCH, TEAMS, SPAWNS, PAD_RESPAWN_BIG, PAD_RESPAWN_SMALL, PAD_SMALL_AMOUNT, QUICKCHAT } from './config.js';
import { Ball, CarPhys, collideCarBall, collideCarCar } from './physics.js';
import { buildCar } from './carbuilder.js';
import { buildArena, BoostPads } from './arena.js';
import { Particles, SpeedLines } from './effects.js';
import { Bot } from './bot.js';
import { Net, packCar } from './net.js';

const FIXED_DT = 1 / 120;

// shortest-path angle interpolation
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function ballTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#d8dde8';
  ctx.fillRect(0, 0, 512, 256);
  // hex panel pattern
  ctx.strokeStyle = '#6b7891';
  ctx.lineWidth = 5;
  const s = 34;
  for (let row = -1; row < 9; row++) {
    for (let col = -1; col < 12; col++) {
      const x = col * s * 1.55 + (row % 2 ? s * 0.78 : 0);
      const y = row * s * 1.32;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i + Math.PI / 6;
        const px = x + Math.cos(a) * s * 0.85, py = y + Math.sin(a) * s * 0.85;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
  }
  return new THREE.CanvasTexture(cv);
}

function nameSprite(name, teamColorHex) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(name, 256, 62);
  ctx.fillStyle = '#' + teamColorHex.toString(16).padStart(6, '0');
  ctx.fillText(name, 256, 62);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false,
  }));
  sp.scale.set(9, 1.7, 1);
  return sp;
}

export class Game {
  // opts: { mode: 'free'|'bot'|'host'|'join', custom, code?, onLeave, onStatus }
  constructor(canvas, input, sfx, opts) {
    this.input = input;
    this.sfx = sfx;
    this.opts = opts;
    this.mode = opts.mode;
    this.online = this.mode === 'host' || this.mode === 'join';
    this.isAuthority = this.mode !== 'join';
    this.dead = false;

    // ---------- renderer / scene ----------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1024, 240, 640);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);
    this.camera.position.set(-70, 20, 40);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // bloom only on bright/emissive elements (higher threshold) for a clean look
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.6, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // lights — warm key sun + cool sky fill + accent rim
    this.scene.add(new THREE.HemisphereLight(0x9fc6ff, 0x1a1626, 1.0));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.5;
    Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 70, bottom: -70, far: 260 });
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6a4bff, 0.8);
    rim.position.set(-50, 30, -60);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x2a3048, 0.5));

    buildArena(this.scene);
    this.pads = new BoostPads(this.scene);
    this.particles = new Particles(this.scene);

    // ---------- ball ----------
    this.ball = new Ball();
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 40, 28),
      new THREE.MeshPhysicalMaterial({
        map: ballTexture(), metalness: 0.4, roughness: 0.22,
        clearcoat: 0.8, clearcoatRoughness: 0.2,
        emissive: 0x2a4a7a, emissiveIntensity: 0.35, envMapIntensity: 1.2,
      }));
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    this.ballLight = new THREE.PointLight(0x99bbff, 60, 30, 1.8);
    this.scene.add(this.ballLight);
    this.ballPrev = new THREE.Vector3();
    this._alpha = 1;      // render interpolation factor

    // ---------- players ----------
    this.players = new Map();  // id -> player record
    this.myId = this.mode === 'join' ? null : 'host';
    this.kickSeq = 0;
    this.score = { blue: 0, orange: 0 };
    this.clock = MATCH.duration;
    this.overtime = false;
    this.phase = 'warmup';
    this.phaseT = 0;
    this.countShown = -1;
    this.ballCam = false;   // chase cam by default; press B for ball cam

    this.myPlayer = this._addPlayer(this.mode === 'join' ? '_pending' : 'host',
      opts.custom.name || 'Player', 'blue', opts.custom, { local: true });

    if (this.mode === 'bot') {
      const botCustoms = { name: 'ChezBot', body: 'brick', primary: '#7c3aed', accent: '#22d3ee', wheels: 'neon', wheelColor: '#f97316', trail: 'plasma', topper: 'crown' };
      this._addPlayer('bot1', 'ChezBot', 'orange', botCustoms, { bot: true });
      this._startKickoff();
    } else if (this.mode === 'free') {
      this.phase = 'warmup';
      this.myPlayer.car.spawn(-40, 0, 0);
    }

    // ---------- net ----------
    this.net = null;
    if (this.online) this._setupNet();

    // ---------- HUD ----------
    this.$ = (id) => document.getElementById(id);
    this.hud = {
      boostFill: this.$('boost-fill'), boostNum: this.$('boost-num'),
      speed: this.$('speedo'), scoreB: this.$('score-blue'), scoreO: this.$('score-orange'),
      clock: this.$('clock'), banner: this.$('banner'), sub: this.$('banner-sub'),
      feed: this.$('feed'), room: this.$('room-tag'), ot: this.$('ot-tag'),
    };
    this.hud.scoreB.textContent = '0';
    this.hud.scoreO.textContent = '0';
    this.hud.room.textContent = this.online ? `ROOM ${opts.code}` : (this.mode === 'free' ? 'FREE PLAY' : 'VS BOT');
    this._bannerT = 0;

    this._accum = 0;
    this._netTimer = 0;
    this._camPos = new THREE.Vector3(-70, 14, 0);
    this._resize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', this._resize);

    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  // ================================================== players
  _addPlayer(id, name, team, custom, { local = false, bot = false } = {}) {
    const car = new CarPhys();
    const mesh = buildCar(custom, TEAMS[team].glow);
    this.scene.add(mesh);
    const tag = nameSprite(name, TEAMS[team].color);
    tag.position.y = 3.6;
    mesh.add(tag);
    if (local) tag.visible = false;
    const p = {
      id, name, team, custom, car, mesh,
      local, bot,
      brain: bot ? new Bot(team) : null,
      speedLines: new SpeedLines(this.scene, TEAMS[team].color),
      netPos: new THREE.Vector3(), netVel: new THREE.Vector3(),
      netAge: 0, boostingRemote: false, flipRemote: false,
      lastGrounded: true, flipSpin: 0,
      prevPos: new THREE.Vector3(), prevYaw: 0, prevPitch: 0, prevRoll: 0,
      renderPos: new THREE.Vector3(),
    };
    this.players.set(id, p);
    this._spawnAtSlot(p);
    return p;
  }

  _removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.mesh);
    this.scene.remove(p.speedLines.mesh);
    this.players.delete(id);
    this._feed(`${p.name} left the match`);
  }

  _teamList(team) {
    return [...this.players.values()].filter(p => p.team === team)
      .sort((a, b) => a.id < b.id ? -1 : 1);
  }

  _spawnAtSlot(p) {
    const list = this._teamList(p.team);
    const idx = Math.max(0, list.indexOf(p));
    const [sx, sz] = SPAWNS[idx % SPAWNS.length];
    const side = TEAMS[p.team].goalX;      // -1 blue, +1 orange
    // blue spawns at negative x facing +x; orange mirrored
    p.car.spawn(side * Math.abs(sx), sz, side < 0 ? 0 : Math.PI);
  }

  // ================================================== networking
  _setupNet() {
    this.net = this.opts.net;      // already-connected Net from menu
    this.net.onEvent = (t, msg, from) => this._onNet(t, msg, from);

    if (this.mode === 'host') {
      this.myId = 'host';
    } else {
      // rename pending local player once we know our peer id
      const p = this.players.get('_pending');
      this.players.delete('_pending');
      this.myId = this.net.myId;
      p.id = this.myId;
      this.players.set(this.myId, p);
      this.net.send({ t: 'hello', name: this.opts.custom.name, custom: this.opts.custom });
    }
  }

  _onNet(t, msg, from) {
    if (t === 'hello' && this.net.isHost) {
      // team balance: new player joins the smaller team; ties go orange (host is blue)
      const finalTeam = this._teamList('blue').length < this._teamList('orange').length ? 'blue' : 'orange';
      const p = this._addPlayer(from, (msg.name || 'Player').slice(0, 14), finalTeam, msg.custom);
      this._feed(`${p.name} joined ${TEAMS[finalTeam].name}`);
      this.net.sendTo(from, {
        t: 'welcome', id: from, team: finalTeam,
        players: [...this.players.values()].filter(q => q.id !== from)
          .map(q => ({ id: q.id, name: q.name, team: q.team, custom: q.custom })),
        sc: [this.score.blue, this.score.orange], ks: this.kickSeq,
      });
      this.net.broadcast({ t: 'join', p: { id: from, name: p.name, team: finalTeam, custom: msg.custom } }, from);
      // first opponent joined → start the match
      if (this.phase === 'warmup' && this._teamList('blue').length && this._teamList('orange').length) {
        this.score = { blue: 0, orange: 0 };
        this.clock = MATCH.duration;
        this.overtime = false;
        this._startKickoff();
      }
    } else if (t === 'welcome') {
      // client: adopt team + build existing players
      this.myPlayer.team = msg.team;
      this._retagPlayer(this.myPlayer);
      for (const q of msg.players) {
        if (!this.players.has(q.id)) this._addPlayer(q.id, q.name, q.team, q.custom);
      }
      this.score.blue = msg.sc[0]; this.score.orange = msg.sc[1];
      this.kickSeq = msg.ks;
      this._updateScoreHud();
      this._feed(`Joined room ${this.opts.code} — you are ${TEAMS[msg.team].name}`);
    } else if (t === 'join') {
      if (!this.players.has(msg.p.id)) {
        const p = this._addPlayer(msg.p.id, msg.p.name, msg.p.team, msg.p.custom);
        this._feed(`${p.name} joined ${TEAMS[p.team].name}`);
      }
    } else if (t === 'leave') {
      this._removePlayer(msg.id);
      if (this.net.isHost) this.net.broadcast({ t: 'leave', id: msg.id });
    } else if (t === 'car') {
      const p = this.players.get(from === 'host' ? msg.id : from);
      if (p && !p.local) this._applyCarState(p, msg.s);
    } else if (t === 's') {
      this._applyHostState(msg);
    } else if (t === 'goal') {
      this._onGoalEvent(msg.team, msg.scorer);
    } else if (t === 'count') {
      // covered by state phase; kept for reliability
    } else if (t === 'end') {
      this._onEndEvent(msg.winner);
    } else if (t === 'chat') {
      const p = this.players.get(msg.from);
      this._feed(`${p?.name ?? '???'}: ${QUICKCHAT[msg.n - 1] ?? ''}`, p ? TEAMS[p.team].color : null);
      if (this.net.isHost) this.net.broadcast(msg, from);
    } else if (t === 'demo') {
      const p = this.players.get(msg.id);
      if (p && !p.local) this._demoEffect(p);
      if (this.net.isHost) this.net.broadcast(msg, from);
    } else if (t === 'hostLeft') {
      this._feed('Host left — returning to menu');
      setTimeout(() => this.opts.onLeave(), 1800);
    }
  }

  _retagPlayer(p) {
    // rebuild mesh with correct team glow + tag color
    this.scene.remove(p.mesh);
    p.mesh = buildCar(p.custom, TEAMS[p.team].glow);
    this.scene.add(p.mesh);
    const tag = nameSprite(p.name, TEAMS[p.team].color);
    tag.position.y = 3.6;
    tag.visible = !p.local;
    p.mesh.add(tag);
    this._spawnAtSlot(p);
  }

  _applyCarState(p, s) {
    p.netPos.set(s[0], s[1], s[2]);
    p.netVel.set(s[3], s[4], s[5]);
    p.car.yaw = s[6]; p.car.pitch = s[7]; p.car.roll = s[8];
    p.boostingRemote = !!s[9];
    p.car.supersonic = !!s[10];
    p.car.demolished = s[11] ? 1 : 0;
    p.flipRemote = !!s[12];
    p.netAge = 0;
    // snap if too far, else keep for smoothing
    if (p.car.pos.distanceTo(p.netPos) > 12) p.car.pos.copy(p.netPos);
    p.car.vel.copy(p.netVel);
  }

  _applyHostState(msg) {
    // ball blend
    const bp = new THREE.Vector3(msg.b[0], msg.b[1], msg.b[2]);
    const bv = new THREE.Vector3(msg.b[3], msg.b[4], msg.b[5]);
    const err = this.ball.pos.distanceTo(bp);
    if (err > 5) { this.ball.pos.copy(bp); this.ball.vel.copy(bv); }
    else { this.ball.pos.lerp(bp, 0.25); this.ball.vel.lerp(bv, 0.4); }

    for (const [id, s] of Object.entries(msg.cars)) {
      if (id === this.myId) continue;
      const p = this.players.get(id);
      if (p && !p.local) this._applyCarState(p, s);
    }
    const [b, o] = msg.sc;
    if (b !== this.score.blue || o !== this.score.orange) {
      this.score.blue = b; this.score.orange = o;
      this._updateScoreHud();
    }
    this.clock = msg.ck;
    this.overtime = msg.ot;
    if (msg.ks !== this.kickSeq) {
      this.kickSeq = msg.ks;
      this._localKickoffReset();
    }
    this.phase = msg.ph;
  }

  // ================================================== match flow
  _startKickoff() {
    this.kickSeq++;
    this.phase = 'countdown';
    this.phaseT = MATCH.countdown;
    this.countShown = -1;
    this._localKickoffReset();
  }

  _localKickoffReset() {
    this.ball.reset();
    for (const p of this.players.values()) {
      if (p.local || p.bot || this.isAuthority) this._spawnAtSlot(p);
    }
    this.phase = 'countdown';
    this.phaseT = MATCH.countdown;
    this.countShown = -1;
  }

  _goalScored(team) {
    // authority only
    const scorer = this.ball.lastTouch ? this.players.get(this.ball.lastTouch)?.name : null;
    this.score[team]++;
    this.phase = 'goal';
    this.phaseT = MATCH.goalPause;
    if (this.online && this.net?.isHost) {
      this.net.broadcast({ t: 'goal', team, scorer });
    }
    this._onGoalEvent(team, scorer, true);
  }

  _onGoalEvent(team, scorer, isLocalAuthority = false) {
    if (!isLocalAuthority) { this.phase = 'goal'; this.phaseT = MATCH.goalPause; }
    this._updateScoreHud();
    this.particles.goalExplosion(this.ball.pos, TEAMS[team].color);
    this.sfx.goal();
    this._banner(`${TEAMS[team].name} GOAL!`, scorer ? `scored by ${scorer}` : '', TEAMS[team].color, 2.8);
    this.ball.vel.set(0, 0, 0);
    if (this.overtime) {
      // golden goal ends it
      setTimeout(() => this._endMatch(team), 600);
    }
  }

  _endMatch(winner) {
    this.phase = 'end';
    this.phaseT = 10;
    if (this.online && this.net?.isHost) this.net.broadcast({ t: 'end', winner });
    this._onEndEvent(winner, true);
  }

  _onEndEvent(winner, isLocalAuthority = false) {
    if (!isLocalAuthority) { this.phase = 'end'; this.phaseT = 10; }
    const mine = this.myPlayer.team === winner;
    this._banner(mine ? 'VICTORY!' : `${TEAMS[winner].name} WINS`,
      'next match starting soon…', TEAMS[winner].color, 6);
    this.sfx.win();
  }

  _updateScoreHud() {
    this.hud.scoreB.textContent = this.score.blue;
    this.hud.scoreO.textContent = this.score.orange;
  }

  _banner(text, sub, colorHex, dur = 2.5) {
    this.hud.banner.textContent = text;
    this.hud.banner.style.color = colorHex != null ? '#' + colorHex.toString(16).padStart(6, '0') : '#fff';
    this.hud.sub.textContent = sub || '';
    this.hud.banner.classList.add('show');
    this.hud.sub.classList.toggle('show', !!sub);
    this._bannerT = dur;
  }

  _feed(text, colorHex = null) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.textContent = text;
    if (colorHex != null) el.style.color = '#' + colorHex.toString(16).padStart(6, '0');
    this.hud.feed.appendChild(el);
    setTimeout(() => el.classList.add('fade'), 4200);
    setTimeout(() => el.remove(), 5000);
    while (this.hud.feed.children.length > 5) this.hud.feed.firstChild.remove();
  }

  _demoEffect(p) {
    this.particles.burst(p.car.pos, 0xff5533, 120, 30, 2, 1.1);
    this.particles.burst(p.car.pos, 0xffcc55, 60, 20, 1.6, 0.9);
    this.sfx.demo();
  }

  // ================================================== per-frame
  _frame(now) {
    if (this.dead) return;
    this._raf = requestAnimationFrame((t) => this._frame(t));
    let dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;

    const edges = this.input.consumeEdges();
    if (edges.pause) this.opts.onPause?.();
    if (edges.ballCam) { this.ballCam = !this.ballCam; this.sfx.ui(); }
    if (edges.reset && this.mode === 'free') { this.ball.reset(); this.ball.pos.y = 12; }
    if (edges.quickchat && this.online) {
      const msg = { t: 'chat', from: this.myId, n: edges.quickchat };
      if (this.net.isHost) this.net.broadcast(msg);
      else this.net.send(msg);
      this._feed(`${this.myPlayer.name}: ${QUICKCHAT[edges.quickchat - 1]}`, TEAMS[this.myPlayer.team].color);
    }

    // fixed-step simulation
    this._accum = Math.min(this._accum + dt, FIXED_DT * 6);
    while (this._accum >= FIXED_DT) {
      // snapshot previous transforms so rendering can interpolate (kills jitter)
      for (const p of this.players.values()) {
        p.prevPos.copy(p.car.pos);
        p.prevYaw = p.car.yaw; p.prevPitch = p.car.pitch; p.prevRoll = p.car.roll;
      }
      this.ballPrev.copy(this.ball.pos);
      this._step(FIXED_DT);
      this._accum -= FIXED_DT;
    }
    // fraction into the next physics step, for smooth interpolation
    this._alpha = this._accum / FIXED_DT;

    this._updateVisuals(dt, now / 1000);
    this._updateCamera(dt);
    this._updateHud(dt);
    this.composer.render();
  }

  _step(dt) {
    const inp = this.input.sample();
    const me = this.myPlayer;
    const simBall = this.phase === 'play' || this.phase === 'warmup' || this.phase === 'countdown';
    const carsFrozen = this.phase === 'countdown' || this.phase === 'goal';

    // ---- local car
    if (!carsFrozen || this.phase === 'goal') {
      const useInp = carsFrozen ? { throttle: 0, steer: inp.steer * 0, pitch: 0, roll: 0, boost: false, drift: false, jump: false } : inp;
      const wasGround = me.car.onGround;
      const wasBoost = me.car.boost;
      if (useInp.jump && me.car.onGround) this.sfx.jump();
      me.car.update(dt, useInp);
      if (useInp.jump && !wasGround && me.car.flipping > 0.6) this.sfx.flip();
      void wasBoost;
    }

    // ---- bots
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      const binp = p.brain.think(dt, p.car, this.ball, carsFrozen ? 'countdown' : this.phase);
      p.car.update(dt, carsFrozen ? { throttle: 0, steer: 0, pitch: 0, roll: 0, boost: false, drift: false, jump: false } : binp);
    }

    // ---- remote cars: dead-reckon between packets
    for (const p of this.players.values()) {
      if (p.local || p.bot) continue;
      p.netAge += dt;
      if (p.car.demolished <= 0) {
        p.car.pos.addScaledVector(p.car.vel, dt);
        // ease toward last known packet position
        const targ = p.netPos.clone().addScaledVector(p.netVel, Math.min(p.netAge, 0.25));
        p.car.pos.lerp(targ, 1 - Math.exp(-10 * dt));
        if (p.car.pos.y < CAR.hoverY) p.car.pos.y = CAR.hoverY;
      }
    }

    // ---- ball
    if (simBall && this.phase !== 'countdown') {
      this.ball.update(dt);
      // collisions with every car
      for (const p of this.players.values()) {
        const impact = collideCarBall(p.car, this.ball);
        if (impact > 0.5) {
          this.ball.lastTouch = p.id;
          if (impact > 4) this.sfx.ballHit(impact);
          if (impact > 18) this.particles.burst(this.ball.pos, 0xffffff, 14, 10, 1, 0.4);
        }
      }
    }

    // ---- car-car
    const list = [...this.players.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const res = collideCarCar(a.car, b.car);
      if (res === 'bump') this.sfx.bump();
      if (res === 'demo') {
        // victim = b of the pair whose attacker is supersonic; only act on our own car or bots
        const victim = b.car.supersonic && !a.car.supersonic ? a : b;
        if (victim.local || (victim.bot && this.isAuthority)) {
          victim.car.demolished = 3;
          this._demoEffect(victim);
          if (this.online) {
            const msg = { t: 'demo', id: victim.id };
            this.net.isHost ? this.net.broadcast(msg) : this.net.send(msg);
          }
        }
      }
    }
    // respawn own demolished car
    for (const p of this.players.values()) {
      if ((p.local || (p.bot && this.isAuthority)) && p.car.demolished > 0 && p.car.demolished <= dt * 1.5) {
        this._spawnAtSlot(p);
      }
    }

    // ---- boost pads (local + bot pickup)
    for (const pad of this.pads.pads) {
      if (pad.timer > 0) continue;
      for (const p of this.players.values()) {
        if (!(p.local || (p.bot && this.isAuthority))) continue;
        const dx = p.car.pos.x - pad.x, dz = p.car.pos.z - pad.z;
        if (dx * dx + dz * dz < pad.r * pad.r && p.car.pos.y < 4) {
          if (p.car.boost >= 100 && !pad.big) continue;
          p.car.boost = Math.min(100, p.car.boost + (pad.big ? 100 : PAD_SMALL_AMOUNT));
          pad.timer = pad.big ? PAD_RESPAWN_BIG : PAD_RESPAWN_SMALL;
          if (p.local) this.sfx.pad(pad.big);
          break;
        }
      }
    }

    // ---- match phases (authority)
    if (this.isAuthority) {
      if (this.phase === 'countdown') {
        this.phaseT -= dt;
        const n = Math.ceil(this.phaseT);
        if (n !== this.countShown && n > 0) {
          this.countShown = n;
          this._banner(String(n), '', 0xffffff, 0.9);
          this.sfx.count();
        }
        if (this.phaseT <= 0) {
          this.phase = 'play';
          this._banner('GO!', '', 0x7cff5e, 0.8);
          this.sfx.go();
        }
      } else if (this.phase === 'play') {
        if (this.mode !== 'free') {
          if (this.overtime) this.clock += dt;
          else this.clock = Math.max(0, this.clock - dt);
        }
        const g = this.ball.checkGoal();
        if (g) this._goalScored(g);
        else if (!this.overtime && this.clock <= 0 && this.mode !== 'free') {
          if (this.score.blue === this.score.orange && this.ball.pos.y < BALL.radius + 0.5 && this.ball.vel.length() < 10) {
            this.overtime = true;
            this.clock = 0;
            this._banner('OVERTIME', 'next goal wins', 0xffd166, 3);
            this.sfx.whistle();
            this._startKickoff();
          } else if (this.score.blue !== this.score.orange) {
            this._endMatch(this.score.blue > this.score.orange ? 'blue' : 'orange');
          }
        }
      } else if (this.phase === 'goal') {
        this.phaseT -= dt;
        if (this.phaseT <= 0) this._startKickoff();
      } else if (this.phase === 'end') {
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          this.score = { blue: 0, orange: 0 };
          this._updateScoreHud();
          this.clock = MATCH.duration;
          this.overtime = false;
          this._startKickoff();
        }
      } else if (this.phase === 'warmup' && this.mode === 'free') {
        const g = this.ball.checkGoal();
        if (g) {
          this.particles.goalExplosion(this.ball.pos, TEAMS[g].color);
          this.sfx.goal();
          this._banner(`${TEAMS[g].name} GOAL!`, '', TEAMS[g].color, 2);
          this.ball.reset();
        }
      }
    } else {
      // client-side countdown display from phase
      if (this.phase === 'countdown') {
        this.phaseT -= dt;
        const n = Math.ceil(Math.max(this.phaseT, 0.01));
        if (n !== this.countShown && n > 0 && n <= 3) {
          this.countShown = n;
          this._banner(String(n), '', 0xffffff, 0.9);
          this.sfx.count();
        }
      }
    }

    // ---- network send
    if (this.online) {
      this._netTimer -= dt;
      if (this._netTimer <= 0) {
        this._netTimer = 1 / 30;
        if (this.net.isHost) {
          const cars = {};
          for (const p of this.players.values()) cars[p.id] = packCar(p.car);
          this.net.broadcast({
            t: 's',
            b: [this.ball.pos.x, this.ball.pos.y, this.ball.pos.z,
                this.ball.vel.x, this.ball.vel.y, this.ball.vel.z].map(v => Math.round(v * 100) / 100),
            cars, sc: [this.score.blue, this.score.orange],
            ck: Math.round(this.clock * 10) / 10, ph: this.phase, ks: this.kickSeq, ot: this.overtime,
          });
        } else {
          this.net.send({ t: 'car', s: packCar(this.myPlayer.car) });
        }
      }
    }
  }

  // ================================================== visuals
  _updateVisuals(dt, t) {
    this.pads.update(dt, t);
    this.particles.update(dt);
    const a = this._alpha;

    // ball (interpolated between physics steps)
    const bpos = this.ballMesh.position.copy(this.ballPrev).lerp(this.ball.pos, a);
    this.ballMesh.rotation.x += this.ball.spin.x * dt;
    this.ballMesh.rotation.z += this.ball.spin.z * dt;
    this.ballLight.position.copy(bpos); this.ballLight.position.y += 2;
    if (this.ball.vel.length() > 35) {
      this.particles.emit(bpos.x, bpos.y, bpos.z, 0, 0, 0, 0x88aaff, 2.2, 0.3, 0);
    }

    // cars
    const back = new THREE.Vector3();
    for (const p of this.players.values()) {
      const c = p.car;
      p.mesh.visible = c.demolished <= 0;
      if (c.demolished > 0) { p.speedLines.update(c.pos, c.vel, false); continue; }

      // interpolated render transform
      const rpos = p.renderPos.copy(p.prevPos).lerp(c.pos, a);
      const ryaw = angleLerp(p.prevYaw, c.yaw, a);
      const rpitch = angleLerp(p.prevPitch, c.pitch, a);
      const rroll = angleLerp(p.prevRoll, c.roll, a);
      p.speedLines.update(rpos, c.vel, c.supersonic && c.demolished <= 0);

      p.mesh.position.copy(rpos);
      // flip animation (visual barrel/front spin)
      let flipPitch = 0, flipRoll = 0;
      if ((p.local || p.bot) ? c.flipping > 0 : p.flipRemote) {
        const k = p.local || p.bot ? (0.65 - c.flipping) / 0.65 : (t * 2 % 1);
        const fx = p.local || p.bot ? c.flipDir.x : 1;
        const fy = p.local || p.bot ? c.flipDir.y : 0;
        flipPitch = -fx * Math.sin(k * Math.PI * 2) * 1.0;
        flipRoll = fy * Math.sin(k * Math.PI * 2) * 1.0;
      }
      p.mesh.rotation.set(0, 0, 0);
      p.mesh.rotateY(ryaw);
      p.mesh.rotateZ(rpitch + flipPitch);
      p.mesh.rotateX(rroll + flipRoll);

      // wheels spin (based on forward speed)
      const fwdSpeed = c.vel.x * Math.cos(c.yaw) - c.vel.z * Math.sin(c.yaw);
      for (const w of p.mesh.userData.wheels) w.rotation.z -= fwdSpeed * dt * 1.4;

      // boost flame
      const boosting = p.local || p.bot ? (c.boosting && c.boost > 0) : p.boostingRemote;
      if (boosting) {
        for (const [ax, ay, az] of p.mesh.userData.boostAnchors) {
          const anchor = new THREE.Vector3(ax, ay, az).applyEuler(p.mesh.rotation).add(rpos);
          back.set(-Math.cos(ryaw), 0.1, Math.sin(ryaw));
          this.particles.boostTrail(anchor, back, p.custom.trail, dt, t);
        }
      }
    }
  }

  _updateCamera(dt) {
    const me = this.myPlayer;
    const c = me.car;
    const carPos = me.renderPos;          // interpolated (smooth)
    const ballPos = this.ballMesh.position;
    const k = 1 - Math.exp(-9 * dt);
    const DIST = 13, HEIGHT = 5.2;

    // smoothed horizontal "behind" direction so the camera swings gently
    this._camDir ??= new THREE.Vector3(-Math.cos(c.yaw), 0, Math.sin(c.yaw));
    const targetDir = new THREE.Vector3();

    if (this.ballCam) {
      // behind the car along the car→ball axis (keeps ball framed)
      targetDir.copy(carPos).sub(ballPos).setY(0);
      if (targetDir.lengthSq() < 4) targetDir.copy(this._camDir); // too close: hold
      targetDir.normalize();
    } else {
      // behind the car's heading, biased slightly toward travel direction
      const heading = new THREE.Vector3(-Math.cos(c.yaw), 0, Math.sin(c.yaw));
      const travel = new THREE.Vector3(-c.vel.x, 0, -c.vel.z);
      if (travel.lengthSq() > 25) { heading.lerp(travel.normalize(), 0.25); heading.normalize(); }
      targetDir.copy(heading);
    }
    // ease camera direction (a bit snappier for chase cam)
    this._camDir.lerp(targetDir, this.ballCam ? k * 0.6 : k).normalize();

    const desired = new THREE.Vector3().copy(carPos)
      .addScaledVector(this._camDir, DIST);
    desired.y = Math.max(2.4, carPos.y + HEIGHT);
    this._camPos.lerp(desired, k);
    this.camera.position.copy(this._camPos);

    // look target: toward the ball in ball cam, ahead of the car otherwise
    const look = this.ballCam
      ? ballPos.clone().setY(ballPos.y + 1).lerp(carPos, 0.12)
      : carPos.clone().addScaledVector(this._camDir, -14).setY(carPos.y + 2.6);
    this.camera.lookAt(look);

    // speed FOV kick
    const targetFov = 70 + Math.min(16, Math.max(0, c.vel.length() - 26) * 0.55);
    this.camera.fov += (targetFov - this.camera.fov) * k;
    this.camera.updateProjectionMatrix();
  }

  _updateHud(dt) {
    const c = this.myPlayer.car;
    this.hud.boostFill.style.width = c.boost + '%';
    this.hud.boostNum.textContent = Math.round(c.boost);
    const spd = Math.round(c.vel.length() * 2.4); // fake km/h
    this.hud.speed.textContent = spd;
    this.hud.speed.classList.toggle('supersonic', c.supersonic);

    if (this.mode === 'free') {
      this.hud.clock.textContent = '∞';
    } else {
      const s = Math.max(0, Math.ceil(this.clock));
      this.hud.clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    this.hud.ot.style.display = this.overtime ? 'block' : 'none';

    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) {
        this.hud.banner.classList.remove('show');
        this.hud.sub.classList.remove('show');
      }
    }

    // engine sound
    this.sfx.engine(Math.min(1, c.vel.length() / CAR.maxBoost), c.boosting && c.boost > 0, dt);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this._raf);
    removeEventListener('resize', this._resize);
    this.sfx.stopEngine();
    this.net?.close();
    this.renderer.dispose();
  }
}
