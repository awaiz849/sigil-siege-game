// Entry point: creates the two canvases (3D below, 2D overlay on top) and runs the frame loop.
// Pipeline: input (hand or mouse) -> recognizer -> castSpell with the renderer's project()
//           -> update(world) -> render(world) -> overlay (HUD, badges, texts).
import { CONFIG, type Difficulty } from './config.ts';
import { createScene } from './render/scene.ts';
import { preloadGlbModels } from './render/glbModels.ts';
import { createOverlay } from './ui/overlay.ts';
import { createDebugOverlay } from './ui/debugOverlay.ts';
import { createCameraCorner } from './ui/cameraCorner.ts';
import { loadFonts } from './ui/fonts.ts';
import { createScreens, type CameraState } from './ui/screens.ts';
import { playCast, playEvents, setAudioPaused, sound } from './audio/sound.ts';
import { setMusicIntensity, updateMusic } from './audio/music.ts';
import { callout } from './audio/voice.ts';
import { createMouseInput } from './input/mouseInput.ts';
import { createHandInput, prepareTracker, TrackerLoadError, type HandInput } from './input/handInput.ts';
import { CAMERA_MESSAGES, cameraProblem, simulate } from './ui/compat.ts';
import { hideNotice, reloadAction, setNoticeText, showNotice } from './ui/notice.ts';
import { downloadHandAssets } from './input/handAssets.ts';
import { createLoadingScreen } from './ui/loadingScreen.ts';
import { createTrackingIndicator } from './ui/trackingIndicator.ts';
import { onPalm, onStrokeEnd, onStrokePoint, onStrokeStart, onThrow } from './events.ts';
import { classify } from './recognizer/index.ts';
import { createRecorder } from './recognizer/recorder.ts';
import type { GameEvent, Hero, World } from './game/types.ts';
import { createWorld, startRound, takeEvents, update } from './game/world.ts';
import { castMeteor, castShield, castSpell, HERO_SPELLS, pickTarget, type SpellResult } from './game/spells.ts';
import { formatRoundLog, noteStrokeStart } from './game/roundLog.ts';

const glCanvas = document.createElement('canvas');
const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'overlay';
const vignette = document.createElement('div');
vignette.id = 'vignette';
document.body.append(glCanvas, vignette, overlayCanvas);

// Loading screen (index.html, visible from the first paint): real download progress of the 3D models;
// it hides as soon as the scene is ready, so the title shows early. MediaPipe (wasm + hand model)
// starts downloading now too, in parallel, but only feeds the small corner indicator.
const loading = createLoadingScreen();
const trackingStatus = createTrackingIndicator();
const handAssets = downloadHandAssets(trackingStatus);
// Hand tracking loads and warms up in the BACKGROUND (corner indicator); the title does not wait.
trackingStatus.expect('warmup', 'warming up', CONFIG.LOADING.expectedBytes.warmUp);
const handTracker = handAssets.then(prepareTracker);
handTracker.then(
  () => {
    trackingStatus.complete('warmup');
    trackingStatus.ready();
    performance.mark('sigil:tracking-ready');
  },
  (err) => {
    console.warn('Hand tracking unavailable', err);
    trackingStatus.failed();
  },
);

const world3d = createScene(glCanvas);
// Real 3D model files (public/models/*.glb); missing ones fall back to code-built models.
for (const cfg of Object.values(CONFIG.GLB_MODELS)) loading.expect(cfg.file, '3D models', CONFIG.LOADING.expectedBytes.glbModel);
const models = preloadGlbModels(
  (file, loaded, total) => loading.progress(file, loaded, total),
  (file) => loading.complete(file),
);
// The title shows as soon as the 3D scene and its models are ready.
models.finally(() => {
  loading.hide();
  performance.mark('sigil:title-ready');
});
const overlay = createOverlay(overlayCanvas);
const debugOverlay = createDebugOverlay();
const cameraCorner = createCameraCorner();
loadFonts().catch((err) => console.warn('Fonts failed to load', err));

// ---- Game ----
// The world waits in MENU until the title screen starts a round.
let world: World = createWorld('normal');

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  world3d.resize(w, h);
  // Overlay uses CSS pixels so stroke points match the screen 1:1.
  overlay.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---- Input: hand tracking, or the mouse as a debug fallback ----
