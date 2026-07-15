// Entry point: menu wiring, screen management, game lifecycle
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { Garage, loadCustom } from './garage.js';
import { Net, makeCode } from './net.js';

const input = new Input();
const sfx = new Sfx();
const canvas = document.getElementById('game-canvas');

let game = null;
let garage = null;
let pendingNet = null;

const screens = ['screen-main', 'screen-online', 'screen-garage', 'screen-pause', 'hud'];
function show(...ids) {
  for (const s of screens) {
    document.getElementById(s).classList.toggle('hidden', !ids.includes(s));
  }
}

function setStatus(text, isError = false) {
  const el = document.getElementById('online-status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function startGame(mode, extras = {}) {
  sfx.init();
  const custom = loadCustom();
  if (game) { game.destroy(); game = null; }
  show('hud');
  game = new Game(canvas, input, sfx, {
    mode, custom,
    ...extras,
    onLeave: leaveGame,
    onPause: () => {
      document.getElementById('screen-pause').classList.remove('hidden');
    },
  });
}

function leaveGame() {
  if (game) { game.destroy(); game = null; }
  pendingNet = null;
  show('screen-main');
}

// ---------- main menu ----------
document.getElementById('btn-free').onclick = () => { sfx.init(); sfx.ui(); startGame('free'); };
document.getElementById('btn-bot').onclick = () => { sfx.init(); sfx.ui(); startGame('bot'); };
document.getElementById('btn-online').onclick = () => {
  sfx.init(); sfx.ui();
  setStatus('');
  show('screen-online');
};
document.getElementById('btn-garage').onclick = () => {
  sfx.init(); sfx.ui();
  show('screen-garage');
  garage ??= new Garage(document.getElementById('garage-canvas'), sfx);
  garage.show();
};

// ---------- garage ----------
document.getElementById('btn-garage-back').onclick = () => {
  sfx.ui();
  garage.hide();
  show('screen-main');
};

// ---------- online ----------
document.getElementById('btn-host').onclick = () => {
  sfx.ui();
  setStatus('Creating room…');
  const code = makeCode();
  const net = new Net();
  pendingNet = net;
  net.host(code,
    () => {
      if (pendingNet !== net) { net.close(); return; }
      pendingNet = null;
      startGame('host', { net, code });
    },
    (err) => { setStatus(err, true); net.close(); });
};

document.getElementById('btn-join').onclick = () => {
  sfx.ui();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length !== 4) { setStatus('Enter the 4-letter room code.', true); return; }
  setStatus('Connecting…');
  const net = new Net();
  pendingNet = net;
  net.join(code,
    () => {
      if (pendingNet !== net) { net.close(); return; }
      pendingNet = null;
      startGame('join', { net, code });
    },
    (err) => { setStatus(err, true); net.close(); });
};

document.getElementById('btn-online-back').onclick = () => {
  sfx.ui();
  pendingNet?.close();
  pendingNet = null;
  show('screen-main');
};

document.getElementById('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
  e.stopPropagation();
});

// ---------- pause ----------
document.getElementById('btn-resume').onclick = () => {
  sfx.ui();
  document.getElementById('screen-pause').classList.add('hidden');
};
document.getElementById('btn-leave').onclick = () => {
  sfx.ui();
  document.getElementById('screen-pause').classList.add('hidden');
  leaveGame();
};

show('screen-main');
