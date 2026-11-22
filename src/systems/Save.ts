// ─── Save Manager ───
// Persistent progress using localStorage

const PREFIX = 'faultline.';

export class SaveManager {
  static read(key: string, fallback: string = ''): string {
    try {
      return localStorage.getItem(PREFIX + key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  static save(key: string, value: string | number | bigint): void {
    try {
      localStorage.setItem(PREFIX + key, String(value));
    } catch {
      // Private browsing may disable storage
    }
  }

  static getChapter(): bigint {
    const stored = this.read('chapter', '1');
    return /^[1-9][0-9]*$/.test(stored) ? BigInt(stored) : 1n;
  }

  static getHighest(current: bigint): bigint {
    const raw = this.read('highest', current.toString());
    const match = raw.match(/^[1-9][0-9]*$/);
    let h = match ? BigInt(match[0]) : current;
    if (h < current) h = current;
    return h;
  }

  static saveCheckpoint(number: bigint, checkpointX: number, deaths: number): void {
    this.save('checkpoint-v2', `${number}:${checkpointX}:${deaths}`);
  }

  static getCheckpoint(number: bigint): { x: number; deaths: number } | null {
    const parts = this.read('checkpoint-v2', '').split(':');
    if (parts[0] === String(number)) {
      const x = Number(parts[1]);
      const deaths = Number(parts[2]);
      if (Number.isFinite(x) && Number.isSafeInteger(deaths) && deaths >= 0) {
        return { x, deaths };
      }
    }
    return null;
  }

  static saveRouteSegment(number: bigint, segment: bigint): void {
    this.save('route-segment', `${number}:${segment}`);
  }

  static getRouteSegment(number: bigint): bigint {
    const parts = this.read('route-segment', '').split(':');
    if (parts[0] === String(number) && /^[0-9]+$/.test(parts[1])) {
      return BigInt(parts[1]);
    }
    return 0n;
  }

  static clearRouteSegment(): void {
    this.save('route-segment', '');
  }

  static getMuted(): boolean {
    return this.read('muted', 'false') === 'true';
  }

  static setMuted(muted: boolean): void {
    this.save('muted', String(muted));
  }

  static getTotalStats(): { deaths: number; kills: number; time: number } {
    return {
      deaths: Number(this.read('totalDeaths', '0')) || 0,
      kills: Number(this.read('totalKills', '0')) || 0,
      time: Number(this.read('totalTime', '0')) || 0,
    };
  }

  static addStats(deaths: number, kills: number, time: number): void {
    const stats = this.getTotalStats();
    this.save('totalDeaths', stats.deaths + deaths);
    this.save('totalKills', stats.kills + kills);
    this.save('totalTime', Math.round(stats.time + time));
  }
}