const mouse = createMouseInput();
let hand: HandInput | null = null;
let camera: CameraState = 'loading';

function setMouseMode(on: boolean) {
  mouse.setEnabled(on);
  hand?.setEnabled(!on);
  overlay.setMouseDebug(on);
}

// "Play with the mouse instead": the clearly labelled MOUSE DEBUG MODE, offered on camera problems.
const mouseAction = (id: string) => ({
  label: 'Play with the mouse instead',
  onClick: () => {
    hideNotice(id);
    camera = 'failed';
    setMouseMode(true);
  },
});

/** Camera + hand tracker -> hand input. Every failure ends in a friendly message that says what to do. */
function connectHands(tracker: Promise<Awaited<typeof handTracker>>) {
  createHandInput(tracker)
    .then((h) => {
      hand = h;
      camera = 'ready';
      setMouseMode(false);
      hideNotice('tracker');
      overlay.flash('Hand tracking ready', 1.5);
    })
    .catch(async (err) => {
      console.warn('Hand input unavailable', err);
      // Dev simulation of a lost hand needs a round to run: just use the mouse.
      if (simulate === 'hand-lost') return mouseAction('none').onClick();
      // MediaPipe failed (download or start-up)? That comes first: Retry fixes it without a reload.
      const trackerOk = await tracker.then(() => true, () => false);
      if (err instanceof TrackerLoadError || !trackerOk) {
        showNotice({
          id: 'tracker',
          title: 'Hand tracking failed to load',
          body: 'The hand-tracking files (MediaPipe) could not be downloaded or started.',
          hint: 'Check your internet connection and press Retry.',
          actions: [{ label: 'Retry', primary: true, onClick: retryHands }, { ...reloadAction('Reload page'), primary: false }],
        });
        return;
      }
      const msg = CAMERA_MESSAGES[cameraProblem(err)];
      showNotice({ id: 'camera', title: msg.title, body: msg.body, hint: msg.hint, actions: [reloadAction(), mouseAction('camera')] });
    });
}

/** Retry: download MediaPipe again (showing the percentage), rebuild the tracker, reconnect the camera. */
function retryHands() {
  showNotice({ id: 'tracker', title: 'Retrying...', body: 'Downloading hand tracking... 0%' });
  const parts = new Map<string, { loaded: number; total: number }>();
  const progress = () => {
    let l = 0;
    let t = 0;
    for (const p of parts.values()) {
      l += Math.min(p.loaded, p.total);
      t += p.total;
    }
    setNoticeText('tracker', `Downloading hand tracking... ${t ? Math.floor((l / t) * 100) : 0}%`);
  };
  const tracker = downloadHandAssets({
    expect: (key, _label, bytes) => parts.set(key, { loaded: 0, total: bytes }),
    progress: (key, loaded, total) => {
      const p = parts.get(key);
      if (p) Object.assign(p, { loaded, total: total || p.total });
      progress();
    },
    complete: (key) => {
      const p = parts.get(key);
      if (p) p.loaded = p.total;
      progress();
    },
  }).then(prepareTracker);
  connectHands(tracker);
}

connectHands(handTracker);

// Template recorder (debug). Its messages show on the overlay.
const recorder = createRecorder((msg) => {
  overlay.flash(msg, 2);
  overlay.setRecordedCount(recorder.count());
});
overlay.setRecordedCount(recorder.count());

// Debug keys only (never needed during real gameplay).
// M = toggle mouse input, D = debug overlay, R = record template, Shift+R = delete recorded templates.
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') setMouseMode(!mouse.isEnabled());
  if (e.key === 'd' || e.key === 'D') debugOverlay.toggle();
  if (e.key === 'R') recorder.clear();
  else if (e.key === 'r') recorder.arm();
});

/** Start a fresh round (from the title or end screen). */
function newRound(difficulty: Difficulty, hero: Hero = world.hero) {
  world = startRound(createWorld(difficulty, Date.now(), hero));
  world3d.setHero(hero);
}

