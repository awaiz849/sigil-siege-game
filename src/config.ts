// Every tunable number lives here. Change values here, never inline in code.

export type Difficulty = 'easy' | 'normal' | 'hard';

/** One real 3D model file (see GLB_MODELS). */
export type GlbModelConfig = {
  file: string;
  height: number;
  rotationY: number;
  tint: 'hue' | 'glow' | 'none';
  legs?: { hip: number; frontZ: number; backZ: number; legR: number; legX: number; swing: number; strides: number };
};

export const CONFIG = {
  // ---- Input ----
  /** "poses" = finger poses, "pinch" = thumb-index pinch fallback. */
  INPUT_MODE: 'pinch' as 'poses' | 'pinch',
  /** Frames a pose must be stable before it counts. */
  POSE_STABLE_FRAMES: 3,
  /** Pinch thresholds (thumb-index distance / hand size) and release delay. */
  PINCH_ON: 0.25,
  PINCH_OFF: 0.4,
  PINCH_RELEASE_MS: 100,
  /** METEOR throw gesture (input/throwDetector.ts): the hand must move across the camera view at
   *  >= speed hand-lengths per second for frames frames in a row (pen up). cooldownMs between throws,
   *  aimLookbackMs = aim where the cursor was this long before the throw fired,
   *  maxGapS = a longer gap between camera frames resets the measurement. */
  THROW: { speed: 8, frames: 2, cooldownMs: 800, aimLookbackMs: 200, maxGapS: 0.2 },
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
  /** In-game pause button: longer hover, so aiming near the corner never pauses by accident. */
  PAUSE_HOVER_S: 1.2,

  // ---- Recognizer ----
  RECOGNIZER_THRESHOLD: 0.8,
  /** PERFECT SIGIL: a shape drawn this cleanly (recognizer score >= minScore) earns bonus points and
   *  mana, but only when the spell actually does something (hit, kill, push or block). */
  PERFECT_SIGIL: { minScore: 0.92, bonus: 50, mana: 8 },
  /** Precheck: end-to-end distance / path length at or above this = line. */
  LINE_STRAIGHTNESS: 0.95,
  /** Precheck: end gap below this fraction of the bounding-box diagonal = closed shape. */
  CLOSED_GAP_RATIO: 0.25,

  // ---- Castle and scoring ----
  // Castle HP and wall damage depend on the difficulty: see DIFFICULTY below.
  ROUND_SECONDS: 90,
  WAVE_SECONDS: 30,
  KILL_SCORE: 100,
  MAX_COMBO: 5,
  CLEAN_WAVE_BONUS: 500,

  // ---- Spells ----
  /** Mana stops spell spam: every cast costs mana, mana refills over time (per difficulty, see
   *  DIFFICULTY.manaRegen). A SUPER EFFECTIVE hit refunds strongRefund, so the right element is cheap
   *  and spamming wrong ones runs dry. Not enough mana = "NO MANA", nothing happens (no combo penalty).
   *  The shield only costs mana when it actually blocks; a fizzle (shape not recognized) costs a little. */
  MANA: {
    max: 100,
    cost: { water: 20, fire: 20, nature: 20, lightning: 40, wind: 30, shield: 15 },
    strongRefund: 12,
    fizzle: 6,
  },
  /** METEOR ultimate (fast hand "throw"): the meter fills from kills and PERFECT SIGILs; when full,
   *  a throw drops a meteor on the monster nearest the aim point and damages everything within
   *  radius (world units). Meteor kills don't refill the meter. */
  METEOR: { meterMax: 100, perKill: 10, perPerfect: 10, damage: 3, radius: 6 },
  LIGHTNING_COOLDOWN_S: 10,
  SHIELD_STUN_S: 3,
  /** WIND (drawn line): pushes walking enemies this many units back, then a cooldown. */
  WIND_PUSH: 6,
  WIND_COOLDOWN_S: 12,
  DMG_BASE: 1,
  DMG_STRONG: 2,
  DMG_WEAK: 0.5,
  DMG_STUNNED: 2,

  // ---- Enemies (Normal difficulty) ----
  IMP: { hp: 2, speed: 2.3 },
  BIRD: { hp: 1, speed: 4.2 },
  WARLOCK: { hp: 3, speed: 1.8, chargeS: 3, blastDamage: 20, rechargeS: 4 },
  /** Boss: arrives at arriveS and is fast enough to reach the wall before the clock runs out.
   *  At the wall it smashes the gate every smashS seconds until it is killed. */
  BOSS: { hp: 8, speed: 1.8, arriveS: 65, elementSwapS: 5, swapWarningS: 1.5, smashS: 3 },

  // ---- Difficulty ----
  /** speed / spawnInterval = multipliers on the Normal numbers, maxEnemies = cap on the field,
   *  castleHp = castle hit points, manaRegen = mana refilled per second, wallDamage = damage when a monster reaches the wall
   *  (the boss deals it again every BOSS.smashS while it stands at the wall). */
  DIFFICULTY: {
    easy: { speed: 0.75, spawnInterval: 1.3, maxEnemies: 5, castleHp: 200, manaRegen: 16, wallDamage: { imp: 5, bird: 5, warlock: 10, boss: 20 } },
    normal: { speed: 1, spawnInterval: 1, maxEnemies: 7, castleHp: 150, manaRegen: 12, wallDamage: { imp: 10, bird: 10, warlock: 10, boss: 20 } },
    hard: { speed: 1.5, spawnInterval: 0.8, maxEnemies: 9, castleHp: 100, manaRegen: 10, wallDamage: { imp: 10, bird: 10, warlock: 10, boss: 20 } },
  } as Record<Difficulty, { speed: number; spawnInterval: number; maxEnemies: number; castleHp: number; manaRegen: number; wallDamage: Record<'imp' | 'bird' | 'warlock' | 'boss', number> }>,

  // ---- Game logic: field, spawning, crowd (src/game) ----
  /** Longest frame step the logic accepts (s); a bigger gap (tab switch) is clamped. */
  MAX_DT: 0.05,
  /** Field in three.js world units: enemies spawn at spawnZ and walk +z toward wallZ.
   *  lanes = spawn x positions, halfWidth = how far sideways enemies may be pushed,
   *  laneClearDist = a lane is free when nobody is this close to its spawn point. */
  FIELD: { spawnZ: -42, wallZ: -4, lanes: [-6, -3, 0, 3, 6], halfWidth: 8, laneClearDist: 3 },
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
  AFTER_BOSS_IMP_S: 4,
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
  /** Background music + night ambience volume (relative to VOLUME). 0 = off. */
  MUSIC_VOLUME: 0.45,
  /** Soft wind under the music (filtered noise). Kept low: loud, it sounds like a hiss in the menus. 0 = off. */
  MUSIC_WIND: 0.04,
  /** Voice callouts (browser speech synthesis, offline system voices): the spell name on every cast
   *  that works. pitch < 1 = deeper wizard voice. minGapMs stops it machine-gunning words. */
  VOICE: { enabled: true, volume: 1, rate: 1.15, pitch: 0.7, minGapMs: 250 },
  /** Music tempo per intensity level: 0 menu (calm), 1 wave 1, 2 wave 2, 3 wave 3, 4 boss. */
  MUSIC_BPM: [80, 92, 100, 108, 118],

  // ---- Screens ----
  /** Hand check: each pose must be held this long to pass. */
  HAND_CHECK_HOLD_S: 0.6,
  /** Wait after the round ends before the end screen appears. */
  END_SCREEN_DELAY_S: 5,
  /** Victory / defeat cinematic (render/ending.ts): seconds for the camera to swing out over the field. */
  ENDING: { cameraS: 2.2 },

  // ---- Overlay UI ----
  /** Live recognition while drawing (trail colour + particles, wizard's orb): classify the
   *  half-drawn stroke every everyMs once it has minPoints; show the element above minScore. */
  LIVE_SHAPE: { everyMs: 120, minPoints: 12, minScore: 0.84 },
  /** Each trail point fades out over this many ms. */
  TRAIL_FADE_MS: 600,
  /** Floating texts ("SUPER EFFECTIVE!", "+300") live this long and rise this many px. */
  FLOAT_TEXT_S: 1.2,
  FLOAT_TEXT_RISE_PX: 60,
  /** Red edge glow after a castle hit. */
  HIT_GLOW_S: 0.7,
  /** Kill feel: the game freezes this long on every kill (hit-stop), with a quick white flash. */
  HIT_STOP_MS: 50,
  KILL_FLASH_S: 0.12,
  /** Boss entrance: the game runs at `speed` for `seconds` (slow motion) while the ground shakes. */
  BOSS_ENTRANCE: { seconds: 1.6, speed: 0.35, shake: 0.7 },
  /** Banners ("WAVE 2", "BOSS INCOMING") stay this long. */
  BANNER_S: 2,

  // ---- Rendering ----
  /** Cap on devicePixelRatio; lower it if 3D stutters with tracking. */
  MAX_PIXEL_RATIO: 1.5,
  /** Anti-aliasing samples for the bloom path (0 = off; 4 = smooth edges). */
  MSAA_SAMPLES: 4,
  /** Flight time of a spell orb to its target (s). Short, so it still feels instant. */
  PROJECTILE_S: 0.16,
  /** Overlay (HUD) resolution cap: draws at the screen's real pixel density for crisp text. */
  OVERLAY_MAX_PIXEL_RATIO: 2,
  SHADOWS: false,
  /** Real 3D models (GLB). Put files in public/models/; a missing file falls back to the code-built model.
   *  height = how tall it stands in world units; rotationY = turn so it faces the wall (+z)
   *  (the wizard faces the field, -z). tint = how the element shows on the model:
   *  'hue' recolours the texture (fire models: flames turn blue / green), 'glow' adds an element glow.
   *  legs = horses: the four legs swing in a gallop (vertex shader), measured in the model's own units
   *  (height 1): hip height, z of the front / back leg pairs, leg radius in z, max |x| of a leg
   *  (keeps the boss's lance still), swing in radians, gallop speed in strides per second. */
  GLB_MODELS: {
    imp: { file: 'models/imp.glb', height: 3.2, rotationY: 0, tint: 'hue' },
    bird: {
      file: 'models/bird.glb', height: 2.8, rotationY: 0, tint: 'hue',
      legs: { hip: 0.33, frontZ: 0.32, backZ: -0.19, legR: 0.1, legX: 0.2, swing: 0.55, strides: 2.6 },
    },
    warlock: { file: 'models/warlock.glb', height: 3.0, rotationY: 0, tint: 'glow' },
    boss: {
      file: 'models/boss.glb', height: 5.6, rotationY: 0, tint: 'glow',
      legs: { hip: 0.22, frontZ: 0.15, backZ: -0.12, legR: 0.075, legX: 0.125, swing: 0.45, strides: 1.6 },
    },
    wizard: { file: 'models/wizard.glb', height: 2.3, rotationY: Math.PI, tint: 'none' },
  } as Record<'imp' | 'bird' | 'warlock' | 'boss' | 'wizard', GlbModelConfig>,
  /** Give GLB models toon shading so they match the comic look (false = keep their own PBR look). */
  GLB_TOON: true,
  /** 'hue' tint: degrees to turn the texture's colours per element (the textures are fire-coloured). */
  GLB_HUE_SHIFT: { fire: 0, water: 180, nature: 90 },
  /** 'glow' tint: strength of the element glow on the whole model. */
  GLB_GLOW: 0.16,
  /** Comic ink outlines (post-process): colour, line width in pixels, fade-out distance range. */
  INK: { enabled: true, color: 0x07050f, thickness: 1.2, fadeStart: 30, fadeEnd: 70 },
  /** Glow on emissive things. Turn off first if FPS drops (after shadows). */
  BLOOM: { enabled: true, strength: 0.9, radius: 0.55, threshold: 0.8, resolutionScale: 0.5 },
  /** Automatic quality: if FPS stays under minFps for `seconds`, step down
   *  (1 = bloom off, 2 = pixel ratio 1, 3 = pixel ratio 0.75). The D overlay shows the level. */
  AUTO_QUALITY: { enabled: true, minFps: 45, seconds: 2.5 },
  /** Soft mist sprites over the field (big transparent sprites cost fill rate). */
  MIST_SPRITES: 8,
  /** Scenery per wave (render only; colours in render/themes.ts). byWave = theme for waves 1, 2, 3:
   *    valley   wave 1: the sunset valley from the concept art
   *    frost    wave 2: a snowy mountain pass in cold daylight, frozen river, falling snow
   *    inferno  wave 3: a volcanic wasteland at night, lava river, blood moon, rising embers
   *  When a wave starts the scene fades to its theme over fadeS seconds; a new round (or the menu)
   *  fades back to the valley. light = per theme: sky fill, key light (from behind the castle),
   *  rim light (behind the monsters), fog density. Raise ambient/key if the screen is too dark.
   *  snow / embers = weather particle counts (only drawn while their theme shows). */
  WAVE_SCENERY: {
    byWave: ['valley', 'frost', 'inferno'] as const,
    fadeS: 4,
    light: {
      valley: { ambient: 1.3, key: 2.0, rim: 2.2, fog: 0.0052 },
      frost: { ambient: 0.95, key: 1.35, rim: 1.4, fog: 0.0055 },
      inferno: { ambient: 1.2, key: 1.6, rim: 2.6, fog: 0.011 },
    },
    snow: 700,
    embers: 260,
  },
  /** The sunset valley around the field (render only, world units; the field runs from z -4 to -42).
   *  sun = where the sun sits, far behind the mountains (the sky glow and the orange rim light follow it).
   *  river = points (x, z) the river flows through, from the waterfalls by the castle to the right edge.
   *  bridgeZ / bridgeX = the long stone arch bridge across the valley, behind the rift.
   *  castle = the castle on a cliff, far away on the right. siegeTowers = wooden enemy towers (x, z).
   *  fenceZ = the road fences run between these z values. */
  SCENERY: {
    sun: { x: -110, y: 26, z: -330 },
    river: [[62, -186], [50, -162], [38, -136], [29, -113], [25, -92], [28, -74], [23, -56], [26, -38], [32, -22], [42, -8], [62, 4]] as Array<[number, number]>,
    riverWidth: 4.5,
    bridgeZ: -104,
    bridgeX: [-62, 48] as [number, number],
    castle: { x: 84, z: -196 },
    siegeTowers: [[-17, -22], [16, -31], [-20, -50], [17, -61]] as Array<[number, number]>,
    fenceZ: [-9, -44] as [number, number],
  },
  /** Castle towers: sideways distance from the centre and how far they stick out from the wall
   *  (they frame the screen edges). riftScale = size of the monster rift at the end of the road. */
  LANDMARKS: { towerX: 10, towerForward: 4.5, riftScale: 0.7 },
  /** Third-person camera behind and above the wizard (CoC-style).
   *  height / back = camera position above the walkway and behind the wall's front face;
   *  x = sideways offset (over the shoulder). wizardX/wizardBack = where the wizard stands. */
  CAMERA: { fov: 60, height: 6.2, back: 6.5, x: 0.6, lookAtY: 4.5, lookAtZ: -18, wizardX: -0.7, wizardBack: 1.1, crenelHalfWidth: 1.35 },
};
