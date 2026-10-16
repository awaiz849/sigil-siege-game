// Spawn schedule: which enemies come when, per wave, plus the boss.
// Fairness: spawns pause when the boss arrives, keep a minimum gap, wait while the field
// is at the cap, and only use free lanes.
import { CONFIG } from '../config.ts';
import type { Element, World } from './types.ts';
import { ELEMENTS, pick } from './world.ts';
import { spawnEnemy } from './enemies.ts';
import { freeLanes } from './crowd.ts';
import { maxEnemies, scaledInterval } from './difficulty.ts';

/** The regular spawners. Boss is handled separately. */
const SPAWNERS = ['imp', 'bird', 'warlock'] as const;
type SpawnerType = (typeof SPAWNERS)[number];
const TIMER_KEY = { imp: 'impAt', bird: 'birdAt', warlock: 'warlockAt' } as const;

/** Normal-difficulty spawn intervals (s) right now; 0 = this type is off. */
function baseIntervals(world: World): Record<SpawnerType, number> {
  const wave = CONFIG.WAVES[world.wave - 1];
  if (world.bossSpawned) return { ...wave, imp: CONFIG.AFTER_BOSS_IMP_S };
  return wave;
}

/** Run the spawn schedule for this frame (call after the wave number is updated). */
export function updateSpawns(world: World): void {
  const s = world.spawn;
  const t = world.time;

  // The boss always arrives on time (ignores cap and lanes) and pauses all other spawns.
  if (!world.bossSpawned && t >= CONFIG.BOSS.arriveS) {
    spawnEnemy(world, 'boss', pick(world, ELEMENTS), 0);
    world.bossSpawned = true;
    s.pausedUntil = t + CONFIG.BOSS_SPAWN_PAUSE_S;
    s.lastSpawnAt = t;
  }

  // Switch spawners on (first spawn after a short delay) or off for the current wave.
  const intervals = baseIntervals(world);
  for (const type of SPAWNERS) {
    const key = TIMER_KEY[type];
    if (intervals[type] === 0) s[key] = Infinity;
    else if (s[key] === Infinity) s[key] = t + CONFIG.FIRST_SPAWN_DELAY_S;
  }

  // Waiting rules: boss pause, minimum gap, field full.
  if (t < s.pausedUntil) return;
  if (t - s.lastSpawnAt < CONFIG.SPAWN_MIN_GAP_S) return;
  if (world.enemies.length >= maxEnemies(world)) return;

  // The most overdue spawner goes first; at most one spawn per frame.
  const due = SPAWNERS.filter((type) => s[TIMER_KEY[type]] <= t).sort((a, b) => s[TIMER_KEY[a]] - s[TIMER_KEY[b]]);
  if (due.length === 0) return;
  const lanes = freeLanes(world);
  if (lanes.length === 0) return;

  const type = due[0];
  const enemy = spawnEnemy(world, type, chooseElement(world), pick(world, lanes));
  enemy.hint = world.wave === 1;
  s[TIMER_KEY[type]] = t + scaledInterval(world, intervals[type]);
  s.lastSpawnAt = t;
}

/** Wave 1 teaches one element at a time (a few imps in a row share it); later waves are random. */
function chooseElement(world: World): Element {
  if (world.wave !== 1) return pick(world, ELEMENTS);
  const s = world.spawn;
  if (s.wave1Count >= CONFIG.WAVE1_SAME_ELEMENT) {
    s.wave1Element = pick(world, ELEMENTS.filter((el) => el !== s.wave1Element));
    s.wave1Count = 0;
  }
  s.wave1Count++;
  return s.wave1Element;
}