// Dev only (npm run dev): window.sigil.world() in the browser console gives the live World,
// e.g. sigil.world().castleHp = 30 to see the castle burn, or .time = 58 to jump to wave 3.
// Memory checks (dev only): sigil.frame(now) runs one frame by hand (a hidden browser runs none),
// sigil.memory() reads three.js's live GPU resources and the JS heap.
if (import.meta.env.DEV) {
  Object.assign(window, {
    sigil: {
      world: () => world,
      frames: () => frameCount,
      // One frame by hand; the extra animation frame it schedules is cancelled again, so the
      // normal loop keeps running as a single loop.
      frame: (now: number) => {
        const before = rafId;
        frame(now);
        cancelAnimationFrame(rafId);
        rafId = before;
      },
      screen: () => screens.current,
      memory: () => ({
        geometries: world3d.renderer.info.memory.geometries,
        textures: world3d.renderer.info.memory.textures,
        programs: world3d.renderer.info.programs?.length ?? 0,
        sceneObjects: (() => { let n = 0; world3d.scene.traverse(() => n++); return n; })(),
        heapMB: Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576),
      }),
    },
  });
}

// Screens: hand check -> title -> (game) -> end. All hands-free.
const screens = createScreens({
  hand: () => hand,
  mouseMode: () => mouse.isEnabled(),
  camera: () => camera,
  onStart: newRound,
  onHero: (hero) => {
    world = createWorld(world.difficulty, Date.now(), hero); // still in the menu
    world3d.setHero(hero);
  },
  playing: () => world.phase === 'PLAYING',
  onRestart: () => newRound(world.difficulty),
  // Leave the round: an empty world in the menu (the 3D scene clears its monsters).
  onExit: () => {
    world = createWorld(world.difficulty, Date.now(), world.hero);
    setMusicIntensity(0);
  },
});

// ---- Casting: stroke -> recognizer -> spell on the enemy nearest the stroke centre ----
const view = { project: world3d.project, projectPoint: world3d.projectPoint };
const SPELL_COLOR: Record<string, number> = {
  water: 0x3fa9ff, fire: 0xff5a2e, nature: 0x6fe05a, lightning: 0xcfe6ff,
  frost: 0x9fe0ff, flame: 0xff6a2a, thorn: 0x6fe05a, arcane: 0xc9a0ff,
};
/** The Grand Warden's spells reuse the matching element's impact, trail particles and sounds. */
const LOOKS_LIKE: Record<string, string> = { frost: 'water', flame: 'fire', thorn: 'nature', arcane: 'lightning', timewarp: 'wind', tome: 'shield' };

// Pen down: start the pen-down -> cast timer for the tuning log.
onStrokeStart(() => noteStrokeStart(world));

// Live recognition while drawing: a few times a second the half-drawn stroke is classified;
// once it is clearly a shape, the trail takes on that element (colour + particles) and the
// wizard's orb glows in it.
let livePoints: Array<{ x: number; y: number }> = [];
let liveAt = 0;
onStrokeStart(() => {
  livePoints = [];
  overlay.trail.setSpell(null);
});
onStrokePoint((x, y) => {
  livePoints.push({ x, y });
  const now = performance.now();
  if (livePoints.length < CONFIG.LIVE_SHAPE.minPoints || now - liveAt < CONFIG.LIVE_SHAPE.everyMs) return;
  liveAt = now;
  const guess = classify(livePoints, world.hero);
  const spell = guess.name && guess.score >= CONFIG.LIVE_SHAPE.minScore ? HERO_SPELLS[world.hero][guess.name] ?? null : null;
  overlay.trail.setSpell(spell ? LOOKS_LIKE[spell] ?? spell : null);
  if (spell) world3d.wizardElement(SPELL_COLOR[spell] ?? null);
});

