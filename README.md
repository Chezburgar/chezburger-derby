# 🍔 Chezburger Derby

A rocket-powered car-soccer game — a 3D Rocket League tribute built with **Three.js**, running entirely in the browser with **no build step** and **no backend**. Deploys straight to GitHub Pages.

**▶ Play:** https://chezburgar.github.io/chezburger-derby/

## Features

- **Clean arcade physics** — fixed-timestep (120 Hz) simulation: driving, drifting, jumps, double-jumps, directional air-dodges/flips, boost, wall-rides, supersonic demolitions, and meaty car-ball impacts.
- **Full stadium** — glassed arena with corner cuts, glowing goals + nets, animated boost pads (big & small), light towers, a procedural starfield sky, and a pixel crowd.
- **Deep customization garage** — 4 body types, primary/accent paint (palette + custom color picker), 3 wheel styles with glow color, 6 boost-trail flavors, and 6 hood toppers, all previewed on a live 3D turntable. Saved to `localStorage`.
- **Online multiplayer** — peer-to-peer via [PeerJS](https://peerjs.com) (works on static hosting). One player hosts and shares a 4-letter room code; friends join. Host is authoritative for ball/score/clock with client-side prediction and smoothing.
- **Single-player modes** — VS Bot (with a competent chasing/shooting AI) and Free Play (infinite training).
- **Juice** — bloom post-processing, particle boost trails, goal explosions, speed-based FOV kick, ball cam, quick chat, and fully procedural WebAudio sound effects (engine, boost, hits, goals — zero audio files).

## Controls

| Key | Action |
| --- | --- |
| `W` / `S` | Throttle / reverse (air: pitch) |
| `A` / `D` | Steer (air: yaw) |
| `Space` | Jump — press again for double-jump; hold a direction for a flip/dodge |
| `Shift` | Boost |
| `Ctrl` / `C` | Drift (powerslide) |
| `Q` / `E` | Air roll |
| `B` | Toggle ball cam |
| `1`–`4` | Quick chat (online) |
| `Esc` | Pause |

Gamepad supported (left stick, A = jump, RB/B = boost, X = drift).

## Running locally

Any static file server works — the game uses ES modules and an import map, so it must be served over HTTP (not opened as a `file://`):

```bash
npx http-server -p 8123 -c-1 .
# then open http://localhost:8123
```

## Tech

- [Three.js](https://threejs.org) 0.160 via CDN + import map (no bundler)
- [PeerJS](https://peerjs.com) for WebRTC data channels
- Vanilla JS modules, one file per system (`config`, `input`, `physics`, `carbuilder`, `arena`, `effects`, `audio`, `bot`, `net`, `garage`, `game`, `main`)

All assets are generated procedurally at runtime (textures via canvas, geometry via code, audio via WebAudio) — the whole game is just code, so it loads instantly and hosts anywhere.
