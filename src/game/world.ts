// The World: one plain object holding the whole game state, in world units.
// Logic updates it; the renderer and UI read it every frame. No drawing here.
import { CONFIG, type Difficulty } from '../config.ts';
import type { Element, World } from './types.ts';
import { updateEnemies } from './enemies.ts';
import { updateSpawns } from './waves.ts';
import { pushApart } from './crowd.ts';

export const ELEMENTS: Element[] = ['fire', 'water', 'nature'];

/** A fresh round on the given difficulty. Pass a seed for reproducible tests. */
export function createWorld(difficulty: Difficulty = 'normal', seed: number = Date.now()): World {
  return {
    difficulty,
    phase: 'playing',
    time: 0,
    wave: 1,
    castleHp: CONFIG.CASTLE_HP,
    score: 0,
    combo: 1,
    lightningCooldown: 0,
    enemies: [],
    nextEnemyId: 1,
    waveDamaged: false,
    bossSpawned: false,
    bossDefeated: false,
    spawn: {
      impAt: Infinity,
      birdAt: Infinity,
      warlockAt: Infinity,
      pausedUntil: 0,
      lastSpawnAt: -Infinity,
      wave1Element: 'fire',
      wave1Count: 0,
    },
    rng: seed >>> 0,
    events: [],
    stats: { spawned: { imp: 0, bird: 0, warlock: 0, boss: 0 }, kills: 0 },
  };
}

/** Seeded random number in [0, 1) (mulberry32). Always use this, never Math.random. */
export function random(world: World): number {
  world.rng = (world.rng + 0x6d2b79f5) >>> 0;
  let t = world.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Pick a random item from a list. */
export function pick<T>(world: World, items: readonly T[]): T {
  return items[Math.floor(random(world) * items.length)];
}

/** Damage the castle; ends the round at 0 HP. */
export function damageCastle(world: World, enemyId: number, damage: number, cause: 'wall' | 'blast'): void {
  world.castleHp = Math.max(0, world.castleHp - damage);
  world.waveDamaged = true;
  world.events.push({ type: 'castleHit', enemyId, damage, cause });
}

/** Advance the game by dt seconds. Does nothing once the round is over. */
export function updateWorld(world: World, dt: number): void {
  world.events.length = 0;
  if (world.phase !== 'playing') return;
  dt = Math.min(dt, CONFIG.MAX_DT);

  if (world.time === 0) world.events.push({ type: 'waveStart', wave: 1 });
  world.time += dt;
  world.lightningCooldown = Math.max(0, world.lightningCooldown - dt);
  updateWave(world);
  updateSpawns(world);
  updateEnemies(world, dt);
  pushApart(world);
  checkEnd(world);
}

/** Wave number from the clock; a wave that ends with no castle damage earns the bonus. */
function updateWave(world: World): void {
  const wave = Math.min(3, 1 + Math.floor(world.time / CONFIG.WAVE_SECONDS));
  if (wave === world.wave) return;
  awardCleanWave(world);
  world.wave = wave;
  world.waveDamaged = false;
  world.events.push({ type: 'waveStart', wave });
}

function awardCleanWave(world: World): void {
  if (world.waveDamaged) return;
  world.score += CONFIG.CLEAN_WAVE_BONUS;
  world.events.push({ type: 'cleanWave', wave: world.wave, bonus: CONFIG.CLEAN_WAVE_BONUS });
}

/** Lose at 0 HP; win by surviving the round or killing the boss. */
function checkEnd(world: World): void {
  if (world.castleHp <= 0) {
    world.phase = 'lost';
    world.events.push({ type: 'gameOver', result: 'lost' });
  } else if (world.time >= CONFIG.ROUND_SECONDS || world.bossDefeated) {
    awardCleanWave(world); // the last wave counts too
    world.phase = 'won';
    world.events.push({ type: 'gameOver', result: 'won' });
  }
}