// Every finished stroke: recorder first (if armed), otherwise recognize it and cast.
onStrokeEnd((points) => {
  if (recorder.consume(points)) return;
  const shape = classify(points, world.hero);
  const centre = overlay.worldUi.strokeCentre(points)!;
  if (debugOverlay.isVisible()) overlay.showDebugLabel(`${shape.name ?? 'no match'} ${shape.score.toFixed(2)}`, centre.x, centre.y);
  if (screens.current === 'tutorial') return screens.tutorialStroke(shape.name); // practice the shapes
  if (world.phase !== 'PLAYING' || screens.current) return; // other menus: strokes do nothing
  // shape.score = how cleanly it was drawn: a very clean shape earns the PERFECT SIGIL bonus.
  const result = castSpell(world, shape.name, centre, world3d.project, shape.score);
  overlay.worldUi.burnStroke(result, performance.now());
  showCast(result, centre);
});

// Open palm = shield, instantly.
onPalm(() => {
  if (screens.current === 'tutorial') screens.tutorialPalm();
  if (world.phase === 'PLAYING' && !screens.current) showCast(castShield(world));
});

// METEOR ultimate: a fast hand flick or both palms pushed forward (mouse: middle button).
// Meter not full = "METEOR 60%". Full = a meteor falls on the monster nearest the aim point and
// the blast damage happens when it lands.
let meteorFalling = false;
onThrow((x, y) => {
  if (world.phase !== 'PLAYING' || screens.current || meteorFalling) return;
  const aim = { x, y };
  if (world.ultimate < CONFIG.METEOR.meterMax) {
    showCast(castMeteor(world, aim, world3d.project)); // just the "charging" text
    return;
  }
  const id = pickTarget(world, aim, world3d.project);
  const target = world.enemies.find((e) => e.id === id);
  if (!target) return;
  meteorFalling = true;
  sound.meteorWhoosh();
  world3d.wizardCast(0xff7a30);
  world3d.meteor(target.pos, () => {
    meteorFalling = false;
    sound.meteorBoom();
    // Aim where the target is now (it kept walking while the meteor fell).
    const now = world.enemies.find((e) => e.id === id);
    const r = castMeteor(world, (now && world3d.project(now)) || aim, world3d.project);
    showCast(r);
  });
});

/** Hit-stop: the game freezes until this time (ms) after a kill, so kills feel heavy. */
let hitStopUntil = 0;

/** 3D + overlay feedback for a cast (texts arrive separately, as game events). */
function showCast(result: SpellResult, from?: { x: number; y: number }) {
  if (result.kind === 'kill') {
    hitStopUntil = performance.now() + CONFIG.HIT_STOP_MS;
    world3d.shake(0.25);
  }
  const color = result.spell ? SPELL_COLOR[result.spell] : undefined;
  if (color !== undefined) {
    for (const hit of result.hits) {
      const burst = () => world3d.impact(LOOKS_LIKE[result.spell!] ?? result.spell!, hit.pos, hit.enemyId, hit.effect === 'strong');
      // Element spells fly as an orb from the sigil to the target; lightning strikes at once.
      if (from && result.spell !== 'lightning') world3d.castProjectile(hit.pos, hit.enemyId, color, burst);
      else burst();
    }
  }
  if (color !== undefined && result.kind !== 'fizzle' && result.kind !== 'cooldown' && result.kind !== 'nomana') world3d.wizardCast(color);
  if (result.spell === 'lightning' && result.hits.length > 0) world3d.lightningFlash();
  overlay.worldUi.handleCast(result, view, performance.now());
  playCast(result);
  // The wizard shouts the spell's name when it works ("Tidal Wave!", names in CONFIG.VOICE.names).
  if (result.spell && ['hit', 'kill', 'push', 'block'].includes(result.kind)) {
    callout(CONFIG.VOICE.names[result.spell] ?? result.spell[0].toUpperCase() + result.spell.slice(1) + '!');
  }
}

/** Game events: camera shake on castle hits, round log at game over; the overlay shows the rest. */
function handleEvents(events: GameEvent[]) {
  for (const ev of events) {
    if (ev.type === 'castleHit') world3d.shake(ev.cause === 'blast' ? 0.9 : 0.6);
    else if (ev.type === 'waveStart') setMusicIntensity(ev.wave);
    else if (ev.type === 'bossArrive') {
      setMusicIntensity(4);
      // Boss entrance: brief slow motion + a big ground shake.
      slowMoUntil = performance.now() + CONFIG.BOSS_ENTRANCE.seconds * 1000;
      world3d.shake(CONFIG.BOSS_ENTRANCE.shake);
    }
    else if (ev.type === 'gameOver') {
      setMusicIntensity(0);
      saveRoundLog(formatRoundLog(world));
      const ended = world;
      setTimeout(() => screens.show('end', ended), CONFIG.END_SCREEN_DELAY_S * 1000);
    }
  }
  overlay.worldUi.handleEvents(events, performance.now());
  playEvents(events);
}

