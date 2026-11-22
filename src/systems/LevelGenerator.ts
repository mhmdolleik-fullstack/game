// ─── Level Generator ───
// Procedural level generation — ported from chapters.ts
// Deterministic seeded generation with solvability validation

import type { RoutePlatform, RouteHazard, Chapter, ZoneDef } from '../types';

const zones: ZoneDef[] = [
  { name: 'Intake Ruins', color: 185, mechanic: 'fracture', hazard: 'vent',
    tip: 'Cracked decks crumble under your boots. Hold Shield to brace them.' },
  { name: 'Hydraulic Foundry', color: 24, mechanic: 'belt', hazard: 'ram',
    tip: 'Conveyors pull against you. Hold Shield to stop the belt and freeze rams.' },
  { name: 'Ghost Relay', color: 259, mechanic: 'phase', hazard: 'arc',
    tip: 'Hold Shield just before landing on a violet bridge. Jump before the charge runs out.' },
  { name: 'Cryogen Vault', color: 195, mechanic: 'spring', hazard: 'vent',
    tip: 'Jump from blue launch pads to clear the long gaps. Steam rises after the floor flashes.' },
  { name: 'Counterweight Docks', color: 134, mechanic: 'belt', hazard: 'sweep',
    tip: 'The yellow scanner marks a moving shock barrier. Watch the sweep and time your crossing.' },
  { name: 'The Seismic Heart', color: 341, mechanic: 'phase', hazard: 'ram',
    tip: 'Brace violet bridges and time the machinery. The final section combines both challenges.' },
];

const episodeNames = ['The Blackout', 'False Signals', 'Pressure Below', 'The Last Survey'];

const stageNames = [
  ['Fractured Entry', 'Service Spine', 'Emergency Egress'],
  ['Feed Line', 'Twin Pistons', 'Slag Run'],
  ['Dead Channel', 'Phantom Bridge', 'Signal Breach'],
  ['Frost Lock', 'Thermal Exchange', 'Cold Launch'],
  ['Loading Grid', 'Swing Shift', 'Moving Target'],
  ['Seismic Trace', 'Fault Chamber', 'Break Point'],
];

const narratives = [
  'Mara follows the emergency lights below the collapsed intake.',
  'The factory keeps running after the operations crew is gone.',
  'A voice comes through the radio. It knows Mara\'s call sign.',
  'Pressure builds behind the frost-covered bulkhead.',
  'The cargo manifest shows a shipment that never reached the surface.',
  'A tremor tears through the core as the next descent route opens.',
];

export function makeChapter(number: number | bigint, segment: bigint = 0n): Chapter {
  const ordinal = BigInt(number);
  const index = ordinal - 1n;
  const episode = index / 120n + 1n;
  const zoneIndex = Number(index / 20n % 6n);
  const level = Number(index % 20n);
  const zone = zones[zoneIndex];

  // Seeded PRNG (LCG)
  let seed = BigInt.asUintN(64, ordinal ^ (ordinal >> 64n) ^ (segment * 104729n));
  const random = (limit: number): number => {
    seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1442695040888963407n);
    return Number((seed >> 33n) % BigInt(limit));
  };

  const difficulty = ordinal > 25n ? 24 : Number(index);
  const extra = ordinal > 25n ? ordinal - 25n : 0n;
  const segments = 1n + extra / 12n;
  const length = segment === 0n ? 12 + difficulty * 2 + Number(extra % 12n) * 2 : 24;

  const platforms: RoutePlatform[] = [
    { x: -50, y: 340, w: 300, section: 1, crack: 0 },
  ];
  const hazards: RouteHazard[] = [];

  const boundaries = [Math.floor(length / 3), Math.floor(length * 2 / 3)];

  for (let i = 1; i <= length; i++) {
    const previous = platforms[platforms.length - 1];
    const section = 1 + boundaries.filter(b => i >= b).length;
    const checkpoint = boundaries.includes(i) || (i % 5 === 0 && i < length - 1);
    const safe = checkpoint || i === length || (i === 1 && ordinal === 1n);
    const teaching = i === 2 || (i % 5 === 2 && i + 1 < length);
    const pattern = random(5);

    const mechanic =
      safe || previous.mechanic === 'phase' ? null :
      teaching ? zone.mechanic :
      section === 3 && i % 4 === 1 ? 'fracture' :
      pattern === 0 ? zone.mechanic : null;

    const gap = previous.mechanic === 'spring'
      ? 232 + random(34)
      : 61 + random(25) + difficulty * 2 + Math.min(level, 3) * 6;

    const x = previous.x + previous.w + gap;
    const y = 287 + random(54) - (zoneIndex === 1 ? Math.floor(i / length * 44) : 0);
    const w = safe ? 245 : 178 + random(51);

    const platform: RoutePlatform = {
      x, y, w, section, checkpoint,
      mechanic,
      fragile: mechanic === 'fracture',
      crack: 0,
    };
    platforms.push(platform);

    if (!safe && !mechanic && (pattern > 1 || section > 1)) {
      const kind = i % 7 === 6 ? 'snare' :
        section > 1 && i % 4 === 3 ? 'sweep' : zone.hazard;
      hazards.push({
        kind, x: x + Math.floor(w * 0.59), y,
        offset: random(70) / 100,
        warningTime: 0.49 - difficulty * 0.006,
        activeTime: 0.46 + Math.min(level, 3) * 0.08 + difficulty * 0.008,
      });
    }
  }

  const lastPlatform = platforms[platforms.length - 1];

  return {
    number: ordinal,
    name: zone.name,
    color: zone.color,
    mechanic: zone.mechanic,
    hazard: zone.hazard,
    tip: zone.tip,
    segments,
    episode,
    zoneIndex,
    level: level + 1,
    episodeTitle: episodeNames[Number((episode - 1n) % BigInt(episodeNames.length))],
    title: stageNames[zoneIndex][level % 3] + ' · Level ' + ordinal,
    story: narratives[zoneIndex] + ' ' + zone.tip,
    platforms,
    hazards,
    exit: lastPlatform.x + lastPlatform.w - 59,
  };
}

export { zones, episodeNames, stageNames, narratives };
