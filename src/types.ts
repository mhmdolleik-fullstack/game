// ─── Shared type definitions for the entire game ───

export interface RoutePlatform {
  x: number;
  y: number;
  w: number;
  section: number;
  checkpoint?: boolean;
  mechanic?: string | null;
  fragile?: boolean;
  crack: number;
}

export interface RouteHazard {
  kind: string;
  x: number;
  y: number;
  offset: number;
  warningTime: number;
  activeTime: number;
  armedAt?: number;
}

export interface Chapter {
  number: bigint;
  name: string;
  color: number;
  mechanic: string;
  hazard: string;
  tip: string;
  segments: bigint;
  episode: bigint;
  zoneIndex: number;
  level: number;
  episodeTitle: string;
  title: string;
  story: string;
  platforms: RoutePlatform[];
  hazards: RouteHazard[];
  exit: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ground: RoutePlatform | null;
  facing: number;
  dashUsed?: boolean;
  dashTime?: number;
}

export interface CreatureState {
  kind: string;
  home: number;
  floor: number;
  age: number;
  dead: boolean;
  x: number;
  y: number;
  wounds: number;
}

export interface EnemyState {
  kind: string;
  home: number;
  floor: number;
  left: number;
  right: number;
  strength: number;
  flying: boolean;
  hp: number;
  x: number;
  y: number;
  age: number;
  flash: number;
  reload: number;
  waveDelay?: number;
}

export interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  power?: number;
  enemy?: boolean;
  color: string;
}

export interface TrapState {
  x: number;
  y: number;
  age: number;
  delay: number;
  kind: number;
}

export interface AmmoItem {
  x: number;
  y: number;
  used: boolean;
}

export interface LedgePlatform {
  x: number;
  y: number;
  w: number;
  crack: number;
  section: number;
  mechanic?: string | null;
  checkpoint?: boolean;
  fragile?: boolean;
}

export interface GunDef {
  name: string;
  cooldown: number;
  speed: number;
  damage: number;
  color: string;
}

export interface HazardVisual {
  x: number;
  height: number;
  danger: boolean;
  warning: boolean;
  w: number;
}

export type GameStatus = 'intro' | 'playing' | 'dead' | 'clear' | 'paused' | 'briefing';

export interface ZoneDef {
  name: string;
  color: number;
  mechanic: string;
  hazard: string;
  tip: string;
}

// Chapter theme definitions for distinct visual worlds
export interface ChapterTheme {
  bgGradientTop: string;
  bgGradientMid: string;
  bgGradientBot: string;
  platformColor: string;
  platformEdge: string;
  ambientParticles: string;
  weatherType: 'none' | 'rain' | 'snow' | 'ash' | 'wind' | 'spores';
  musicTempo: number;
}

// Save data structure
export interface SaveData {
  chapter: string;
  highest: string;
  checkpoint: string;
  routeSegment: string;
  muted: string;
  deaths: number;
  totalDeaths: number;
  totalKills: number;
  playTime: number;
  completedChapters: number[];
}
