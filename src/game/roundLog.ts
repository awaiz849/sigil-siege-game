// Round log for tuning by hand (BUILD_PLAN A3). Per round it records: time from pen down to cast
// for every stroke, kills, castle damage taken per wave, and how many enemies were on the field each second.
// Pure data on the World; main.ts prints it (and can save it) when the round ends.
import { CONFIG, type Difficulty } from '../config.ts';
import type { World } from './types.ts';

export interface StrokeLog {
  /** world.time when the pen went down. */
  penDownAt: number;
  /** Seconds from pen down to the cast. */
  seconds: number;
  /** Recognizer name, or null when not recognized. */
  shape: string | null;
  /** SpellResult kind: hit, kill, block, miss, fizzle, cooldown. */
  result: string;
}

export interface RoundLog {
  difficulty: Difficulty;
  strokes: StrokeLog[];
  /** Index 0 = wave 1. */
  killsByWave: number[];
  damageByWave: number[];
  /** Index i = enemies on the field at the end of second i + 1. */
  enemiesPerSecond: number[];
  /** Start of the stroke being drawn right now (world.time), null = pen up. */
  penDownAt: number | null;
}

export function createRoundLog(difficulty: Difficulty): RoundLog {
  return {
    difficulty,
    strokes: [],
    killsByWave: [0, 0, 0],
    damageByWave: [0, 0, 0],
    enemiesPerSecond: [],
    penDownAt: null,
  };
}

/** Call when the pen goes down (onStrokeStart). */
export function noteStrokeStart(world: World): void {
  if (world.phase === 'PLAYING') world.log.penDownAt = world.time;
}

/** Called by spells.ts after every cast that came from a stroke. */
export function logCast(world: World, shape: string | null, result: string): void {
  const start = world.log.penDownAt;
  if (start === null) return; // no pen-down seen (e.g. shield from an open palm)
  world.log.strokes.push({ penDownAt: start, seconds: world.time - start, shape, result });
  world.log.penDownAt = null;
}

/** Called by update(): one sample of the enemy count per whole second. */
export function logSeconds(world: World): void {
  const log = world.log.enemiesPerSecond;
  while (log.length < Math.floor(world.time)) log.push(world.enemies.length);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** A short text report of the round, for the console (and for Claude to read when tuning). */
export function formatRoundLog(world: World): string {
  const log = world.log;
  const times = log.strokes.map((s) => s.seconds);
  const counts: Record<string, number> = {};
  for (const s of log.strokes) counts[s.result] = (counts[s.result] ?? 0) + 1;
  const perSecond = log.enemiesPerSecond;
  const rows: string[] = [];
  for (let i = 0; i < perSecond.length; i += 10) {
    rows.push(`  ${String(i + 1).padStart(2)}-${String(Math.min(i + 10, perSecond.length)).padEnd(2)}: ${perSecond.slice(i, i + 10).join(' ')}`);
  }
  return [
    `ROUND LOG ${log.difficulty}: ${world.phase} at ${world.time.toFixed(1)} s, score ${world.score}, castle ${world.castleHp}/${CONFIG.DIFFICULTY[log.difficulty].castleHp}`,
    `strokes: ${log.strokes.length}, pen down -> cast avg ${avg(times).toFixed(2)} s, slowest ${Math.max(0, ...times).toFixed(2)} s`,
    `results: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
    `kills: ${world.stats.kills} (per wave ${log.killsByWave.join(' / ')})`,
    `castle damage per wave: ${log.damageByWave.join(' / ')}`,
    `enemies on field per second: avg ${avg(perSecond).toFixed(1)}, max ${Math.max(0, ...perSecond)} (cap ${CONFIG.DIFFICULTY[log.difficulty].maxEnemies})`,
    ...rows,
  ].join('\n');
}
