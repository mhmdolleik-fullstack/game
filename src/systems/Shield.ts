// ─── Shield System ───
// Ported from survival.ts — Manual activation, 3s protection, 20s cooldown

import { SHIELD_DURATION, SHIELD_COOLDOWN } from '../constants';

export class ShieldSystem {
  private remaining = 0;
  private recovery = 0;
  private pressed = false;

  get active(): boolean {
    return this.remaining > 0;
  }

  get cooldown(): number {
    return this.recovery;
  }

  get duration(): number {
    return this.remaining;
  }

  /** Charge ratio 0–1: 1 = ready, during active = remaining/max, during cooldown = 1 - cooldown/max */
  get charge(): number {
    if (this.active) return this.remaining / SHIELD_DURATION;
    if (this.recovery > 0) return 1 - this.recovery / SHIELD_COOLDOWN;
    return 1;
  }

  get statusText(): string {
    if (this.active) return `Protected ${this.remaining.toFixed(1)}s`;
    if (this.recovery > 0) return `Recharge ${Math.ceil(this.recovery)}s`;
    return 'Shield ready';
  }

  reset(held: boolean): void {
    this.remaining = 0;
    this.recovery = 0;
    this.pressed = held;
  }

  update(dt: number, held: boolean): boolean {
    const wasActive = this.active;
    const consumed = Math.min(this.remaining, dt);
    this.remaining = Math.max(0, this.remaining - consumed);
    this.recovery = Math.max(0, this.recovery - (dt - consumed));

    if (held && !this.pressed && this.remaining === 0 && this.recovery === 0) {
      this.remaining = SHIELD_DURATION;
      this.recovery = SHIELD_COOLDOWN;
    }

    this.pressed = held;

    // Return true if shield state just changed
    return wasActive !== this.active;
  }
}
