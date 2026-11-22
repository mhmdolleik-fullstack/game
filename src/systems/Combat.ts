// ─── Combat System ───
// Enemy AI, shooting, projectiles, traps — ported from combat.js

import type {
  Chapter, PlayerState, CreatureState, EnemyState,
  Bolt, TrapState, AmmoItem, LedgePlatform, GunDef,
} from '../types';
import { MAX_AMMO, RELOAD_TIME, NOVA_COOLDOWN, NOVA_RANGE, NOVA_DAMAGE } from '../constants';
import { WORLD_NAMES, WORLD_MODIFIERS, POPULATION_TYPES } from '../constants';

export class CombatSystem {
  world = '';
  aim: number | null = null;
  tier = 0;
  gun = 0;
  kills = 0;
  shots = 0;
  ammo = MAX_AMMO;
  reload = 0;
  recoil = 0;
  shake = 0;
  cool = 0;
  pulse = 0;
  bolts: Bolt[] = [];
  hostiles: EnemyState[] = [];
  ledges: LedgePlatform[] = [];
  trap: TrapState = { x: 0, y: 0, age: -1, delay: 0.4, kind: 0 };
  items: AmmoItem[] = [];
  warden: EnemyState | null = null;
  sceneTimer = 0;

  readonly guns: GunDef[] = [
    { name: 'Pulse', cooldown: 0.28, speed: 560, damage: 1, color: '#9fffe6' },
    { name: 'Twin arc', cooldown: 0.21, speed: 620, damage: 1, color: '#cda8ff' },
    { name: 'Flux lance', cooldown: 0.43, speed: 780, damage: 3, color: '#ffca7d' },
  ];

  private burstCallback: ((x: number, y: number, color: string, count: number) => void) | null = null;
  private toneCallback: ((from: number, to: number, duration: number, kind?: OscillatorType, vol?: number) => void) | null = null;

  setBurstCallback(cb: (x: number, y: number, color: string, count: number) => void): void {
    this.burstCallback = cb;
  }

  setToneCallback(cb: (from: number, to: number, duration: number, kind?: OscillatorType, vol?: number) => void): void {
    this.toneCallback = cb;
  }

  private burst(x: number, y: number, color: string, count: number): void {
    this.burstCallback?.(x, y, color, count);
  }

  private tone(from: number, to: number, duration: number, kind?: OscillatorType, vol?: number): void {
    this.toneCallback?.(from, to, duration, kind, vol);
  }

  setup(chapter: Chapter, number: bigint, segment: bigint, highest: bigint): void {
    const z = chapter.zoneIndex;

    this.world = chapter.episode === 1n
      ? WORLD_NAMES[z]
      : WORLD_MODIFIERS[Number((chapter.episode + BigInt(z)) % 7n)] + ' ' +
        WORLD_NAMES[z] + ' / ' + chapter.episode;

    this.aim = null;
    this.tier = highest >= 10n ? 2 : highest >= 4n ? 1 : 0;
    this.gun = this.tier;
    this.kills = 0;
    this.shots = 0;
    this.sceneTimer = 0;
    this.hostiles = [];
    this.ledges = [];

    const route = chapter.platforms;
    const options = route.slice(2, -1).filter(p => !p.checkpoint);
    const optLen = BigInt(options.length);
    const site = options[Number((number * 17n + segment * 13n) % optLen)];

    this.trap = {
      x: site.x + site.w * (0.32 + Number((number * 29n) % 49n) / 100),
      y: site.y,
      age: -1,
      delay: 0.38 + Number(number % 19n) * 0.015,
      kind: Number(number % 3n),
    };

    // Create ledges (rescue platforms)
    for (let i = 2; i < route.length - 1; i++) {
      const p = route[i];
      if (i % 7 === 2) {
        this.ledges.push({
          x: p.x + p.w - 15,
          y: 376,
          w: route[i + 1].x - p.x - p.w + 42,
          crack: 0,
          section: p.section,
        });
      }
    }

    // Spawn enemies
    for (let i = 2; i < route.length - 1; i++) {
      const p = route[i];
      if (p.checkpoint || (i % 4 !== 2 && !(z === 3 && i % 4 === 3))) continue;

      const kinds = POPULATION_TYPES[z];
      const kind = kinds[(i + Number(number % 3n)) % kinds.length];
      this.hostiles.push({
        kind,
        home: p.x + p.w * 0.56,
        floor: p.y,
        left: p.x + 6,
        right: p.x + p.w - 6,
        strength: kind === 'sentinel' ? 4 : z === 3 ? 2 : 1,
        flying: ['drone', 'raptor', 'kite'].includes(kind),
        hp: 0, x: 0, y: 0, age: 0, flash: 0, reload: 1.5,
      });
    }

    // Zombie chapter wave enemies
    if (z === 3) {
      for (const p of route.filter(p => p.checkpoint && p.section === 3).slice(0, 2)) {
        for (let j = 0; j < 3; j++) {
          this.hostiles.push({
            kind: ['walker', 'runner', 'burrower'][j],
            home: p.x + p.w - 24 - j * 18,
            floor: p.y,
            left: p.x + 105,
            right: p.x + p.w - 5,
            strength: 2,
            flying: false,
            hp: 0, x: 0, y: 0, age: 0, flash: 0, reload: 1.5,
            waveDelay: j * 0.6,
          });
        }
      }
    }

    // Boss (Gate Warden) on chapter-ending levels
    this.warden = null;
    if (chapter.level === 20 && segment === chapter.segments - 1n) {
      const deck = route[route.length - 1];
      this.warden = {
        kind: 'warden',
        home: deck.x + deck.w * 0.52,
        floor: deck.y,
        left: deck.x + 30,
        right: deck.x + deck.w - 24,
        strength: 12,
        flying: true,
        hp: 0, x: 0, y: 0, age: 0, flash: 0, reload: 1.5,
      };
      this.hostiles.push(this.warden);
    }

    // Ammo pickups on checkpoint platforms
    this.items = route.filter(p => p.checkpoint).map(p => ({
      x: p.x + 82, y: p.y - 16, used: false,
    }));
  }

