// Every tunable number lives here. Change values here, never inline in code.

export type Difficulty = 'easy' | 'normal' | 'hard';

export const CONFIG = {
  // ---- Input ----
  /** "poses" = finger poses, "pinch" = thumb-index pinch fallback. */
  INPUT_MODE: 'poses' as 'poses' | 'pinch',
  /** Frames a pose must be stable before it counts. */
  POSE_STABLE_FRAMES: 3,
  /** Pinch thresholds (thumb-index distance / hand size) and release delay. */
  PINCH_ON: 0.25,
  PINCH_OFF: 0.4,
  PINCH_RELEASE_MS: 100,
  /** Strokes shorter than this are ignored. */
  MIN_STROKE_POINTS: 8,
  MIN_STROKE_PX: 40,
  /** Debug mouse: ignore moves smaller than this while drawing. */
  MOUSE_MIN_STEP_PX: 3,
  /** Hold times for hands-free menus. */
  PALM_HOLD_START_S: 1.2,
  HOVER_SELECT_S: 0.8,

  // ---- Recognizer ----
  RECOGNIZER_THRESHOLD: 0.8,
  /** Precheck: end-to-end distance / path length at or above this = line. */
  LINE_STRAIGHTNESS: 0.95,
  /** Precheck: end gap below this fraction of the bounding-box diagonal = closed shape. */
  CLOSED_GAP_RATIO: 0.25,

  // ---- Castle and scoring ----
  CASTLE_HP: 100,
  WALL_HIT_DAMAGE: 10,
  ROUND_SECONDS: 90,
  WAVE_SECONDS: 30,
  KILL_SCORE: 100,
  MAX_COMBO: 5,
  CLEAN_WAVE_BONUS: 500,

  // ---- Spells ----
  LIGHTNING_COOLDOWN_S: 10,
  SHIELD_STUN_S: 3,
  DMG_STRONG: 2,
  DMG_WEAK: 0.5,
  DMG_STUNNED: 2,

  // ---- Enemies (Normal difficulty) ----
  IMP: { hp: 2, speed: 2.3 },
  BIRD: { hp: 1, speed: 4.2 },
  WARLOCK: { hp: 3, speed: 1.8, chargeS: 3, blastDamage: 20, rechargeS: 4 },
  BOSS: { hp: 8, speed: 1.0, arriveS: 75, elementSwapS: 5, swapWarningS: 1.5 },

  // ---- Difficulty multipliers ----
  DIFFICULTY: {
    easy: { speed: 0.75, spawnInterval: 1.3, maxEnemies: 5 },
    normal: { speed: 1, spawnInterval: 1, maxEnemies: 7 },
    hard: { speed: 1.25, spawnInterval: 0.8, maxEnemies: 9 },
  } as Record<Difficulty, { speed: number; spawnInterval: number; maxEnemies: number }>,

  // ---- Rendering ----
  /** Cap on devicePixelRatio; lower it if 3D stutters with tracking. */
  MAX_PIXEL_RATIO: 1.5,
  SHADOWS: false,
};
