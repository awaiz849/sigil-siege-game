// Difficulty: turns the Normal numbers from config.ts into Easy / Normal / Hard numbers.
import { CONFIG } from '../config.ts';
import type { EnemyType, World } from './types.ts';

/** Enemy speed in units/s for this round (base speed is the Normal value). */
export function scaledSpeed(world: World, baseSpeed: number): number {
  return baseSpeed * CONFIG.DIFFICULTY[world.difficulty].speed;
}

/** Seconds between spawns for this round (base interval is the Normal value). */
export function scaledInterval(world: World, baseSeconds: number): number {
  return baseSeconds * CONFIG.DIFFICULTY[world.difficulty].spawnInterval;
}

/** Most enemies allowed on the field at once; spawns wait while the field is full. */
export function maxEnemies(world: World): number {
  return CONFIG.DIFFICULTY[world.difficulty].maxEnemies;
}

/** Castle hit points at the start of a round on this difficulty. */
export function castleMaxHp(world: Pick<World, 'difficulty'>): number {
  return CONFIG.DIFFICULTY[world.difficulty].castleHp;
}

/** Castle damage when a monster of this type reaches the wall (the boss: per smash). */
export function wallDamage(world: World, type: EnemyType): number {
  return CONFIG.DIFFICULTY[world.difficulty].wallDamage[type];
}
