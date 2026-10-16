// Plain data types for the game logic. No three.js, no DOM: the renderer and UI only READ these.
import type { Difficulty } from '../config.ts';

export type Element = 'fire' | 'water' | 'nature';
export type EnemyType = 'imp' | 'bird' | 'warlock' | 'boss';
/** walk = moving to the wall, charge = warlock charging a blast, recharge = warlock waiting after a blast. */
export type EnemyState = 'walk' | 'charge' | 'recharge';
export type Phase = 'playing' | 'won' | 'lost';
export type SpellName = 'water' | 'fire' | 'nature' | 'lightning' | 'shield';

/** World units, three.js axes: x = sideways, y = height, z = depth (negative = out in the field). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  element: Element;
  hp: number;
  maxHp: number;
  pos: Vec3;
  /** Units per second, difficulty already applied. */
  speed: number;
  radius: number;
  state: EnemyState;
  /** Seconds spent in the current state (warlock charge / recharge). */
  stateT: number;
  /** Seconds of stun left (0 = not stunned). Stunned enemies freeze and take x2 damage. */
  stunT: number;
  /** Wave 1 helper: show the faint counter-shape hint above this enemy. */
  hint: boolean;
  /** Boss only: the element it will switch to (non-null while the warning shows). */
  nextElement: Element | null;
  /** Boss only: seconds since the last element swap. */
  swapT: number;
  /** Seconds since spawn. */
  age: number;
}

/** Things that happened during the last updateWorld() call, for UI, camera shake and sound. */
export type GameEvent =
  | { type: 'waveStart'; wave: number }
  | { type: 'cleanWave'; wave: number; bonus: number }
  | { type: 'spawn'; enemyId: number; enemyType: EnemyType }
  | { type: 'castleHit'; enemyId: number; damage: number; cause: 'wall' | 'blast' }
  | { type: 'chargeStart'; enemyId: number }
  | { type: 'bossArrive'; enemyId: number }
  | { type: 'bossWarning'; enemyId: number; nextElement: Element }
  | { type: 'bossSwap'; enemyId: number; element: Element }
  | { type: 'gameOver'; result: 'won' | 'lost' };

/** Spawn timers (absolute world.time in seconds; Infinity = this type is off). Used by waves.ts. */
export interface SpawnState {
  impAt: number;
  birdAt: number;
  warlockAt: number;
  /** No spawns before this time (boss pause). */
  pausedUntil: number;
  /** Time of the last spawn (for the minimum gap between spawns). */
  lastSpawnAt: number;
  /** Wave 1: current shared element and how many imps already used it. */
  wave1Element: Element;
  wave1Count: number;
}

export interface World {
  difficulty: Difficulty;
  phase: Phase;
  /** Seconds since the round started. */
  time: number;
  /** 1, 2 or 3. */
  wave: number;
  castleHp: number;
  score: number;
  /** Score multiplier, 1..MAX_COMBO. */
  combo: number;
  /** Seconds until lightning can be cast again (0 = ready). */
  lightningCooldown: number;
  enemies: Enemy[];
  nextEnemyId: number;
  /** Castle took damage during the current wave (no clean-wave bonus). */
  waveDamaged: boolean;
  bossSpawned: boolean;
  bossDefeated: boolean;
  spawn: SpawnState;
  /** Random generator state (seeded, so tests are reproducible). */
  rng: number;
  /** Events from the last updateWorld() call. Cleared at the start of each update. */
  events: GameEvent[];
  /** Totals for tests and the end screen. */
  stats: { spawned: Record<EnemyType, number>; kills: number };
}
