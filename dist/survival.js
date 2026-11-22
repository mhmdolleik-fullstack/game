"use strict";
/** Simulation time stops while menus are open. A held button never re-arms the shield. */
class TimedShield {
    constructor() {
        this.remaining = 0;
        this.recovery = 0;
        this.pressed = false;
    }
    get active() { return this.remaining > 0; }
    get cooldown() { return this.recovery; }
    get duration() { return this.remaining; }
    reset(held) {
        this.remaining = 0;
        this.recovery = 0;
        this.pressed = held;
    }
    update(dt, held) {
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
