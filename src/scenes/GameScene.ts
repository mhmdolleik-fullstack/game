import { encounter, drawEncounter, skyline, encounterTips } from '../systems/WorldEncounter';
// ─── Game Scene ───
// Core gameplay: physics, rendering, game state, all mechanics
// Ported and upgraded from game.js + combat.js

import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, WORLD_HEIGHT, GRAVITY, PLAYER_SPEED, PLAYER_ACCEL,
  JUMP_VELOCITY, SPRING_VELOCITY, DASH_SPEED, DASH_DURATION,
  COYOTE_TIME, JUMP_BUFFER_TIME, FALL_DEATH_Y, BELT_SPEED,
  GLIDE_MAX_FALL, PHYSICS_DT, MAX_FRAME_TIME, MAX_PARTICLES,
  COLORS, MECHANIC_COLORS, MUSIC_SCORES, KEY_BINDINGS,
} from '../constants';
import type {
  Chapter, PlayerState, CreatureState, RoutePlatform,
  HazardVisual, GameStatus, RouteHazard, LedgePlatform,
} from '../types';
import { ShieldSystem } from '../systems/Shield';
import { CombatSystem } from '../systems/Combat';
import { AudioManager } from '../systems/Audio';
import { SaveManager } from '../systems/Save';
import { makeChapter } from '../systems/LevelGenerator';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; color: number;
}

export class GameScene extends Phaser.Scene {
  // ─── State ───
  private status: GameStatus = 'intro';
  private number!: bigint;
  private highest!: bigint;
  private segment = 0n;
  private chapter!: Chapter;
  private checkpoint!: RoutePlatform;
  private player!: PlayerState;

  // ─── Systems ───
  private shield = new ShieldSystem();
  private combat = new CombatSystem();
  private audio = new AudioManager();

  // ─── Input (manual — no collision with Phaser's this.input) ───
  private keys = new Set<string>();
  private fingers = new Map<number, string>();
  private aimOrigins = new Map<number, { x: number; y: number }>();
  private playerAim: number | null = null;

  // ─── Gameplay ───
  private creatures: CreatureState[] = [];
  private particles: Particle[] = [];
  private gameTime = 0;
  private elapsed = 0;
  private deaths = 0;
  private section = 1;
  private cam = 0;
  private charge = 1;
  private field = false;
  private coyoteTimer = COYOTE_TIME;
  private jumpBuffer = 0;
  private launchSurface: RoutePlatform | null = null;
  private accumulator = 0;
  private phase = 0;
  private sceneFlash = 0;
  private deathFlash = 0;
  private secret = false;
  private musicBeat = -1;
  private noticeTimer = 0;
  private noticeMsg = '';

  // ─── Graphics layers ───
  private bgGfx!: Phaser.GameObjects.Graphics;
  private worldGfx!: Phaser.GameObjects.Graphics;
  private uiGfx!: Phaser.GameObjects.Graphics;
  private reduced = false;

  // ─── View ───
  private vw = 900;
  private vh = 470;

  // ─── HUD texts (created once) ───
  private txtShield?: Phaser.GameObjects.Text;
  private txtWeapon?: Phaser.GameObjects.Text;
  private txtSector?: Phaser.GameObjects.Text;
  private txtDeaths?: Phaser.GameObjects.Text;
  private txtNotice?: Phaser.GameObjects.Text;

  // ─── Dialog ───
  private dialog?: Phaser.GameObjects.Container;
  private dialogCallback?: () => void;

