// Chezburger Derby — global tuning constants

export const ARENA = {
  halfL: 80,      // half length (goals on +x / -x walls)
  halfW: 51,      // half width
  height: 38,     // ceiling
  corner: 18,     // 45° corner cut size
  goalW: 22,      // goal opening width
  goalH: 13,      // goal opening height
  goalD: 10,      // goal depth behind wall
};

export const BALL = {
  radius: 2.7,
  gravity: -44,
  restitution: 0.72,
  wallRestitution: 0.78,
  airDrag: 0.028,
  rollFriction: 0.55,
  maxSpeed: 100,
};

export const CAR = {
  gravity: -58,
  // physics box half-extents (x=length dir, y, z=width dir in local space)
  boxL: 2.7, boxH: 0.95, boxW: 1.8,
  hoverY: 0.95,          // resting height of car center
  maxDrive: 36,
  maxReverse: 22,
  maxBoost: 56,
  supersonic: 49,
  accel: 42,
  brake: 70,
  boostAccel: 38,
  boostUse: 30,          // per second (out of 100)
  yawRate: 2.55,
  driftYawMult: 1.45,
  latFriction: 9.5,
  driftLatFriction: 1.9,
  rollFriction: 1.1,
  jumpImpulse: 20,
  doubleJumpImpulse: 13,
  flipImpulse: 17.5,
  flipWindow: 1.25,      // seconds after first jump a flip is allowed
  airYawRate: 2.4,
  airPitchRate: 3.1,
};

export const MATCH = {
  duration: 300,         // 5:00
  countdown: 3,
  goalPause: 3.2,
};

export const TEAMS = {
  blue:   { color: 0x2f8bff, glow: 0x1f6fff, name: 'BLUE',   goalX: -1 }, // blue defends -x
  orange: { color: 0xff8c1a, glow: 0xff7a00, name: 'ORANGE', goalX:  1 },
};

// boost pads: [x, z, big]
export const PADS = [
  [-61.4, -40.5, true], [-61.4, 40.5, true], [61.4, -40.5, true], [61.4, 40.5, true],
  [0, -42.4, true], [0, 42.4, true],
  [-36, 0, false], [36, 0, false], [0, 0, false],
  [-36, -30, false], [-36, 30, false], [36, -30, false], [36, 30, false],
  [-64, 0, false], [64, 0, false],
  [-14, -20, false], [-14, 20, false], [14, -20, false], [14, 20, false],
];

export const PAD_RESPAWN_BIG = 10;
export const PAD_RESPAWN_SMALL = 4;
export const PAD_SMALL_AMOUNT = 12;

// spawn slots per team: [x(scaled by goal side), z, yawFacingCenter]
export const SPAWNS = [
  [-60, 0], [-58, -18], [-58, 18], [-70, -8], [-70, 8],
];

export const QUICKCHAT = ['Nice shot!', 'What a save!', 'Wow!', 'Chezburger!!! 🍔'];

export const DEFAULT_CUSTOM = {
  name: 'Player',
  body: 'burger',
  primary: '#e63946',
  accent: '#ffd166',
  wheels: 'sport',
  wheelColor: '#22d3ee',
  trail: 'flame',
  topper: 'none',
};
