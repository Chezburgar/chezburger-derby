// Keyboard + gamepad input, edge detection for jump

export class Input {
  constructor() {
    this.keys = new Set();
    this.jumpPressed = false;      // edge, consumed each frame
    this._jumpDown = false;
    this.quickchat = 0;            // 1..4 edge
    this.pausePressed = false;
    this.ballCamToggled = false;
    this.resetPressed = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'Escape') this.pausePressed = true;
      if (e.code === 'KeyB' || e.code === 'KeyY') this.ballCamToggled = true;
      if (e.code === 'KeyR') this.resetPressed = true;
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 4) this.quickchat = n;
      }
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  _key(...codes) { return codes.some(c => this.keys.has(c)); }

  // returns {throttle, steer, boost, drift, jump(edge), pitch, roll}
  sample() {
    let throttle = 0, steer = 0, pitch = 0, roll = 0;
    if (this._key('KeyW', 'ArrowUp')) throttle += 1;
    if (this._key('KeyS', 'ArrowDown')) throttle -= 1;
    if (this._key('KeyD', 'ArrowRight')) steer += 1;
    if (this._key('KeyA', 'ArrowLeft')) steer -= 1;
    const drift = this._key('ControlLeft', 'ControlRight', 'KeyC');
    const boost = this._key('ShiftLeft', 'ShiftRight');
    // air pitch mirrors throttle keys, air roll uses Q/E
    pitch = throttle;
    if (this._key('KeyQ')) roll -= 1;
    if (this._key('KeyE')) roll += 1;

    // gamepad (first connected): left stick steer/pitch, A jump, B/RB boost, X drift
    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      const dz = v => Math.abs(v) > 0.15 ? v : 0;
      steer = steer || dz(gp.axes[0]);
      pitch = pitch || -dz(gp.axes[1]);
      throttle = throttle || (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
      if (gp.buttons[0]?.pressed && !this._gpA) this.jumpPressed = true;
      this._gpA = gp.buttons[0]?.pressed;
      if (gp.buttons[1]?.pressed || gp.buttons[5]?.pressed) return this._pack(throttle, steer, pitch, roll, true, gp.buttons[2]?.pressed);
      return this._pack(throttle, steer, pitch, roll, boost, drift || gp.buttons[2]?.pressed);
    }
    return this._pack(throttle, steer, pitch, roll, boost, drift);
  }

  _pack(throttle, steer, pitch, roll, boost, drift) {
    const jump = this.jumpPressed;
    this.jumpPressed = false;
    return { throttle, steer, pitch, roll, boost, drift, jump };
  }

  consumeEdges() {
    const out = {
      pause: this.pausePressed,
      ballCam: this.ballCamToggled,
      reset: this.resetPressed,
      quickchat: this.quickchat,
    };
    this.pausePressed = this.ballCamToggled = this.resetPressed = false;
    this.quickchat = 0;
    return out;
  }
}
