// ─── Boot Scene ───
// Procedural texture generation and asset setup

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  create(): void {
    // Generate procedural textures for the game
    this.generateTextures();

    // Transition to main menu
    this.scene.start('Menu');
  }

  private generateTextures(): void {
    // Player texture (20x32)
    const playerGfx = this.add.graphics();
    playerGfx.fillStyle(0xb56849);
    playerGfx.fillRect(4, 10, 12, 14); // body
    playerGfx.fillStyle(0xe0c4ad);
    playerGfx.fillRect(4, 0, 12, 11); // head
    playerGfx.fillStyle(0xa5f2df);
    playerGfx.fillRect(10, 4, 9, 3); // visor
    playerGfx.fillStyle(0x815340);
    playerGfx.fillRect(0, 12, 6, 12); // back arm
    playerGfx.fillStyle(0xe6aa75);
    playerGfx.fillRect(13, 14, 7, 8); // front arm
    playerGfx.fillStyle(0xb7a79b);
    playerGfx.fillRect(4, 23, 5, 9); // leg
    playerGfx.fillStyle(0xdcc7a6);
    playerGfx.fillRect(12, 23, 5, 9); // leg
    playerGfx.fillStyle(0x53545a);
    playerGfx.fillRect(2, 29, 8, 3); // boot
    playerGfx.fillStyle(0x68656a);
    playerGfx.fillRect(13, 29, 8, 3); // boot
    playerGfx.generateTexture('player', 24, 32);
    playerGfx.destroy();

    // Shield bubble texture (84x84)
    const shieldGfx = this.add.graphics();
    shieldGfx.lineStyle(2, 0x84f2df, 0.8);
    shieldGfx.strokeCircle(42, 42, 40);
    shieldGfx.lineStyle(1, 0x84f2df, 0.3);
    shieldGfx.strokeCircle(42, 42, 36);
    shieldGfx.generateTexture('shield', 84, 84);
    shieldGfx.destroy();

    // Projectile textures
    const boltGfx = this.add.graphics();
    boltGfx.fillStyle(0x9fffe6);
    boltGfx.fillRect(0, 1, 12, 2);
    boltGfx.generateTexture('bolt-pulse', 12, 4);
    boltGfx.clear();
    boltGfx.fillStyle(0xcda8ff);
    boltGfx.fillRect(0, 1, 12, 2);
    boltGfx.generateTexture('bolt-arc', 12, 4);
    boltGfx.clear();
    boltGfx.fillStyle(0xffca7d);
    boltGfx.fillRect(0, 0, 14, 3);
    boltGfx.generateTexture('bolt-flux', 14, 4);
    boltGfx.clear();
    boltGfx.fillStyle(0xff8068);
    boltGfx.fillRect(0, 1, 10, 2);
    boltGfx.generateTexture('bolt-enemy', 10, 4);
    boltGfx.destroy();

    // Particle texture (3x3 white square)
    const partGfx = this.add.graphics();
    partGfx.fillStyle(0xffffff);
    partGfx.fillRect(0, 0, 4, 4);
    partGfx.generateTexture('particle', 4, 4);
    partGfx.destroy();

    // Checkpoint flag texture
    const flagGfx = this.add.graphics();
    flagGfx.fillStyle(0x557c7f);
    flagGfx.fillRect(1, 0, 3, 32);
    flagGfx.fillStyle(0xb9fff0);
    flagGfx.fillRect(4, 0, 13, 8);
    flagGfx.generateTexture('flag-active', 17, 32);
    flagGfx.clear();
    flagGfx.fillStyle(0x557c7f);
    flagGfx.fillRect(1, 0, 3, 32);
    flagGfx.fillStyle(0x617a83);
    flagGfx.fillRect(4, 0, 13, 8);
    flagGfx.generateTexture('flag-inactive', 17, 32);
    flagGfx.destroy();

    // Ammo pickup texture (14x14)
    const ammoGfx = this.add.graphics();
    ammoGfx.fillStyle(0x275751);
    ammoGfx.fillRect(0, 0, 14, 14);
    ammoGfx.fillStyle(0xafffe4);
    ammoGfx.fillRect(3, 6, 9, 3); // horizontal cross
    ammoGfx.fillRect(6, 3, 3, 9); // vertical cross
    ammoGfx.generateTexture('ammo', 14, 14);
    ammoGfx.destroy();

    // Secret marker (5x5)
    const secretGfx = this.add.graphics();
    secretGfx.fillStyle(0x83ffe5);
    secretGfx.fillRect(0, 0, 5, 5);
    secretGfx.generateTexture('secret-marker', 5, 5);
    secretGfx.destroy();

    // 1px white for tinting
    const whiteGfx = this.add.graphics();
    whiteGfx.fillStyle(0xffffff);
    whiteGfx.fillRect(0, 0, 1, 1);
    whiteGfx.generateTexture('white', 1, 1);
    whiteGfx.destroy();
  }
}