/** A3 tuning: print the round log, keep the last 20 in localStorage ("sigil-siege-round-logs"),
 *  and under `npm run dev` also append it to logs/round-logs.txt (see vite.config.ts). */
function saveRoundLog(report: string) {
  console.log(report);
  const entry = `${new Date().toISOString()}
${report}`;
  if (import.meta.env.DEV) fetch('/__round-log', { method: 'POST', body: entry }).catch(() => {});
  try {
    const key = 'sigil-siege-round-logs';
    const logs: string[] = JSON.parse(localStorage.getItem(key) ?? '[]');
    logs.push(entry);
    localStorage.setItem(key, JSON.stringify(logs.slice(-20)));
  } catch {
    // Storage blocked: the console copy is enough.
  }
}

let lastNow = 0;
let slowMoUntil = 0; // boss entrance slow motion ends at this time (ms)
let frameCount = 0;
let rafId = 0;

// Hidden tab: stop the frame loop (and with it hand detection, which also skips hidden tabs) and
// silence the audio; the round itself is already paused by the pause screen (screens.ts).
// Coming back: restart the loop with a normal first frame (no time jump) and resume the audio.
// The camera stream stays open, so there is no new permission prompt or camera restart.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
    setAudioPaused(true);
    console.info('Tab hidden: frame loop, hand detection and audio paused');
  } else {
    cancelAnimationFrame(rafId); // never two loops
    lastNow = 0;
    setAudioPaused(false);
    rafId = requestAnimationFrame(frame);
    console.info('Tab visible: resumed');
  }
});

/** Last time the hand was seen during a round (for the hand-lost auto-pause). */
let handSeenAt = 0;

function frame(now: number) {
  frameCount++;
  if (simulate === 'crash' && frameCount === 5) throw new Error('Simulated crash (dev only)');
  // Never 0: update() treats time 0 as "round just started".
  const realDt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 1 / 60;
  const dt = now < slowMoUntil ? realDt * CONFIG.BOSS_ENTRANCE.speed : realDt;
  lastNow = now;
  hand?.update();
  screens.update(now);
  // Hand out of view for HAND_LOST.pauseAfterS during a round -> auto-pause until it is back.
  const tracking = (camera === 'ready' && !mouse.isEnabled()) || simulate === 'hand-lost';
  const handVisible = simulate !== 'hand-lost' && !!hand?.debug.handVisible;
  if (tracking && world.phase === 'PLAYING' && !screens.current) {
    if (handVisible) handSeenAt = now;
    else if (now - handSeenAt > CONFIG.HAND_LOST.pauseAfterS * 1000) screens.pauseForHand();
  } else handSeenAt = now;
  updateMusic();
  // Paused, or a kill's hit-stop: the round and the 3D scene freeze (time stands still).
  const frozen = screens.current === 'pause' || now < hitStopUntil;
  if (!frozen) update(world, dt);
  handleEvents(takeEvents(world));
  world3d.render(world, frozen ? 0 : dt);
  // HUD (+ pause button) only during a round; menus draw over the live 3D scene.
  overlay.draw(
    world.phase !== 'PLAYING' || screens.current ? null : world, // no HUD in menus or the end cinematic
    view,
    now,
    screens.current ? (ctx) => screens.draw(ctx, now) : (ctx) => screens.drawGameButtons(ctx),
  );
  debugOverlay.tick(now);
  // Live camera in the corner during play (the debug overlay has its own bigger one).
  if (hand && !screens.current && !debugOverlay.isVisible()) cameraCorner.draw(overlay.ctx, hand);
  debugOverlay.draw(overlay.ctx, hand, world3d.quality);
  rafId = requestAnimationFrame(frame);
}
rafId = requestAnimationFrame(frame);
