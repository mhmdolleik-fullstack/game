/** Simulation time stops while menus are open. A held button never re-arms the shield. */
class TimedShield {
  private remaining = 0;
  private recovery = 0;
  private pressed = false;
  get active(): boolean { return this.remaining > 0; }
  get cooldown(): number { return this.recovery; }
  get duration(): number { return this.remaining; }
  reset(held: boolean): void {
    this.remaining = 0;
    this.recovery = 0;
    this.pressed = held;
  }
  update(dt: number, held: boolean): void {
    const consumed = Math.min(this.remaining, dt);
    this.remaining = Math.max(0, this.remaining - consumed);
    this.recovery = Math.max(0, this.recovery - (dt - consumed));
    if (held && !this.pressed && this.remaining === 0 && this.recovery === 0) {
      this.remaining = 3;
      this.recovery = 20;
    }
    this.pressed = held;
  }
}
