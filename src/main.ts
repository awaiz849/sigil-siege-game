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
import { playCast, playEvents } from './audio/sound.ts';
import { setMusicIntensity, updateMusic } from './audio/music.ts';
import { callout } from './audio/voice.ts';
import { createMouseInput } from './input/mouseInput.ts';
import { createHandInput, type HandInput } from './input/handInput.ts';
import { onPalm, onStrokeEnd, onStrokePoint, onStrokeStart } from './events.ts';
import { classify } from './recognizer/index.ts';
import { createRecorder } from './recognizer/recorder.ts';
import type { GameEvent, World } from './game/types.ts';
import { createWorld, startRound, takeEvents, update } from './game/world.ts';
import { castShield, castSpell, type SpellResult } from './game/spells.ts';
import { formatRoundLog, noteStrokeStart } from './game/roundLog.ts';

const glCanvas = document.createElement('canvas');
const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'overlay';
const vignette = document.createElement('div');
vignette.id = 'vignette';
document.body.append(glCanvas, vignette, overlayCanvas);

const world3d = createScene(glCanvas);
// Real 3D model files (public/models/*.glb) load during the menus; missing ones fall back to code-built models.
preloadGlbModels();
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

createHandInput()
  .then((h) => {
    hand = h;
    camera = 'ready';
    setMouseMode(false);
    overlay.flash('Hand tracking ready', 1.5);
  })
  .catch((err) => {
    // No camera (or it was refused): MOUSE DEBUG MODE, clearly labelled.
    console.warn('Hand input unavailable, using mouse debug mode', err);
    camera = 'failed';
    setMouseMode(true);
    overlay.flash('No camera found', 2);
  });

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
function newRound(difficulty: Difficulty) {
  world = startRound(createWorld(difficulty));
}

// Dev only (npm run dev): window.sigil.world() in the browser console gives the live World,
// e.g. sigil.world().castleHp = 30 to see the castle burn, or .time = 58 to jump to wave 3.
if (import.meta.env.DEV) Object.assign(window, { sigil: { world: () => world } });

// Screens: hand check -> title -> (game) -> end. All hands-free.
const screens = createScreens({
  hand: () => hand,
  mouseMode: () => mouse.isEnabled(),
  camera: () => camera,
  onStart: newRound,
  playing: () => world.phase === 'PLAYING',
  onRestart: () => newRound(world.difficulty),
  // Leave the round: an empty world in the menu (the 3D scene clears its monsters).
  onExit: () => {
    world = createWorld(world.difficulty);
    setMusicIntensity(0);
  },
});

// ---- Casting: stroke -> recognizer -> spell on the enemy nearest the stroke centre ----
const view = { project: world3d.project, projectPoint: world3d.projectPoint };
const SPELL_COLOR: Record<string, number> = { water: 0x3fa9ff, fire: 0xff5a2e, nature: 0x6fe05a, lightning: 0xcfe6ff };

// Pen down: start the pen-down -> cast timer for the tuning log.
onStrokeStart(() => noteStrokeStart(world));

// Live recognition while drawing: a few times a second the half-drawn stroke is classified;
// once it is clearly a shape, the trail takes on that element (colour + particles) and the
// wizard's orb glows in it.
const SHAPE_SPELL: Record<string, string> = { C: 'water', L: 'fire', v: 'nature', zigzag: 'lightning', line: 'wind' };
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
  const guess = classify(livePoints);
  const spell = guess.name && guess.score >= CONFIG.LIVE_SHAPE.minScore ? SHAPE_SPELL[guess.name] : null;
  overlay.trail.setSpell(spell);
  if (spell) world3d.wizardElement(SPELL_COLOR[spell] ?? null);
});

// Every finished stroke: recorder first (if armed), otherwise recognize it and cast.
onStrokeEnd((points) => {
  if (recorder.consume(points)) return;
  const shape = classify(points);
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
      const burst = () => world3d.impact(result.spell!, hit.pos, hit.enemyId, hit.effect === 'strong');
      // Element spells fly as an orb from the sigil to the target; lightning strikes at once.
      if (from && result.spell !== 'lightning') world3d.castProjectile(hit.pos, hit.enemyId, color, burst);
      else burst();
    }
  }
  if (color !== undefined && result.kind !== 'fizzle' && result.kind !== 'cooldown' && result.kind !== 'nomana') world3d.wizardCast(color);
  if (result.spell === 'lightning' && result.hits.length > 0) world3d.lightningFlash();
  overlay.worldUi.handleCast(result, view, performance.now());
  playCast(result);
  // The wizard shouts the spell's name when it works.
  if (result.spell && ['hit', 'kill', 'push', 'block'].includes(result.kind)) callout(result.spell[0].toUpperCase() + result.spell.slice(1) + '!');
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
function frame(now: number) {
  // Never 0: update() treats time 0 as "round just started".
  const realDt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 1 / 60;
  const dt = now < slowMoUntil ? realDt * CONFIG.BOSS_ENTRANCE.speed : realDt;
  lastNow = now;
  hand?.update();
  screens.update(now);
  updateMusic();
  // Paused, or a kill's hit-stop: the round and the 3D scene freeze (time stands still).
  const frozen = screens.current === 'pause' || now < hitStopUntil;
  if (!frozen) update(world, dt);
  handleEvents(takeEvents(world));
  world3d.render(world, frozen ? 0 : dt);
  // HUD (+ pause button) only during a round; menus draw over the live 3D scene.
  overlay.draw(
    world.phase === 'MENU' || screens.current ? null : world,
    view,
    now,
    screens.current ? (ctx) => screens.draw(ctx, now) : (ctx) => screens.drawGameButtons(ctx),
  );
  debugOverlay.tick(now);
  // Live camera in the corner during play (the debug overlay has its own bigger one).
  if (hand && !screens.current && !debugOverlay.isVisible()) cameraCorner.draw(overlay.ctx, hand);
  debugOverlay.draw(overlay.ctx, hand, world3d.quality);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
