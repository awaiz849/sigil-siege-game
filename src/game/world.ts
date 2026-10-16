// The World: one plain object holding the whole game state, in world units.
// Logic updates it; the renderer and UI read it every frame. No drawing here.
import { CONFIG, type Difficulty } from '../config.ts';
import type { Element, GameEvent, World } from './types.ts';
import { updateEnemies } from './enemies.ts';
import { updateSpawns } from './waves.ts';
import { pushApart } from './crowd.ts';
import { createRoundLog, logSeconds } from './roundLog.ts';
import { castleMaxHp } from './difficulty.ts';

export const ELEMENTS: Element[] = ['fire', 'water', 'nature'];

/** A fresh world on the given difficulty, waiting in the menu. Call startRound() to play.
 *  Pass a seed for reproducible tests. */
export function createWorld(difficulty: Difficulty = 'normal', seed: number = Date.now()): World {
  return {
    difficulty,
    phase: 'MENU',
    time: 0,
    wave: 1,
    castleHp: castleMaxHp({ difficulty }),
    score: 0,
    combo: 1,
    lightningCooldown: 0,
    windCooldown: 0,
    mana: CONFIG.MANA.max,
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
    stats: { spawned: { imp: 0, bird: 0, warlock: 0, boss: 0 }, kills: 0, perfects: 0 },
    log: createRoundLog(difficulty),
  };
}

/** Leave the menu and start the round (called when the player holds the palm on the title screen).
 *  To play again, create a new world with createWorld() and start that one. */
export function startRound(world: World): World {
  if (world.phase === 'MENU') world.phase = 'PLAYING';
  return world;
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
  world.log.damageByWave[world.wave - 1] += damage;
  world.events.push({ type: 'castleHit', enemyId, damage, cause });
}

/** Hand over every event since the last call and clear the list. The UI calls this once per frame. */
export function takeEvents(world: World): GameEvent[] {
  return world.events.splice(0);
}

/** Advance the game by dt seconds (capped at MAX_DT). Does nothing in the menu or once the round is over. */
export function update(world: World, dt: number): void {
  if (world.phase !== 'PLAYING') return;
  dt = Math.min(dt, CONFIG.MAX_DT);

  if (world.time === 0) world.events.push({ type: 'waveStart', wave: 1 });
  world.time += dt;
  world.lightningCooldown = Math.max(0, world.lightningCooldown - dt);
  world.windCooldown = Math.max(0, world.windCooldown - dt);
  world.mana = Math.min(CONFIG.MANA.max, world.mana + CONFIG.DIFFICULTY[world.difficulty].manaRegen * dt);
  updateWave(world);
  updateSpawns(world);
  updateEnemies(world, dt);
  pushApart(world);
  logSeconds(world);
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

/** True while the boss is on the field (the clock can't end the round then). */
export function bossAlive(world: World): boolean {
  return world.enemies.some((e) => e.type === 'boss');
}

/** Lose at 0 HP. Win by killing the boss, or when the clock runs out with no boss on the field.
 *  While the boss lives the round goes on after the clock hits 0: you must deal with it. */
function checkEnd(world: World): void {
  if (world.castleHp <= 0) {
    world.phase = 'LOSE';
    world.events.push({ type: 'gameOver', result: 'LOSE' });
  } else if (world.bossDefeated || (world.time >= CONFIG.ROUND_SECONDS && !bossAlive(world))) {
    awardCleanWave(world); // the last wave counts too
    world.phase = 'WIN';
    world.events.push({ type: 'gameOver', result: 'WIN' });
  }
}