  // ─── Touch buttons ───
  private touchButtons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'Game' });
  }

  /* ═══════════════════════════════════════════
     Lifecycle
     ═══════════════════════════════════════════ */

  init(data: { number: bigint; highest: bigint }): void {
    this.number = data.number ?? 1n;
    this.highest = data.highest ?? this.number;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  create(): void {
    this.bgGfx = this.add.graphics();
    this.worldGfx = this.add.graphics();
    this.uiGfx = this.add.graphics().setScrollFactor(0);

    // Wire combat callbacks
    this.combat.setBurstCallback((x, y, color, count) => {
      this.burst(x, y, Phaser.Display.Color.HexStringToColor(color).color, count);
    });
    this.combat.setToneCallback((f, t, d, k, v) => this.audio.tone(f, t, d, k, v));

    this.audio.setMuted(SaveManager.getMuted());
    this.handleResize();
    this.setupInput();
    this.createHUDTexts();
    this.createTouchControls();
    this.loadChapter();

    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const controlsHint = isMobile
      ? 'Shoot wildlife or jump clear. Tap Shield for 3 s of protection. Reach the lit bulkhead.'
      : 'A/D Move · Space Jump · F Shoot · Shift Shield · X Dash · C Nova · Esc Pause\n\nShoot wildlife or jump clear. Tap Shield for 3 s of protection. Reach the lit bulkhead.';

    this.showDialog('DESCENT PROTOCOL', 'FAULTLINE', controlsHint + ' ' + encounterTips[this.chapter.zoneIndex],
      'Play level', () => this.beginPlay());

    this.handleResize();
    this.scale.on('resize', () => this.handleResize());
  }

  /* ═══════════════════════════════════════════
     Input wiring
     ═══════════════════════════════════════════ */

  private held(action: string): boolean {
    for (const k of this.keys) if (KEY_BINDINGS[k] === action) return true;
    for (const a of this.fingers.values()) if (a === action) return true;
    return false;
  }

  private setupInput(): void {
    if (!this.input.keyboard) return;

    this.input.keyboard.on('keydown', (ev: KeyboardEvent) => {
      // Dialog accept — Enter/Space when dialog is open
      if ((ev.code === 'Enter' || ev.code === 'Space') && !ev.repeat && this.dialog && this.dialogCallback) {
        ev.preventDefault();
        this.audio.enable();
        const cb = this.dialogCallback;
        cb();
        return;
      }

      if (ev.code === 'Escape' && !ev.repeat) { this.pause(); return; }
      if (ev.code === 'KeyX' && !ev.repeat) this.dash();
      if (!KEY_BINDINGS[ev.code] || this.status !== 'playing') return;
      if (ev.code === 'Space' && ev.target instanceof HTMLButtonElement) return;
      ev.preventDefault();
      this.keys.add(ev.code);
      if (!ev.repeat && KEY_BINDINGS[ev.code] === 'jump') this.jumpBuffer = JUMP_BUFFER_TIME;
    });

    this.input.keyboard.on('keyup', (ev: KeyboardEvent) => this.keys.delete(ev.code));

    this.game.events.on('blur', () => { if (this.status === 'playing') this.pause(); });
  }

  private clearInput(): void {
    this.keys.clear();
    this.fingers.clear();
    this.aimOrigins.clear();
    this.playerAim = null;
  }

  /* ═══════════════════════════════════════════
     Level loading
     ═══════════════════════════════════════════ */

  private loadChapter(): void {
    this.segment = SaveManager.getRouteSegment(this.number);
    this.chapter = makeChapter(this.number, this.segment);
    this.secret = false;
    this.sceneFlash = 1;
    this.musicBeat = -1;

    this.creatures = this.chapter.platforms.flatMap((p, i) => {
      if (p.checkpoint || i < 3 || i >= this.chapter.platforms.length - 1 || (i - 3) % 6) return [];
      const kind = (['kite', 'adder', 'hound'] as const)[(Math.floor(i / 6) + this.chapter.zoneIndex) % 3];
      return [{ kind, home: p.x + p.w * 0.65, floor: p.y, age: 0, dead: false, x: 0, y: 0, wounds: 0 }];
    });

    this.combat.setup(this.chapter, this.number, this.segment, this.highest);
    this.deaths = 0;
    this.elapsed = 0;
    this.checkpoint = this.chapter.platforms[0];

    const saved = SaveManager.getCheckpoint(this.number);
    if (saved) {
      const cp = this.chapter.platforms.find(p => p.checkpoint && p.x === saved.x);
      if (cp) this.checkpoint = cp;
      this.deaths = saved.deaths;
    }

    this.respawn();
  }

  private respawn(): void {
    this.player = {
      x: this.checkpoint.x + (this.checkpoint.checkpoint ? 42 : 115),
      y: this.checkpoint.y - 32,
      vx: 0, vy: 0, ground: this.checkpoint, facing: 1,
    };
    for (const p of this.chapter.platforms) p.crack = 0;
    for (const h of this.chapter.hazards) h.armedAt = undefined;
    this.gameTime = 0;
    for (const c of this.creatures) {
      c.age = 0; c.dead = false; c.wounds = 0;
      c.x = c.home; c.y = c.floor - (c.kind === 'kite' ? 82 : 9);
    }
    this.combat.reset();
    this.shield.reset(this.held('field'));
    this.charge = 1;
    this.field = false;
    this.coyoteTimer = COYOTE_TIME;
    this.launchSurface = this.checkpoint;
    this.jumpBuffer = 0;
    this.section = this.checkpoint.section ?? 1;
    this.cam = Math.max(0, this.player.x - this.vw * 0.3);
  }

  /* ═══════════════════════════════════════════
     State transitions
     ═══════════════════════════════════════════ */

  private beginPlay(): void {
    this.status = 'playing';
    this.audio.enable();
    this.hideDialog();
    // Show level title briefly
    this.notify(`Level ${this.number} · ${this.chapter.title}`);
    this.noticeTimer = 2.5;
  }

  private pause(): void {
    if (this.status === 'paused') { this.beginPlay(); return; }
    if (this.status !== 'playing') return;
    this.status = 'paused';
    this.clearInput();
    this.showDialog('LEVEL ' + this.number, 'Paused',
      this.chapter.title + '\n\nSECTOR ' + this.section + '/3 · ' +
      Math.floor(this.elapsed) + 's · ' + this.deaths + ' retries',
      'Resume', () => this.beginPlay(), true);
  }

  private returnToMenu(): void {
    this.hideDialog();
    SaveManager.addStats(this.deaths, this.combat.kills, this.elapsed);
    // Kill the vite dev server task won't matter - clean scene transition
    this.scene.start('Menu');
  }

  private fail(): void {
    if (this.status !== 'playing') return;
    this.status = 'dead';
    this.deaths++;
    SaveManager.saveCheckpoint(this.number, this.checkpoint.x, this.deaths);
    this.burst(this.player.x + 10, Math.min(this.player.y + 14, 404), COLORS.deathFlash, 28);
    this.combat.shake = 0.3;  // Strong camera shake on death
    this.deathFlash = 0.4;    // Red flash on death
    this.audio.death();
    this.clearInput();
    this.combat.aim = null;
    this.showDialog('SIGNAL LOST', 'Try again',
      this.checkpoint.checkpoint ? 'Checkpoint secured.' : 'Restart at the entry platform.',
      'Retry', () => { this.respawn(); this.beginPlay(); }, true);
  }

  /** Returns true so callers can `return this.hurtPlayer()`. */
  private hurtPlayer(): boolean {
    if (this.field) return false;
    this.fail();
    return true;
  }

  private levelComplete(): void {
    this.status = 'clear';
    this.clearInput();
    if (this.number >= this.highest) { this.highest = this.number + 1n; SaveManager.save('highest', this.highest); }
    SaveManager.save('chapter', this.number + 1n);
    SaveManager.addStats(this.deaths, this.combat.kills, this.elapsed);
    this.audio.levelClear();

    // Victory celebration particles
    const px = this.player.x + 10;
    const py = this.player.y + 16;
    this.burst(px, py, 0xffca7d, 24);
    this.burst(px - 20, py - 10, 0x9aeedb, 16);
    this.burst(px + 20, py - 10, 0xb3ede6, 16);
    this.sceneFlash = 1.2;

    const next = makeChapter(this.number + 1n);
    const milestone = next.episode !== this.chapter.episode ? 'EPISODE COMPLETE' :
      next.zoneIndex !== this.chapter.zoneIndex ? 'CHAPTER COMPLETE' : 'LEVEL COMPLETE';
    const summary = `${Math.floor(this.elapsed)}s · ${this.deaths} retries · ${this.combat.kills} defeated\nUnlocked ${next.title}`;
    const btn = next.zoneIndex !== this.chapter.zoneIndex ? 'Enter next chapter' : 'Next level';

    this.showDialog(milestone, 'Level completed', summary, btn, () => {
      SaveManager.clearRouteSegment();
      this.number++;
      SaveManager.save('chapter', this.number);
      this.loadChapter();
      if (this.chapter.level === 1) {
        this.showDialog('CHAPTER ' + (this.chapter.zoneIndex + 1), this.combat.world,
          this.chapter.story, 'Enter world', () => this.beginPlay());
      } else {
        this.beginPlay();
      }
    });
  }

  /* ═══════════════════════════════════════════
     Physics step  (called at 120 Hz)
     ═══════════════════════════════════════════ */

  private step(dt: number): void {
    this.phase += dt;

    // particles
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 430 * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    this.deathFlash = Math.max(0, this.deathFlash - dt);

    if (this.status !== 'playing') return;

    // ── Shield ──
    const wasField = this.field;
    this.shield.update(dt, this.held('field'));
    this.field = this.shield.active;
    this.charge = this.field ? this.shield.duration / 3 : 1 - this.shield.cooldown / 20;
    if (this.field !== wasField) { if (this.field) this.audio.shieldOn(); else this.audio.shieldOff(); }

    // ── Combat tick ──
    if (this.combat.tick(dt, this.player, this.creatures, this.field,
      (a: string) => this.held(a), this.highest, () => this.hurtPlayer())) return;

    this.sceneFlash = Math.max(0, this.sceneFlash - dt * 1.6);
    this.elapsed += dt;

    // ── Music ──
    const beat = Math.floor(this.elapsed / 0.48);
    if (beat !== this.musicBeat) {
      this.musicBeat = beat;
      const note = MUSIC_SCORES[this.chapter.zoneIndex][beat % 8] * (1 + this.chapter.zoneIndex * 0.04);
      this.audio.playNote(note, 1);
      if (beat % 8 === 0) this.audio.playBass();
    }

    if (this.noticeTimer > 0 && (this.noticeTimer -= dt) <= 0) this.noticeMsg = '';
    if (!this.field) this.gameTime += dt;
    if (this.player.ground?.mechanic === 'phase' && !this.field) this.player.ground = null;
    if (this.player.ground) this.launchSurface = this.player.ground;

    this.jumpBuffer -= dt;
    this.coyoteTimer = this.player.ground ? COYOTE_TIME : this.coyoteTimer - dt;

    // ── Movement ──
    const dir = Number(this.held('right')) - Number(this.held('left'));
    if (dir) this.player.facing = dir;
    const target = dir * PLAYER_SPEED;
    const belt = !this.field && this.player.ground?.mechanic === 'belt' ? BELT_SPEED : 0;
    this.player.vx += Math.max(-dt * PLAYER_ACCEL, Math.min(dt * PLAYER_ACCEL, target + belt - this.player.vx));

    // ── Jump ──
    if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
      const boosted = this.launchSurface?.mechanic === 'spring';
      this.player.vy = boosted ? SPRING_VELOCITY : JUMP_VELOCITY;
      this.player.ground = null;
      this.jumpBuffer = 0; this.coyoteTimer = 0;
      this.burst(this.player.x + 10, this.player.y + 32, 0xb1c7c7, 8);
      this.audio.jump(boosted);
    }

    // ── Dash ──
    if ((this.player.dashTime ?? 0) > 0) {
      this.player.dashTime! -= dt;
      this.player.vx = this.player.facing * DASH_SPEED;
      this.player.vy = 0;
    }

    // ── Physics ──
    const oldBottom = this.player.y + 32;
    this.player.x = Math.max(-5, this.player.x + this.player.vx * dt);

    // Sky zone: wind + glide
    if (this.chapter.zoneIndex === 1 && !this.player.ground) {
      this.player.x += Math.sin(this.gameTime * 1.4) * 18 * dt;
      if (this.held('jump') && this.player.vy > GLIDE_MAX_FALL) this.player.vy = GLIDE_MAX_FALL;
    }

    this.player.vy += GRAVITY * dt;
    this.player.y += this.player.vy * dt;

    // ── Platform collision ──
    const event = encounter(this.chapter, this.gameTime);
    if (this.player.x + 20 > event.bx && this.player.x < event.bx + event.bw &&
        this.player.y + 32 > event.by && this.player.y < event.by + event.bh) {
      if (event.zone === 1) this.player.vy = Math.max(-320, this.player.vy - 1650 * dt);
      else if ((event.zone === 4 || event.strength > 0) && this.hurtPlayer()) return;
    }
    const priorGround = this.player.ground;
    this.player.ground = null;
    const allPlats: Array<RoutePlatform | LedgePlatform> = [...this.chapter.platforms, ...this.combat.ledges];

    for (const plat of allPlats) {
      if ((plat.crack ?? 0) >= 0.43 || (plat.mechanic === 'phase' && !this.field)) continue;
      if (this.player.vy >= 0 &&
          this.player.x + 20 > plat.x && this.player.x < plat.x + plat.w &&
          oldBottom <= plat.y && this.player.y + 32 >= plat.y) {

        if (!priorGround && this.launchSurface && plat.y - this.launchSurface.y > 55)
          this.burst(this.player.x + 10, plat.y, 0xabbbb8, 12);

        this.player.y = plat.y - 32;
        this.player.vy = 0;
        this.player.ground = plat as RoutePlatform;
        this.player.dashUsed = false;
        this.player.dashTime = 0;
        if (!priorGround) this.audio.land();

        if ((plat as RoutePlatform).checkpoint && plat.x > this.checkpoint.x) {
          this.checkpoint = plat as RoutePlatform;
          if (this.section !== plat.section) this.sceneFlash = 1;
          this.section = plat.section;
          SaveManager.saveCheckpoint(this.number, this.checkpoint.x, this.deaths);
          this.notify('Checkpoint secured');
          this.audio.checkpoint();
        }

        if ((plat as RoutePlatform).fragile && !this.field) {
          plat.crack += dt;
          if (plat.crack >= 0.43) {
            this.player.ground = null;
            this.burst(this.player.x + 10, plat.y, 0xc4794e, 22);
            this.audio.crumble();
          }
        }
        break;
      }
    }

    // ── Hazard collision ──
    if (!this.field) {
      for (const hz of this.chapter.hazards) {
        if ((hz.kind === 'ram' || hz.kind === 'snare') && hz.armedAt === undefined &&
            Math.abs(this.player.x + 10 - hz.x) < 85) hz.armedAt = this.gameTime;
        const hv = this.hazardVis(hz);
        if (hv.danger &&
            this.player.x < hv.x + hv.w && this.player.x + 20 > hv.x - hv.w &&
            this.player.y + 31 > hz.y - hv.height && this.player.y < hz.y) {
          if (this.hurtPlayer()) return;
        }
      }
    }

    // ── Secret passage ──
    const gate = this.chapter.platforms[3];
    if (!this.secret && gate && Math.abs(this.player.x - gate.x - 60) < 70 && this.player.y < gate.y - 82) {
      this.secret = true; this.sceneFlash = 1; this.combat.ammo = 12;
      this.notify('Hidden passage · magazine restored'); this.audio.secret();
    }

    // ── Creature collision ──
    for (const c of this.creatures) {
      if (c.dead || Math.abs(c.home - this.player.x) > 300) continue;
      if (!this.field) {
        c.age += dt;
        const lunge = Math.max(0, Math.sin(c.age * 4));
        const reach = c.kind === 'adder' ? 45 : 95;
        const tgt = c.home + Math.max(-reach, Math.min(reach, this.player.x - c.home)) * lunge;
        c.x += (tgt - c.x) * Math.min(1, dt * (c.kind === 'hound' ? 14 : 6));
        c.y = c.floor - (c.kind === 'kite' ? 74 - 50 * lunge + 8 * Math.sin(c.age * 7) :
                          c.kind === 'hound' ? 13 : 7);
      }
      if (Math.abs(this.player.x + 10 - c.x) < 19 && Math.abs(this.player.y + 18 - c.y) < 18) {
        if (this.field) {
          c.dead = true; this.combat.kills++;
          this.burst(c.x, c.y, 0xf4b675, 14); this.audio.enemyKill();
        } else if (this.hurtPlayer()) return;
      }
    }

    // ── Fall death ──
    if (this.player.y > FALL_DEATH_Y) { this.fail(); return; }

    // ── Level exit ──
    const lastPlat = this.chapter.platforms[this.chapter.platforms.length - 1];
    if (this.player.x + 20 >= this.chapter.exit && this.player.ground === lastPlat) {
      if (this.segment + 1n < this.chapter.segments) {
        SaveManager.saveRouteSegment(this.number, this.segment + 1n);
        SaveManager.save('checkpoint-v2', '');
        const pt = this.elapsed, pd = this.deaths;
        this.loadChapter();
        this.elapsed = pt; this.deaths = pd;
        SaveManager.saveCheckpoint(this.number, this.checkpoint.x, this.deaths);
        this.notify('New route opened');
        return;
      }
      if (this.combat.warden && this.combat.warden.hp > 0) {
        this.notify('Defeat the Gate Warden to open the exit'); return;
      }
      this.levelComplete();
    }

    // ── Camera with dead zone + look-ahead ──
    const lookAhead = this.player.facing * 40;
    const targetCam = Math.max(0, this.player.x - this.vw * 0.31 + lookAhead);
    const camDelta = targetCam - this.cam;
    // Dead zone: don't move camera for tiny player movements
    if (Math.abs(camDelta) > 20) {
      this.cam += camDelta * Math.min(1, dt * 6);
    }

    // Running dust trail
    if (this.player.ground && Math.abs(this.player.vx) > 180 && !this.reduced) {
      if (Math.random() < 0.3) {
        this.burst(this.player.x + 10 - this.player.facing * 6, this.player.y + 30, 0x9aaba7, 1);
      }
    }
  }

  /* ═══════════════════════════════════════════
     Helpers
     ═══════════════════════════════════════════ */

  private dash(): void {
    if (this.status !== 'playing' || this.player.ground || this.player.dashUsed) return;
    this.player.dashUsed = true;
    this.player.dashTime = DASH_DURATION;
    this.burst(this.player.x + 10, this.player.y + 16, 0x89ffe6, 14);
    this.audio.dash();
  }

  private burst(x: number, y: number, color: number, count: number): void {
    if (this.reduced) return;
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      this.particles.push({ x, y, color,
        vx: (Math.random() - 0.5) * 290, vy: -Math.random() * 235,
        life: 0.22 + Math.random() * 0.45 });
    }
  }

  private notify(msg: string): void { this.noticeMsg = msg; this.noticeTimer = 1.8; }

  private hazardVis(h: RouteHazard): HazardVisual {
    const ram = h.kind === 'ram' || h.kind === 'snare';
    const sweep = h.kind === 'sweep';
    const cycle = ram ? this.gameTime - (h.armedAt ?? Infinity) : (this.gameTime + h.offset) % 2.55 - 0.62;
    return {
      x: h.x + Math.sin((this.gameTime + h.offset) * 3) * (sweep ? 56 : h.kind === 'arc' ? 34 : 0),
      height: ram ? 115 : sweep ? 90 : h.kind === 'vent' ? 74 : 38,
      danger: cycle >= h.warningTime && cycle < h.warningTime + h.activeTime,
      warning: cycle >= 0 && cycle < h.warningTime,
      w: ram ? 31 : sweep ? 13 : 25,
    };
  }

  /* ═══════════════════════════════════════════
     Main update
     ═══════════════════════════════════════════ */

  update(_t: number, delta: number): void {
    this.accumulator += Math.min(delta / 1000, MAX_FRAME_TIME);
    while (this.accumulator >= PHYSICS_DT) { this.step(PHYSICS_DT); this.accumulator -= PHYSICS_DT; }
    this.paint();
  }

  /* ═══════════════════════════════════════════
     Rendering
     ═══════════════════════════════════════════ */

  private paint(): void {
    this.bgGfx.clear();
    this.worldGfx.clear();
    this.uiGfx.clear();
    this.paintBG(this.bgGfx);
    this.paintWorld(this.worldGfx);
    this.paintHUD(this.uiGfx);
  }

  // ─── Background ───
  private paintBG(g: Phaser.GameObjects.Graphics): void {
    const hue = (this.chapter.color + (this.section - 1) * 22 + (this.secret ? 95 : 0)) % 360;

    // Gradient sky
    const hsl = (h: number, s: number, l: number) =>
      Phaser.Display.Color.HSLToColor(h / 360, s / 100, l / 100).color;

    g.fillStyle(0x090f16);
    g.fillRect(0, 0, this.vw, this.vh);
    g.fillStyle(hsl(hue, 30, 17), 0.7);
    g.fillRect(0, Math.floor(this.vh * 0.35), this.vw, Math.floor(this.vh * 0.4));

    // Parallax structures
    for (let layer = 0; layer < 3; layer++) {
      const interval = 180 - layer * 14;
      const offset = (this.cam * (0.10 + layer * 0.16)) % interval;
      g.fillStyle(hsl(hue, 30 - layer * 3, 19 - layer * 4));
      for (let i = -1; i < this.vw / interval + 2; i++) {
        const x = i * interval - offset + layer * 45;
        const top = 55 + (((i % 3) + 3) % 3) * 28;
        g.fillRect(x, top + 93, 76, this.vh - top - 93);
        g.fillStyle(0x26343e);
        g.fillRect(x + 9, top + 101, 4, Math.min(252, this.vh - top - 101));
        g.fillStyle(hsl(hue, 30 - layer * 3, 19 - layer * 4));
      }
    }

    // Grid lines
    for (let y = 59; y < 397; y += 76) {
      g.fillStyle(0x25323d, 0.4); g.fillRect(0, y, this.vw, 1);
      g.fillStyle(0x101a22, 0.4); g.fillRect(0, y + 2, this.vw, 3);
    }

    // Ambient motes
    if (!this.reduced) {
      for (let i = 0; i < 42; i++) {
        const mx = ((i * 193 + this.phase * (5 + i % 4) - this.cam * 0.1) % this.vw + this.vw) % this.vw;
        g.fillStyle(i % 5 === 0 ? 0xa27655 : 0x495a61);
        g.fillRect(mx, (i * 59 + this.phase * 4) % 390, (i % 3) + 1, 1);
      }
    }

    // Zone-specific scenery
    this.paintScenery(g, hue);

    // Weather particles
    this.paintWeather(g);

    // Day/night cycle tint — odd levels slightly darker, section 3 dusk
    if (!this.reduced) {
      const nightFactor = this.section === 3 ? 0.12 : (Number(this.number) % 2 === 0 ? 0.04 : 0);
      if (nightFactor > 0) {
        g.fillStyle(0x060818, nightFactor);
        g.fillRect(0, 0, this.vw, this.vh);
      }
    }
  }

  private paintWeather(g: Phaser.GameObjects.Graphics): void {
    if (this.reduced) return;
    const zi = this.chapter.zoneIndex;

    if (zi === 1) {
      // Sky zone: drifting cloud wisps
      g.fillStyle(0xc8e4f4, 0.08);
      for (let i = 0; i < 12; i++) {
        const wx = ((i * 137 + this.phase * (20 + i * 3)) % (this.vw + 100)) - 50;
        const wy = 40 + i * 32 + Math.sin(this.phase * 0.5 + i) * 15;
        g.fillEllipse(wx, wy, 60 + (i % 3) * 20, 8 + (i % 2) * 4);
      }
    } else if (zi === 2) {
      // Jungle: falling leaves / spores
      g.fillStyle(0x7cb860, 0.35);
      for (let i = 0; i < 20; i++) {
        const lx = ((i * 97 + this.phase * (8 + i % 5) + Math.sin(this.phase + i) * 30) % this.vw);
        const ly = ((i * 73 + this.phase * (15 + i % 3)) % this.vh);
        g.fillRect(lx, ly, 2, 2);
      }
    } else if (zi === 3) {
      // Zombie: ash / fog
      g.fillStyle(0x8a9a7a, 0.12);
      for (let i = 0; i < 8; i++) {
        const fx = ((i * 173 + this.phase * 6) % (this.vw + 200)) - 100;
        const fy = this.vh - 80 + Math.sin(this.phase * 0.3 + i * 2) * 20;
        g.fillEllipse(fx, fy, 120, 25);
      }
    } else if (zi === 4) {
      // Volcanic: falling ash/embers
      for (let i = 0; i < 25; i++) {
        const ax = ((i * 83 + this.phase * (5 + i % 4)) % this.vw);
        const ay = ((i * 61 + this.phase * (20 + i % 6)) % this.vh);
        g.fillStyle(i % 4 === 0 ? 0xff6830 : 0xa08070, i % 4 === 0 ? 0.6 : 0.3);
        g.fillRect(ax, ay, i % 3 + 1, i % 3 + 1);
      }
    } else if (zi === 5) {
      // Frozen: snow
      g.fillStyle(0xe8f0ff, 0.5);
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 71 + this.phase * (3 + i % 3) + Math.sin(this.phase * 0.8 + i * 0.7) * 20) % this.vw);
        const sy = ((i * 53 + this.phase * (10 + i % 4)) % this.vh);
        g.fillCircle(sx, sy, 1 + (i % 3) * 0.5);
      }
    }
  }

  private paintScenery(g: Phaser.GameObjects.Graphics, hue: number): void {
    const zi = this.chapter.zoneIndex;
    const stride = 190;
    for (let i = -1; i < this.vw / stride + 2; i++) {
      const x = i * stride - (this.cam * 0.14) % stride;
      if (zi === 1) {
        // Sky: clouds
        g.fillStyle(0xacd3e9, 0.22);
        for (let j = 0; j < 5; j++) {
          g.fillCircle(x + j * 18, 142 + Math.sin(j) * 10, 20);
        }
      } else if (zi === 2) {
        // Jungle: trees
        g.fillStyle(0x315e47);
        for (let j = 0; j < 4; j++) {
          g.fillTriangle(x + j * 32, 235, x + 20 + j * 32, 54 + j * 12, x + 46 + j * 32, 235);
        }
      } else if (zi === 3) {
        // Zombie: buildings
        g.fillStyle(0x3c3744);
        g.fillRect(x, 86, 68, 213);
        g.fillStyle(0x393643);
        g.fillRect(x + 74, 136, 52, 161);
        for (let j = 0; j < 12; j++) {
          g.fillStyle(j % 4 ? 0x222637 : 0xd1a26b);
          g.fillRect(x + 9 + (j % 3) * 17, 103 + Math.floor(j / 3) * 23, 7, 11);
        }
      } else if (zi === 4) {
        // Volcanic: jagged rock pillars + lava pools
        g.fillStyle(0x4a2a1e);
        g.fillTriangle(x + 10, 290, x + 38, 60 + (i % 3) * 30, x + 66, 290);
        g.fillStyle(0x3d1f14);
        g.fillTriangle(x + 80, 290, x + 100, 110 + (i % 2) * 25, x + 120, 290);
        // Lava glow at base
        g.fillStyle(0xff5020, 0.25);
        g.fillRect(x + 5, 275, 125, 15);
        g.fillStyle(0xffaa40, 0.15);
        g.fillRect(x + 15, 282, 95, 8);
        // Cracks in rock
        g.fillStyle(0xff6830, 0.3);
        g.fillRect(x + 32, 120 + (i % 3) * 20, 2, 40);
        g.fillRect(x + 95, 150 + (i % 2) * 15, 2, 30);
      } else if (zi === 5) {
        // Frozen: ice spires + snow drifts
        g.fillStyle(0x8ab8cc);
        g.fillTriangle(x + 20, 290, x + 44, 80 + (i % 3) * 20, x + 68, 290);
        g.fillStyle(0x9ac8d8);
        g.fillTriangle(x + 85, 290, x + 108, 130 + (i % 2) * 15, x + 131, 290);
        // Snow drifts
        g.fillStyle(0xd8eaf4, 0.5);
        g.fillEllipse(x + 50, 285, 90, 16);
        g.fillEllipse(x + 120, 288, 60, 12);
        // Ice glint
        g.fillStyle(0xe8f8ff, 0.6);
        g.fillRect(x + 40, 120 + (i % 3) * 25, 3, 8);
        g.fillRect(x + 100, 155 + (i % 2) * 10, 2, 6);
      }
    }
  }

  // ─── World objects ───
  private paintWorld(g: Phaser.GameObjects.Graphics): void {
    const cam = this.cam;
    const shk = !this.reduced && this.combat.shake > 0 ? Math.sin(this.phase * 90) * 2 : 0;
    const oc = cam + shk; // offset camera
    skyline(g, this.chapter.zoneIndex, cam, this.vw, this.gameTime);
    drawEncounter(g, encounter(this.chapter, this.gameTime), oc);

    // Rescue ledges
    for (const l of this.combat.ledges) {
      g.fillStyle(0x729690); g.fillRect(l.x - oc, l.y, l.w, 5);
      g.fillStyle(0x243d42); g.fillRect(l.x + 4 - oc, l.y + 5, l.w - 8, 8);
    }

    // Ammo pickups
    for (const it of this.combat.items) {
      if (it.used) continue;
      const ix = it.x - oc;
      g.fillStyle(0x275751); g.fillRect(ix - 7, it.y - 7, 14, 14);
      g.fillStyle(0xafffe4); g.fillRect(ix - 4, it.y - 1, 9, 3); g.fillRect(ix - 1, it.y - 4, 3, 9);
    }

    // Platforms
    for (const p of this.chapter.platforms) {
      if (p.x + p.w <= cam - 20 || p.x >= cam + this.vw + 20) continue;
      this.paintPlatform(g, p, oc);
    }

    // Exit door with pulsing glow
    const last = this.chapter.platforms[this.chapter.platforms.length - 1];
    const ex = this.chapter.exit - oc;
    // Door glow halo
    if (!this.reduced) {
      const glowAlpha = 0.06 + 0.04 * Math.sin(this.phase * 3);
      g.fillStyle(0x9aeedb, glowAlpha);
      g.fillCircle(ex + 24, last.y - 28, 38);
    }
    g.fillStyle(0x23383e); g.fillRect(ex, last.y - 56, 49, 56);
    g.fillStyle(0x112529); g.fillRect(ex + 5, last.y - 50, 38, 50);
    // Pulsing door stripe
    const doorPulse = 0.7 + 0.3 * Math.sin(this.phase * 4);
    g.fillStyle(0x9aeedb, doorPulse); g.fillRect(ex + 23, last.y - 46, 4, 42); g.fillRect(ex + 4, last.y - 55, 41, 3);

    // Hazards
    for (const h of this.chapter.hazards) {
      if (h.x > cam - 80 && h.x < cam + this.vw + 80) this.paintHazard(g, h, oc);
    }

    // Projectiles
    for (const b of this.combat.bolts) {
      const bx = b.x - oc;
      if (bx < -20 || bx > this.vw + 20) continue;
      g.lineStyle(3, Phaser.Display.Color.HexStringToColor(b.color).color, 1);
      g.lineBetween(bx, b.y, bx - b.vx * 0.013, b.y - b.vy * 0.013);
    }

    // Enemies
    for (const e of this.combat.hostiles) {
      if (e.hp <= 0 || (e.waveDelay !== undefined && e.age <= e.waveDelay)) continue;
      if (e.x < cam - 35 || e.x > cam + this.vw + 35) continue;
      this.paintEnemy(g, e, oc);
    }

    // Particles
    for (const p of this.particles) {
      const px = p.x - oc;
      if (px < -10 || px > this.vw + 10) continue;
      g.fillStyle(p.color, Math.max(0, Math.min(1, p.life * 3)));
      g.fillRect(px, p.y, 3, 3);
    }

    // Creatures
    for (const c of this.creatures) {
      if (c.dead || Math.abs(c.x - cam - this.vw / 2) > this.vw / 2 + 30) continue;
      this.paintCreature(g, c, oc);
    }

    // Secret marker
    const gate = this.chapter.platforms[3];
    if (!this.secret && gate) {
      g.fillStyle(0x83ffe5); g.fillRect(gate.x + 58 - oc, gate.y - 90, 5, 5);
    }

    // Player
    if (this.status !== 'dead') this.paintPlayer(g, oc);

    // Flash overlay
    if (this.sceneFlash > 0 && !this.reduced) {
      g.fillStyle(0x7fdad3, this.sceneFlash * 0.18);
      g.fillRect(0, 0, this.vw, this.vh);
    }

    // Death flash (red tint)
    if (this.deathFlash > 0 && !this.reduced) {
      g.fillStyle(0xff2020, this.deathFlash * 0.35);
      g.fillRect(0, 0, this.vw, this.vh);
    }

    // Secret trap visual
    this.paintTrap(g, oc);
  }

  private paintPlatform(g: Phaser.GameObjects.Graphics, p: RoutePlatform, oc: number): void {
    if (p.crack >= 0.43) return;
    const x = p.x - oc, { y, w } = p;

    if (p.mechanic === 'phase' && !this.field) {
      g.fillStyle(0xd2a6ff); g.fillRect(x, y, w, 2);
      g.fillStyle(0x8e71af);
      for (let i = 0; i < w - 8; i += 15) g.fillRect(x + i, y + 5, 8, 3);
      return;
    }

    g.fillStyle(0x25323b); g.fillRect(x, y, w, 24);
    g.fillStyle(MECHANIC_COLORS[p.mechanic ?? ''] ?? 0x87959a); g.fillRect(x, y, w, 5);
    g.fillStyle(0x42505b); g.fillRect(x + 9, y + 8, w - 18, 5);
    g.fillStyle(0x111a22);
    for (let i = 17; i < w - 10; i += 24) g.fillRect(x + i, y + 10, 3, 3);
    g.fillStyle(0x17212a); g.fillRect(x + 16, y + 24, 10, this.vh - y - 24);

    if (p.fragile) {
      g.fillStyle(p.crack > 0 ? 0xff9f59 : 0x694d41);
      for (let i = 22; i < w - 12; i += 25) g.fillRect(x + i, y, 5, 15);
    }
    if (p.mechanic === 'spring') {
      g.fillStyle(0x79cbff);
      for (let i = 11; i < w - 15; i += 25) g.fillTriangle(x + i, y + 14, x + i + 6, y + 7, x + i + 12, y + 14);
    } else if (p.mechanic === 'belt') {
      const bo = !this.field ? 25 - this.gameTime * 65 % 25 : 0;
      g.fillStyle(0xefc272);
      for (let i = 11 + bo; i < w - 15; i += 25) g.fillRect(x + i, y + 8, 10, 6);
    }
    if (p.checkpoint) {
      g.fillStyle(0x557c7f); g.fillRect(x + 40, y - 29, 3, 29);
      g.fillStyle(p === this.checkpoint ? 0xb9fff0 : 0x617a83); g.fillRect(x + 40, y - 32, 13, 8);
    }
  }

  private paintHazard(g: Phaser.GameObjects.Graphics, h: RouteHazard, oc: number): void {
    const hv = this.hazardVis(h);
    const x = hv.x - oc, y = h.y;
    if (h.kind === 'snare' && !hv.warning && !hv.danger) return;

    const sc = this.field ? 0x80e9db : hv.danger ? 0xff6042 : hv.warning ? 0xffc077 : 0x77543e;
    g.fillStyle(sc); g.fillRect(x - hv.w - 3, y - 3, hv.w * 2 + 6, 3);

    if (h.kind === 'ram' || h.kind === 'snare') {
      const bot = hv.danger ? y : y - 116;
      g.fillStyle(0x64727a); g.fillRect(x - 7, 45, 14, Math.max(0, bot - 53));
      g.fillStyle(0x434f56); g.fillRect(x - hv.w, bot - 17, hv.w * 2, 17);
      g.fillStyle(sc); g.fillRect(x - hv.w, bot - 4, hv.w * 2, 4);
      if (hv.warning) { g.fillStyle(0xffb565, 0.13); g.fillRect(x - hv.w, y - hv.height, hv.w * 2, hv.height); }
    } else if (h.kind === 'sweep') {
      g.fillStyle(sc); g.fillRect(x - 12, y - 5, 24, 5);
      if (hv.danger || hv.warning) {
        g.fillRect(x - 2, y - hv.height, 4, hv.height);
        if (hv.danger) { g.fillStyle(0xff6e4b, 0.3); g.fillRect(x - 8, y - hv.height, 16, hv.height); }
      }
    } else if (hv.danger || hv.warning) {
      g.fillStyle(sc, hv.danger ? 0.8 : 0.28);
      for (let i = -3; i <= 3; i++) g.fillRect(x + i * 7, y - hv.height, 6, hv.height);
    }
  }

  private paintPlayer(g: Phaser.GameObjects.Graphics, oc: number): void {
    const px = this.player.x + 10 - oc, py = this.player.y, f = this.player.facing;
    const walk = this.player.ground ? Math.sin(this.phase * 18) * Math.abs(this.player.vx) / PLAYER_SPEED : -0.5;

    // Player ambient glow (subtle radial light)
    if (!this.reduced) {
      g.fillStyle(0xa5f2df, 0.04);
      g.fillCircle(px, py + 16, 48);
      g.fillCircle(px, py + 16, 32);
    }

    // Shield bubble — double ring with pulsing inner
    if (this.field) {
      const r1 = 42 + 3 * Math.sin(this.phase * 12);
      g.lineStyle(2, 0x84f2df, 0.7); g.strokeCircle(px, py + 14, r1);
      g.lineStyle(1, 0x84f2df, 0.25 + 0.15 * Math.sin(this.phase * 8));
      g.strokeCircle(px, py + 14, r1 - 6);
      g.fillStyle(0x84f2df, 0.06);
      g.fillCircle(px, py + 14, r1 - 3);
    }

    g.fillStyle(0x815340); g.fillRect(px - 11, py + 12, 6, 12);        // back arm
    g.fillStyle(0xb56849); g.fillRect(px - 6, py + 10, 12, 14);        // torso
    g.fillStyle(0xb7a79b); g.fillRect(px - 6, py + 23, 5, 8 + walk * 2);  // leg L
    g.fillStyle(0xdcc7a6); g.fillRect(px + 2, py + 23, 5, 8 - walk * 2);  // leg R
    g.fillStyle(0x53545a); g.fillRect(px - 7 + walk * 3, py + 29, 8, 3);  // boot L
    g.fillStyle(0x68656a); g.fillRect(px + 3 - walk * 3, py + 29, 8, 3);  // boot R
    g.fillStyle(0xe0c4ad); g.fillRect(px - 6, py + 3, 14, 8);          // head
    g.fillStyle(0xa5f2df); g.fillRect(px + 0, py + 4, 9, 3);           // visor
    g.fillStyle(0xe6aa75); g.fillRect(px + 3, py + 14, 7, 8);          // arm
    g.fillStyle(0xa2c6d3);
    g.fillRect(px + (this.combat.recoil > 0 ? 5 : 8), py + 13, 13, 4); // gun
    if (this.combat.recoil > 0.055) {
      g.fillStyle(0xfff4b1); g.fillTriangle(px + 17, py + 11, px + 28, py + 15, px + 17, py + 18);
    }
  }

  private paintEnemy(g: Phaser.GameObjects.Graphics, e: { kind: string; x: number; y: number; hp: number; strength: number; flash: number; flying: boolean; age: number; reload: number }, oc: number): void {
    const ex = e.x - oc;
    const color = e.flash > 0 ? 0xffffff : e.flying ? 0xc77f70 :
      ['walker', 'runner', 'burrower'].includes(e.kind) ? 0x86a976 : 0xb49982;

    g.fillStyle(color);
    if (e.kind === 'warden') {
      g.fillRect(ex - 26, e.y - 20, 52, 32);
      g.fillStyle(0x311e2e); g.fillRect(ex - 23, e.y - 29, 46, 4);
      g.fillStyle(0xffd07a); g.fillRect(ex - 23, e.y - 29, 46 * e.hp / e.strength, 4);
      g.fillStyle(e.reload < 0.4 ? 0xfff6ab : 0xff9071); g.fillRect(ex - 12, e.y - 7, 24, 5);
    } else if (e.flying) {
      const flap = Math.sin(e.age * 11) * 8;
      g.fillTriangle(ex - 20, e.y - 7 - flap, ex, e.y - 3, ex + 19, e.y - 9 + flap);
    } else if (['walker', 'runner', 'burrower', 'sentinel'].includes(e.kind)) {
      g.fillRect(ex - 5, e.y - 13, 11, 11);
      g.fillRect(ex - 7, e.y - 2, 15, 13);
      g.fillRect(ex + 5, e.y, 13, 3);
      g.fillRect(ex - 6, e.y + 10, 4, 5 + Math.sin(e.age * 9) * 3);
      g.fillRect(ex + 3, e.y + 10, 4, 5 - Math.sin(e.age * 9) * 3);
    } else if (e.kind === 'turret') {
      g.fillRect(ex - 12, e.y, 24, 12); g.fillRect(ex, e.y - 4, 21, 5);
    } else {
      g.fillRect(ex - 21, e.y - 4, 33, 10);
    }
    g.fillStyle(0xffd49e); g.fillRect(ex + 5, e.y - 6, 4, 2);
  }

  private paintCreature(g: Phaser.GameObjects.Graphics, c: CreatureState, oc: number): void {
    const cx = c.x - oc;
    if (c.kind === 'kite') {
      const w = Math.sin(this.phase * 12) * 8;
      g.fillStyle(0xdb966e);
      g.fillTriangle(cx - 20, c.y - 8 - w, cx, c.y, cx + 20, c.y - 10 + w);
    } else if (c.kind === 'adder') {
      g.fillStyle(0x90bc78); g.fillRect(cx - 22, c.y - 2, 34, 8); g.fillRect(cx + 5, c.y - 9, 12, 7);
    } else {
      g.fillStyle(0xc79179); g.fillRect(cx - 22, c.y - 12, 42, 23);
    }
    g.fillStyle(0xffe2ad); g.fillRect(cx + 7, c.y - 5, 3, 2);
  }

  private paintTrap(g: Phaser.GameObjects.Graphics, oc: number): void {
    const t = this.combat.trap;
    if (t.age < 0 || t.age >= t.delay + 0.65) return;
    const surge = t.age - t.delay;
    const tx = t.x - oc;
    if (surge < 0) {
      g.fillStyle(0xffc080); g.fillRect(tx - 18, t.y - 3, 36, 3);
    } else if (t.kind === 2) {
      g.fillStyle(0xdc8b65); g.fillRect(tx - 18, t.y - 120 + surge * 166, 36, 24);
    } else {
      const off = t.kind === 1 ? (surge - 0.32) * 160 : 0;
      g.fillStyle(0xff9c58); g.fillTriangle(tx + off - 16, t.y, tx + off, t.y - 40, tx + off + 16, t.y);
    }
  }

  // ─── HUD ───
  private paintHUD(g: Phaser.GameObjects.Graphics): void {
    // Shield charge bar
    g.fillStyle(0x0a0e14, 0.65); g.fillRect(8, 8, 185, 52);
    g.fillStyle(0x344952); g.fillRect(14, 44, 121, 5);
    const cc = this.field ? 0x84f2df : this.shield.cooldown > 0 ? 0x7a5a3a : 0x7fe4d7;
    g.fillStyle(cc); g.fillRect(14, 44, 121 * Math.max(0, this.charge), 5);

    // Progress
    g.fillStyle(0x0a0e14, 0.65); g.fillRect(this.vw - 136, 8, 128, 42);
    g.fillStyle(0x344952); g.fillRect(this.vw - 128, 36, 100, 5);
    const prog = Math.max(0, Math.min(1, this.player.x / this.chapter.exit));
    g.fillStyle(0xffba74); g.fillRect(this.vw - 128, 36, 100 * prog, 5);

    // Update text objects
    if (this.txtShield) this.txtShield.setText(this.shield.statusText);
    if (this.txtWeapon) this.txtWeapon.setText(`${this.combat.guns[this.combat.gun].name} ${this.combat.ammo}/12`);
    if (this.txtSector) {
      const st = `SECTOR ${this.section}/3` +
        (this.chapter.segments > 1n ? ` · ROUTE ${this.segment + 1n}/${this.chapter.segments}` : '');
      this.txtSector.setText(st);
    }
    if (this.txtDeaths) this.txtDeaths.setText(`RETRIES ${String(this.deaths).padStart(2, '0')}`);
    if (this.txtNotice) {
      this.txtNotice.setText(this.noticeMsg);
      this.txtNotice.setAlpha(this.noticeTimer > 0 ? Math.min(1, this.noticeTimer * 2) : 0);
    }
  }

  private createHUDTexts(): void {
    const ms = { fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold' } as const;
    this.txtShield = this.add.text(14, 14, '', { ...ms, color: '#b3ede6' }).setScrollFactor(0).setDepth(100);
    this.txtWeapon = this.add.text(14, 28, '', { ...ms, color: '#b3ede6' }).setScrollFactor(0).setDepth(100);
    this.txtSector = this.add.text(0, 14, '', { ...ms, color: '#ffd498' }).setScrollFactor(0).setDepth(100);
    this.txtDeaths = this.add.text(0, 26, '', { ...ms, color: '#a8b4bd' }).setScrollFactor(0).setDepth(100);
    this.txtNotice = this.add.text(0, 0, '', {
      fontSize: '12px', fontFamily: 'monospace', fontStyle: 'bold', color: '#d8fff4', align: 'center',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5);
    this.repositionHUD();
  }

  private repositionHUD(): void {
    if (this.txtSector) this.txtSector.setPosition(this.vw - 128, 14);
    if (this.txtDeaths) this.txtDeaths.setPosition(this.vw - 128, 26);
    if (this.txtNotice) this.txtNotice.setPosition(this.vw / 2, this.vh - 40);
  }

  /* ═══════════════════════════════════════════
     Touch controls
     ═══════════════════════════════════════════ */

  // Track Nova button separately for conditional visibility
  private novaBtn?: Phaser.GameObjects.Text;

  private createTouchControls(): void {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Always add header buttons (Pause + Sound + Menu)
    const headerStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '12px', fontFamily: 'system-ui, sans-serif',
      color: '#edece7', backgroundColor: '#17222de8',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    };

    const pauseBtn = this.add.text(this.vw - 220, 8, '⏸ Pause', headerStyle)
      .setScrollFactor(0).setDepth(150).setInteractive({ useHandCursor: true });
    pauseBtn.on('pointerdown', () => this.pause());
    this.touchButtons.push(pauseBtn);

    const soundBtn = this.add.text(this.vw - 273, 8, this.audio.isMuted ? '🔇' : '🔊', headerStyle)
      .setScrollFactor(0).setDepth(150).setInteractive({ useHandCursor: true });
    soundBtn.on('pointerdown', () => {
      const newMuted = !this.audio.isMuted;
      this.audio.setMuted(newMuted);
      SaveManager.setMuted(newMuted);
      soundBtn.setText(newMuted ? '🔇' : '🔊');
    });
    this.touchButtons.push(soundBtn);

    const menuBtn = this.add.text(this.vw - 320, 8, '☰', headerStyle)
      .setScrollFactor(0).setDepth(150).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerdown', () => {
      if (this.status === 'playing') this.pause();
    });
    this.touchButtons.push(menuBtn);

    if (!isMobile) return;

    // Touch gameplay buttons
    const width = Math.min(116, Math.floor((this.vw - 100) / 4));
    const gap = 12;
    const left = 26;
    const right = this.vw - left - width;
    const bottom = this.vh - 18;
    const defs = [
      { label: 'LEFT', action: 'left', x: left, y: bottom, bg: '#203a47' },
      { label: 'RIGHT', action: 'right', x: left + width + gap, y: bottom, bg: '#203a47' },
      { label: 'SHOOT', action: 'shoot', x: right - width - gap, y: bottom, bg: '#905326' },
      { label: 'JUMP', action: 'jump', x: right, y: bottom, bg: '#aa5221' },
      { label: 'SHIELD', action: 'field', x: right - width - gap, y: bottom - 82, bg: '#205558' },
      { label: 'DASH', action: 'dash', x: right, y: bottom - 82, bg: '#263c4b' },
    ];
    if (this.highest >= 4n) {
      defs.push({ label: 'NOVA', action: 'nova', x: left, y: bottom - 82, bg: '#5a2878' });
    }
    for (const d of defs) {
      const btn = this.add.text(d.x, d.y, d.label, {
        fixedWidth: width, fixedHeight: 70, align: 'center',
        fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fontSize: '24px',
        color: '#ffffff', backgroundColor: d.bg, padding: { top: 18 },
      }).setOrigin(0, 1).setScrollFactor(0).setDepth(150).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        if (this.status !== 'playing') return;
        this.fingers.set(ptr.id, d.action);
        if (d.action === 'shoot') this.aimOrigins.set(ptr.id, { x: ptr.x, y: ptr.y });
        if (d.action === 'dash') this.dash();
        if (d.action === 'jump') this.jumpBuffer = JUMP_BUFFER_TIME;
      });

      btn.on('pointermove', (ptr: Phaser.Input.Pointer) => {
        const origin = this.aimOrigins.get(ptr.id);
        if (!origin) return;
        const dx = ptr.x - origin.x, dy = ptr.y - origin.y;
        this.playerAim = Math.hypot(dx, dy) > 10 ? Math.atan2(dy, dx) : null;
        this.combat.aim = this.playerAim;
      });

      const release = (ptr: Phaser.Input.Pointer) => {
        this.fingers.delete(ptr.id);
        if (this.aimOrigins.delete(ptr.id)) { this.playerAim = null; this.combat.aim = null; }
      };
      btn.on('pointerup', release);
      btn.on('pointerout', release);

      if (d.action === 'nova') this.novaBtn = btn;
      this.touchButtons.push(btn);
    }
  }

  /* ═══════════════════════════════════════════
     Dialog
     ═══════════════════════════════════════════ */

  private showDialog(label: string, title: string, msg: string, btnLabel: string, onPress: () => void, showMenu = false): void {
    this.hideDialog();
    this.dialogCallback = onPress;
    const cx = this.vw / 2, cy = this.vh / 2;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(200);

    c.add(this.add.rectangle(cx, cy, this.vw, this.vh, 0x060c12, 0.85).setInteractive());
    c.add(this.add.text(cx, cy - 95, label, {
      fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffb46a',
    }).setOrigin(0.5));
    c.add(this.add.text(cx, cy - 50, title, {
      fontSize: '48px', fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: '#fff4dc',
    }).setOrigin(0.5));
    c.add(this.add.text(cx, cy + 10, msg, {
      fontSize: '14px', fontFamily: 'system-ui, sans-serif', color: '#a8b4bd',
      align: 'center', wordWrap: { width: 460 },
    }).setOrigin(0.5));

    const btn = this.add.rectangle(cx, cy + 70, 200, 44, 0xffb46a).setInteractive({ useHandCursor: true });
    c.add(btn);
    c.add(this.add.text(cx, cy + 70, `${btnLabel} →`, {
      fontSize: '16px', fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: '#1e140d',
    }).setOrigin(0.5));

    btn.on('pointerover', () => btn.setFillStyle(0xffc47d));
    btn.on('pointerout', () => btn.setFillStyle(0xffb46a));
    btn.on('pointerdown', () => { this.audio.enable(); onPress(); });

    // Menu button (shown on pause / death)
    if (showMenu) {
      const menuBtn = this.add.text(cx, cy + 115, 'Return to Menu', {
        fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#a8b4bd',
        backgroundColor: '#17222d', padding: { left: 14, right: 14, top: 8, bottom: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      menuBtn.on('pointerover', () => menuBtn.setColor('#ffb46a'));
      menuBtn.on('pointerout', () => menuBtn.setColor('#a8b4bd'));
      menuBtn.on('pointerdown', () => this.returnToMenu());
      c.add(menuBtn);
    }

    this.dialog = c;
  }

  private hideDialog(): void {
    if (this.dialog) {
      this.dialog.destroy();
      this.dialog = undefined;
    }
    this.dialogCallback = undefined;
  }

  /* ═══════════════════════════════════════════
     Resize
     ═══════════════════════════════════════════ */

  private handleResize(): void {
    const { width, height } = this.scale.gameSize;
    this.vw = Math.max(480, width);
    this.vh = Math.max(270, height);
    this.repositionHUD();
  }
}
