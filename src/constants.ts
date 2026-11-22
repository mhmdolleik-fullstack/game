// ─── Game constants and configuration ───

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const WORLD_HEIGHT = 470;

// Physics
export const GRAVITY = 1090;
export const PLAYER_SPEED = 315;
export const PLAYER_ACCEL = 2600;
export const JUMP_VELOCITY = -469;
export const SPRING_VELOCITY = -620;
export const DASH_SPEED = 570;
export const DASH_DURATION = 0.14;
export const COYOTE_TIME = 0.09;
export const JUMP_BUFFER_TIME = 0.13;
export const FALL_DEATH_Y = 470;
export const BELT_SPEED = -65;
export const GLIDE_MAX_FALL = 86;

// Shield
export const SHIELD_DURATION = 3;
export const SHIELD_COOLDOWN = 20;

// Combat
export const MAX_AMMO = 12;
export const RELOAD_TIME = 0.8;
export const NOVA_COOLDOWN = 4;
export const NOVA_RANGE = 130;
export const NOVA_DAMAGE = 3;

// Rendering
export const PARALLAX_LAYERS = 3;
export const MAX_PARTICLES = 150;
export const PHYSICS_DT = 1 / 120;
export const MAX_FRAME_TIME = 0.065;

// Colors
export const COLORS = {
  background: 0x090f16,
  backgroundDark: 0x080e16,
  platform: 0x25323b,
  platformEdge: 0x87959a,
  platformDetail: 0x42505b,
  platformRivet: 0x111a22,
  platformSupport: 0x17212a,
  checkpoint: 0x557c7f,
  checkpointActive: 0xb9fff0,
  checkpointInactive: 0x617a83,
  exitDoor: 0x23383e,
  exitInner: 0x112529,
  exitGlow: 0x9aeedb,
  shieldGlow: 0x84f2df,
  playerBody: 0xb56849,
  playerHead: 0xe0c4ad,
  playerVisor: 0xa5f2df,
  hazardDanger: 0xff6042,
  hazardWarning: 0xffc077,
  hazardIdle: 0x77543e,
  hazardShield: 0x80e9db,
  amberUI: 0xffb46a,
  tealUI: 0x7fe4d7,
  deathFlash: 0xff965c,
  secretGlow: 0x83ffe5,
  gridLine: 0x25323d,
  gridShadow: 0x101a22,
} as const;

// World names and configurations
export const WORLD_NAMES = [
  'The Deceptive World',
  'Sky Survival',
  'Dangerous Jungle',
  'Zombie Apocalypse',
  'Volcanic Disaster',
  'Frozen Wasteland',
];

export const WORLD_MODIFIERS = [
  'Ashfall', 'Moonlit', 'Overgrown', 'Flooded',
  'Obsidian', 'Stormbound', 'Frozen',
];

export const POPULATION_TYPES = [
  ['adder', 'hound', 'kite'],
  ['kite', 'drone', 'raptor'],
  ['adder', 'hound', 'stalker'],
  ['walker', 'runner', 'burrower'],
  ['turret', 'drone', 'sentinel'],
  ['raptor', 'sentinel', 'burrower'],
];

// Key bindings
export const KEY_BINDINGS: Record<string, string> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  KeyW: 'jump',
  ArrowUp: 'jump',
  KeyF: 'shoot',
  KeyC: 'nova',
  KeyX: 'dash',
  ShiftLeft: 'field',
  ShiftRight: 'field',
};

// Mechanic-specific platform edge colors
export const MECHANIC_COLORS: Record<string, number> = {
  fracture: 0xac7550,
  phase: 0xcb9dff,
  spring: 0x79cbff,
  belt: 0xefc272,
};

// Music scores per zone
export const MUSIC_SCORES = [
  [98, 147, 185, 123, 98, 165, 147, 110],
  [196, 247, 294, 370, 294, 247, 220, 294],
  [110, 165, 110, 196, 147, 110, 165, 131],
  [82, 87, 110, 82, 98, 87, 73, 82],
  [123, 185, 123, 246, 164, 123, 185, 207],
  [98, 196, 233, 147, 196, 131, 164, 196],
];
