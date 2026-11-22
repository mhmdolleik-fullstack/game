// ─── Audio Manager ───
// Procedural sound synthesis using Web Audio API

export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) this.enable();
  }

  enable(): void {
    if (this.muted) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        this.ctx ??= new AC();
        this.ctx.resume().catch(() => {});
      }
    } catch { /* Audio not available */ }
  }

  tone(
    from: number,
    to: number,
    duration: number,
    kind: OscillatorType = 'triangle',
    volume = 0.06
  ): void {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = this.ctx.currentTime;

      osc.type = kind;
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(to, 0.01), start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain).connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    } catch { /* Ignore audio errors */ }
  }

  // Convenience methods for common sounds
  jump(boosted = false): void {
    this.tone(170, boosted ? 530 : 274, 0.14);
  }

  land(): void {
    this.tone(90, 53, 0.09, 'triangle', 0.037);
  }

  death(): void {
    this.tone(110, 39, 0.27, 'sawtooth');
  }

  shieldOn(): void {
    this.tone(115, 410, 0.18);
  }

  shieldOff(): void {
    this.tone(320, 95, 0.18);
  }

  checkpoint(): void {
    this.tone(280, 690, 0.24);
  }

  levelClear(): void {
    this.tone(280, 750, 0.38);
  }

  shoot(): void {
    this.tone(650, 170, 0.09, 'triangle');
  }

  enemyHit(): void {
    this.tone(260, 150, 0.13);
  }

  enemyKill(): void {
    this.tone(430, 76, 0.13);
  }

  dash(): void {
    this.tone(390, 110, 0.14);
  }

  secret(): void {
    this.tone(380, 800, 0.4);
  }

  crumble(): void {
    this.tone(85, 37, 0.2, 'sawtooth');
  }

  nova(): void {
    this.tone(200, 600, 0.2, 'sine', 0.08);
  }

  warden(): void {
    this.tone(165, 72, 0.12);
  }

  playNote(note: number, tempo: number): void {
    this.tone(note, note * 0.99, 0.34, 'sine', 0.018);
  }

  playBass(): void {
    this.tone(49, 36, 0.75, 'triangle', 0.016);
  }

  pickup(): void {
    this.tone(390, 760, 0.18);
  }
}
