// ─── FAULTLINE — Entry Point ───
// Initializes Phaser game with all scenes

import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

// Show loading feedback immediately
const container = document.getElementById('game-container');
if (container) {
  container.innerHTML = '<div style="color:#ffb46a;font:bold 18px system-ui;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#0a0e14">Loading FAULTLINE...</div>';
}

// Global error handler — shows errors visually on Android
window.onerror = (msg, src, line, col, err) => {
  const el = document.getElementById('game-container');
  if (el) {
    el.innerHTML = `<div style="color:#ff6a6a;font:12px monospace;padding:20px;background:#0a0e14;width:100%;height:100%;overflow:auto">
      <b>Error:</b> ${msg}<br><b>Source:</b> ${src}:${line}:${col}<br><b>Stack:</b> ${err?.stack ?? 'N/A'}
    </div>`;
  }
};

try {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#0a0e14',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.round(540 * Math.max(innerWidth, innerHeight) / Math.min(innerWidth, innerHeight)),
      height: 540,
    },
    scene: [BootScene, MenuScene, GameScene],
    render: {
      pixelArt: false,
      antialias: true,
      antialiasGL: true,
      roundPixels: false,
    },
    input: {
      activePointers: 6, // Multitouch support
      touch: { capture: true },
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
    audio: {
      noAudio: true, // We use Web Audio API directly
    },
    banner: false,
  };

  // Clear loading message
  if (container) container.innerHTML = '';

  // Launch the game
  const game = new Phaser.Game(config);

  // Handle orientation on mobile
  function checkOrientation(): void {
    const rotateNotice = document.getElementById('rotate-notice');
    const gc = document.getElementById('game-container');
    if (!rotateNotice || !gc) return;

    const isPortrait = window.innerHeight > window.innerWidth;
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isMobile && isPortrait) {
      rotateNotice.style.display = 'flex';
      gc.style.display = 'none';
    } else {
      rotateNotice.style.display = 'none';
      gc.style.display = 'flex';
    }
  }

  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

  // Prevent default touch behaviors
  document.addEventListener('touchmove', (e) => {
    if (e.target instanceof HTMLCanvasElement) e.preventDefault();
  }, { passive: false });

  // Handle visibility change — pause audio
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.scene.scenes.forEach(scene => {
        if (scene.scene.isActive()) {
          game.events.emit('blur');
        }
      });
    }
  });
} catch (err: any) {
  const el = document.getElementById('game-container');
  if (el) {
    el.innerHTML = `<div style="color:#ff6a6a;font:12px monospace;padding:20px;background:#0a0e14;width:100%;height:100%;overflow:auto">
      <b>Init Error:</b> ${err?.message}<br><b>Stack:</b> ${err?.stack ?? 'N/A'}
    </div>`;
  }
}

