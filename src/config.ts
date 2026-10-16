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
  /** Hand: ignore fingertip moves smaller than this while drawing. */
  HAND_MIN_STEP_PX: 3,
  /** Finger is extended if tip-to-wrist > PIP-to-wrist x this. */
  FINGER_EXTEND_RATIO: 1.15,
  /** Only the inner part of the camera image maps to the screen (edges are hard to reach). */
  HAND_EDGE_MARGIN: 0.12,
  /** One Euro filter on the cursor (pixels). Lower minCutoff = smoother, higher beta = less lag. */
  ONE_EURO_MIN_CUTOFF: 1.2,
  ONE_EURO_BETA: 0.01,
  /** MediaPipe confidences. */
  HAND_DETECTION_CONFIDENCE: 0.6,
  HAND_TRACKING_CONFIDENCE: 0.5,
  CAMERA_WIDTH: 640,
  CAMERA_HEIGHT: 480,
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
  DMG_BASE: 1,
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

  // ---- Game logic: field, spawning, crowd (src/game) ----
  /** Longest frame step the logic accepts (s); a bigger gap (tab switch) is clamped. */
  MAX_DT: 0.05,
  /** Field in three.js world units: enemies spawn at spawnZ and walk +z toward wallZ.
   *  lanes = spawn x positions, halfWidth = how far sideways enemies may be pushed,
   *  laneClearDist = a lane is free when nobody is this close to its spawn point. */
  FIELD: { spawnZ: -30, wallZ: -4, lanes: [-6, -3, 0, 3, 6], halfWidth: 8, laneClearDist: 3 },
  /** Distance from the wall where the red danger ring shows (renderer reads this). */
  DANGER_DIST: 5,
  /** Collision radius per enemy type (push-apart). */
  ENEMY_RADIUS: { imp: 0.8, bird: 0.6, warlock: 0.8, boss: 1.6 },
  /** Birds fly at flyY and dive down to diveY over the last diveDist units before the wall. */
  BIRD_FLIGHT: { flyY: 4, diveY: 1.2, diveDist: 8 },
  /** Warlocks stop at this fraction of the way from spawn to the wall. */
  WARLOCK_STOP_FRACTION: 0.5,
  /** Spawn intervals in seconds per wave (Normal; multiplied by difficulty). 0 = none. */
  WAVES: [
    { imp: 3.5, bird: 0, warlock: 0 },
    { imp: 3.6, bird: 8, warlock: 0 },
    { imp: 3.6, bird: 8, warlock: 15 },
  ],
  /** After the boss arrives imps come every this many seconds. */
  AFTER_BOSS_IMP_S: 5,
  /** Delay before the first spawn of a newly enabled enemy type in a wave. */
  FIRST_SPAWN_DELAY_S: 0,
  /** All spawns pause this long when the boss arrives. */
  BOSS_SPAWN_PAUSE_S: 6,
  /** Two spawns never happen closer together than this (no bursts). */
  SPAWN_MIN_GAP_S: 0.8,
  /** Wave 1: this many imps in a row share one element before it changes. */
  WAVE1_SAME_ELEMENT: 3,
  /** Sideways nudge so two enemies lined up exactly still slide around each other. */
  PUSH_NUDGE: 0.05,

  // ---- Sound ----
  /** Master volume 0..1. */
  VOLUME: 0.6,

  // ---- Screens ----
  /** Hand check: each pose must be held this long to pass. */
  HAND_CHECK_HOLD_S: 0.6,
  /** Wait after the round ends before the end screen appears. */
  END_SCREEN_DELAY_S: 1.5,

  // ---- Overlay UI ----
  /** Each trail point fades out over this many ms. */
  TRAIL_FADE_MS: 600,
  /** Floating texts ("SUPER EFFECTIVE!", "+300") live this long and rise this many px. */
  FLOAT_TEXT_S: 1.2,
  FLOAT_TEXT_RISE_PX: 60,
  /** Red edge glow after a castle hit. */
  HIT_GLOW_S: 0.7,
  /** Banners ("WAVE 2", "BOSS INCOMING") stay this long. */
  BANNER_S: 2,

  // ---- Rendering ----
  /** Cap on devicePixelRatio; lower it if 3D stutters with tracking. */
  MAX_PIXEL_RATIO: 1.5,
  SHADOWS: false,
  /** Glow on emissive things. Turn off first if FPS drops (after shadows). */
  BLOOM: { enabled: true, strength: 0.9, radius: 0.55, threshold: 0.8 },
  /** First-person camera on the wall. back = metres behind the wall's front face (negative = leaning over). */
  CAMERA: { fov: 55, eyeHeight: 2.2, back: 1.8, lookAtY: 1.5, lookAtZ: -22, crenelHalfWidth: 1.35 },
};