  reset(): void {
    this.ammo = MAX_AMMO;
    this.reload = 0;
    this.recoil = 0;
    this.shake = 0;
    this.cool = 0;
    this.pulse = 0;
    this.bolts = [];
    this.trap.age = -1;

    for (const item of this.items) item.used = false;
    for (const e of this.hostiles) {
      Object.assign(e, {
        hp: e.strength,
        x: e.home,
        y: e.floor - (e.flying ? 65 : 12),
        age: 0,
        flash: 0,
        reload: 1.5,
      });
    }
  }

  hit(e: EnemyState, power: number): void {
    if (e.hp <= 0) return;
    e.hp -= power;
    e.flash = 0.18;
    this.burst(e.x, e.y, e.hp > 0 ? '#ffdbad' : '#91ffce', e.hp > 0 ? 6 : 18);
    this.tone(e.hp > 0 ? 260 : 430, e.hp > 0 ? 150 : 76, 0.13);
    if (e.hp <= 0) this.kills++;
  }

  /**
   * Run one tick of combat. Returns true if the player died.
   */
  tick(
    dt: number,
    player: PlayerState,
    creatures: CreatureState[],
    field: boolean,
    held: (action: string) => boolean,
    highest: bigint,
    hurtFn: () => boolean,
  ): boolean {
    this.cool -= dt;
    this.recoil -= dt;
    this.shake -= dt;
    this.pulse -= dt;

    const px = player.x + 10;
    const py = player.y + 15;
    const live = this.hostiles.filter(e => e.hp > 0 && Math.abs(e.home - px) < 460);

    // Reload
    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) this.ammo = MAX_AMMO;
    }

    // Shooting
    if (held('shoot') && this.cool <= 0 && this.ammo > 0) {
      if (--this.ammo === 0) this.reload = RELOAD_TIME;
      const gun = this.guns[this.gun];
      const dir = player.facing;

      // Auto-aim: find nearest target in facing direction
      let target: { x: number; y: number } | null = null;
      for (const e of live) {
        if ((e.x - px) * dir > 0 && Math.abs(e.x - px) < 360 &&
            (!target || Math.abs(e.x - px) < Math.abs(target.x - px))) {
          target = e;
        }
      }
      for (const c of creatures) {
        if (!c.dead && (c.x - px) * dir > 0 && Math.abs(c.x - px) < 300 &&
            (!target || Math.abs(c.x - px) < Math.abs(target.x - px))) {
          target = c;
        }
      }

      const angle = this.aim ?? (target
        ? Math.atan2(target.y - py, target.x - px)
        : dir > 0 ? 0 : Math.PI);

      const offsets = this.gun === 1 ? [-0.055, 0.055] : [0];
      for (const offset of offsets) {
        this.bolts.push({
          x: px, y: py,
          vx: Math.cos(angle + offset) * gun.speed,
          vy: Math.sin(angle + offset) * gun.speed,
          t: 0.8,
          power: gun.damage,
          color: gun.color,
        });
      }
      this.cool = gun.cooldown;
      this.recoil = 0.11;
      this.shots++;
      this.tone(650, 170, 0.09, 'triangle');
    }

    // Nova (area attack)
    if (held('nova') && highest >= 4n && this.pulse <= 0) {
      this.pulse = NOVA_COOLDOWN;
      this.shake = 0.16;
      this.burst(px, py, '#e8a8ff', 30);
      for (const e of live) {
        if (Math.hypot(e.x - px, e.y - py) < NOVA_RANGE) {
          this.hit(e, NOVA_DAMAGE);
        }
      }
    }

    // Enemy AI
    for (const e of live) {
      if (e.hp <= 0) continue;
      if (e.waveDelay !== undefined && Math.abs(px - e.home) > 210 && !e.age) continue;

      e.age += dt;
      e.flash -= dt;
      e.reload -= dt;

      if (e.waveDelay !== undefined && e.age < e.waveDelay) continue;

      // Burrower hides until player is close
      if (e.kind === 'burrower' && Math.abs(px - e.home) > 110) {
        e.y = e.floor + 18;
        continue;
      }

      // Movement
      const speed = e.kind === 'runner' || e.kind === 'hound' ? 115 :
        e.flying ? 90 : 44;

      if (e.kind !== 'turret' && e.kind !== 'warden') {
        e.x += Math.max(-speed * dt, Math.min(speed * dt, px - e.x));
      }
      e.x = Math.max(e.left, Math.min(e.right, e.x));
      e.y = e.floor - (e.flying ? 59 + 34 * Math.sin(e.age * 3) : 12);

      // Warden boss behavior
      if (e.kind === 'warden') {
        const enraged = e.hp <= e.strength / 2;
        e.x = e.home + Math.sin(e.age * (enraged ? 2.2 : 1.4)) * 46;
        e.y = e.floor - 70 + Math.cos(e.age * 2) * 28;

        if (e.reload <= 0 && Math.abs(px - e.x) < 320) {
          const aimAngle = Math.atan2(py - e.y, px - e.x);
          const spreads = enraged ? [-0.28, 0, 0.28] : [0];
          for (const spread of spreads) {
            this.bolts.push({
              x: e.x, y: e.y,
              vx: 145 * Math.cos(aimAngle + spread),
              vy: 145 * Math.sin(aimAngle + spread),
              t: 2.2,
              enemy: true,
              color: '#ff8068',
            });
          }
          e.reload = enraged ? 1.25 : 1.8;
          this.tone(165, 72, 0.12);
        }
      }

      // Turret/drone ranged attacks
      if ((e.kind === 'turret' || e.kind === 'drone') &&
          e.reload <= 0 && Math.abs(px - e.x) < 270) {
        const a = Math.atan2(py - e.y, px - e.x);
        this.bolts.push({
          x: e.x, y: e.y,
          vx: 170 * Math.cos(a),
          vy: 170 * Math.sin(a),
          t: 1.6,
          enemy: true,
          color: '#ff745e',
        });
        e.reload = 2.3;
      }

      // Contact damage
      if (Math.hypot(e.x - px, e.y - py) < 24) {
        if (field) {
          this.hit(e, 3);
        } else if (hurtFn()) return true;
      }
    }

    // Update projectiles
    for (const b of this.bolts) {
      const dx = b.vx * dt;
      const dy = b.vy * dt;

      const intersects = (x: number, y: number, r: number): boolean => {
        const u = Math.max(0, Math.min(1,
          ((x - b.x) * dx + (y - b.y) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x - b.x - u * dx, y - b.y - u * dy) < r;
      };

      if (b.enemy) {
        if (intersects(px, py, 16)) {
          b.t = 0;
          if (field) {
            // Shield absorbs enemy projectiles
          } else if (hurtFn()) return true;
        }
      } else {
        // Player projectiles hit enemies
        for (const e of live) {
          if (e.hp > 0 && intersects(e.x, e.y, 17)) {
            this.hit(e, b.power ?? 1);
            b.t = 0;
            break;
          }
        }
      }

      // Player projectiles hit creatures
      if (!b.enemy && b.t > 0) {
        for (const c of creatures) {
          if (!c.dead && intersects(c.x, c.y, 16)) {
            c.wounds += b.power ?? 1;
            c.dead = c.wounds >= 1;
            if (c.dead) this.kills++;
            this.burst(c.x, c.y, '#ffc77f', 12);
            this.tone(240, 70, 0.14);
            b.t = 0;
            break;
          }
        }
      }

      b.x += dx;
      b.y += dy;
      b.t -= dt;
    }

    this.bolts = this.bolts.filter(b => b.t > 0);

    // Secret trap
    const t = this.trap;
    if (t.age < 0 && Math.abs(px - t.x) < 105) t.age = 0;
    if (t.age >= 0) t.age += dt;

    const surge = t.age - t.delay;
    if (surge > 0 && surge < 0.65) {
      const tx = t.x + (t.kind === 1 ? (surge - 0.32) * 160 : 0);
      const ty = t.y - (t.kind === 2 ? 108 - surge * 166 : 18);
      if (Math.abs(px - tx) < 24 && Math.abs(py - ty) < 24 && hurtFn()) return true;
    }

    // Ammo pickups
    for (const i of this.items) {
      if (!i.used && this.ammo < MAX_AMMO && Math.hypot(px - i.x, py - i.y) < 28) {
        i.used = true;
        this.ammo = MAX_AMMO;
        this.reload = 0;
        this.tone(390, 760, 0.18);
      }
    }

    return false;
  }
}
