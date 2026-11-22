// ─── Main Menu Scene ───
// Title screen, level selection, settings

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../constants';
import { SaveManager } from '../systems/Save';
import { makeChapter } from '../systems/LevelGenerator';

export class MenuScene extends Phaser.Scene {
  private highest!: bigint;
  private selectedLevel!: bigint;
  private levelText!: Phaser.GameObjects.Text;
  private unlockText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private bgPhase = 0;

  constructor() {
    super({ key: 'Menu' });
  }

  create(): void {
    const savedChapter = SaveManager.getChapter();
    this.highest = SaveManager.getHighest(savedChapter);
    this.selectedLevel = savedChapter;

    const width = this.scale.gameSize.width;
    const cx = width / 2;
    const cy = GAME_HEIGHT / 2;

    // Animated background
    this.add.rectangle(cx, cy, width, GAME_HEIGHT, 0x0a0e14);

    // Decorative background lines
    for (let y = 60; y < GAME_HEIGHT; y += 76) {
      this.add.rectangle(cx, y, width, 1, 0x25323d, 0.3);
    }

    // Title
    this.add.text(cx, 60, '◈', {
      fontSize: '28px', color: '#ffb46a',
    }).setOrigin(0.5);

    this.add.text(cx, 100, 'FAULTLINE', {
      fontSize: '64px', color: '#fff4dc',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 145, 'DESCENT PROTOCOL', {
      fontSize: '13px', color: '#ffb46a',
      fontFamily: 'monospace',
      letterSpacing: 6,
    }).setOrigin(0.5);

    // Level selector
    const selectorY = 220;

    this.add.text(cx, selectorY - 25, 'SELECT LEVEL', {
      fontSize: '11px', color: '#a8b4bd',
      fontFamily: 'monospace',
      letterSpacing: 4,
    }).setOrigin(0.5);

    // Level input display
    const levelBg = this.add.rectangle(cx, selectorY + 10, 120, 40, 0x0c1923)
      .setStrokeStyle(1, 0x627786);

    this.levelText = this.add.text(cx, selectorY + 10, String(this.selectedLevel), {
      fontSize: '24px', color: '#ffca8a',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Arrow buttons for level selection
    const leftBtn = this.createButton(cx - 85, selectorY + 10, '◄', () => {
      if (this.selectedLevel > 1n) {
        this.selectedLevel--;
        this.updateSelection();
      }
    });

    const rightBtn = this.createButton(cx + 85, selectorY + 10, '►', () => {
      if (this.selectedLevel < this.highest) {
        this.selectedLevel++;
        this.updateSelection();
      }
    });

    this.unlockText = this.add.text(cx, selectorY + 42, `Unlocked through level ${this.highest}`, {
      fontSize: '12px', color: '#bfcec9',
      fontFamily: 'system-ui, sans-serif',
    }).setOrigin(0.5);

    // Level info
    this.infoText = this.add.text(cx, selectorY + 68, '', {
      fontSize: '12px', color: '#a8b4bd',
      fontFamily: 'system-ui, sans-serif',
      align: 'center',
      wordWrap: { width: 400 },
    }).setOrigin(0.5);
    this.updateSelection();

    // Play button
    const playY = selectorY + 120;
    const playBtn = this.add.rectangle(cx, playY, 200, 48, 0xffb46a)
      .setStrokeStyle(0)
      .setInteractive({ useHandCursor: true });

    const playText = this.add.text(cx, playY, 'PLAY →', {
      fontSize: '18px', color: '#1e140d',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    playBtn.on('pointerover', () => playBtn.setFillStyle(0xffc47d));
    playBtn.on('pointerout', () => playBtn.setFillStyle(0xffb46a));
    playBtn.on('pointerdown', () => this.startGame());

    // Level 1 quick start
    const quickBtn = this.createButton(cx, playY + 55, 'Level 1 · Fractured Entry', () => {
      this.selectedLevel = 1n;
      this.startGame();
    });

    // Bottom row: Sound + Stats
    const bottomY = GAME_HEIGHT - 40;
    const muted = SaveManager.getMuted();
    const soundBtn = this.createButton(cx - 80, bottomY, muted ? '🔇 Sound off' : '🔊 Sound on', () => {
      const newMuted = !SaveManager.getMuted();
      SaveManager.setMuted(newMuted);
      soundBtn.text = newMuted ? '🔇 Sound off' : '🔊 Sound on';
    }, true);

    const stats = SaveManager.getTotalStats();
    const playTimeMin = Math.floor(stats.time / 60);
    const statsLabel = stats.deaths || stats.kills
      ? `Deaths: ${stats.deaths}  Kills: ${stats.kills}  Time: ${playTimeMin}m`
      : 'No stats yet';
    this.add.text(cx + 100, bottomY, statsLabel, {
      fontSize: '11px', color: '#7a8a94',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Keyboard shortcut
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.selectedLevel > 1n) { this.selectedLevel--; this.updateSelection(); }
    });
    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.selectedLevel < this.highest) { this.selectedLevel++; this.updateSelection(); }
    });
  }

  private updateSelection(): void {
    this.levelText.setText(String(this.selectedLevel));
    try {
      const ch = makeChapter(this.selectedLevel);
      const chapterNum = ch.zoneIndex + 1;
      const levelInChapter = ch.level;
      this.infoText.setText(`Chapter ${chapterNum} · Level ${levelInChapter}/20\n${ch.name}\n${ch.title}`);
    } catch {
      this.infoText.setText('');
    }
  }

  private createButton(x: number, y: number, label: string, onClick: () => void, returnText = false): any {
    const text = this.add.text(x, y, label, {
      fontSize: '14px', color: '#edece7',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#17222d',
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    text.on('pointerover', () => text.setColor('#ffb46a'));
    text.on('pointerout', () => text.setColor('#edece7'));
    text.on('pointerdown', onClick);

    return text;
  }

  private startGame(): void {
    if (this.selectedLevel < 1n || this.selectedLevel > this.highest) {
      this.unlockText.setText(`Choose level 1 through ${this.highest}`);
      this.unlockText.setColor('#ff9060');
      return;
    }

    SaveManager.save('chapter', this.selectedLevel);
    this.scene.start('Game', {
      number: this.selectedLevel,
      highest: this.highest,
    });
  }
}
