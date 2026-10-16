// Entry point: creates the two canvases (3D below, 2D overlay on top) and runs the frame loop.
// Pipeline: input (hand or mouse) -> recognizer -> castSpell with the renderer's project()
//           -> update(world) -> render(world) -> overlay (HUD, badges, texts).
import { type Difficulty } from './config.ts';
import { createScene } from './render/scene.ts';
import { createOverlay } from './ui/overlay.ts';
import { createDebugOverlay } from './ui/debugOverlay.ts';
import { loadFonts, FONT_TITLE } from './ui/fonts.ts';
import { createMouseInput } from './input/mouseInput.ts';
import { createHandInput, type HandInput } from './input/handInput.ts';
import { createPalmHold } from './input/palmHold.ts';
import { onPalm, onStrokeEnd, onStrokeStart } from './events.ts';
import { classify } from './recognizer/index.ts';
import { createRecorder } from './recognizer/recorder.ts';
import type { GameEvent, World } from './game/types.ts';
import { createWorld, startRound, takeEvents, update } from './game/world.ts';
import { castShield, castSpell, type SpellResult } from './game/spells.ts';
import { formatRoundLog, noteStrokeStart } from './game/roundLog.ts';

const glCanvas = document.createElement('canvas');
const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'overlay';
document.body.append(glCanvas, overlayCanvas);

const world3d = createScene(glCanvas);
const overlay = createOverlay(overlayCanvas);
const debugOverlay = createDebugOverlay();
loadFonts().catch((err) => console.warn('Fonts failed to load', err));

// ---- Game ----
// Difficulty comes from the URL until the title screen exists (?difficulty=easy|normal|hard).
const urlDifficulty = new URLSearchParams(location.search).get('difficulty');
const difficulty: Difficulty = urlDifficulty === 'easy' || urlDifficulty === 'hard' ? urlDifficulty : 'normal';
let world: World = createWorld(difficulty);

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

function setMouseMode(on: boolean) {
  mouse.setEnabled(on);
  hand?.setEnabled(!on);
  overlay.setMouseDebug(on);
}

overlay.flash('Starting camera...', 30);
createHandInput()
  .then((h) => {
    hand = h;
    setMouseMode(false);
    overlay.flash('Hand tracking ready', 1.5);
  })
  .catch((err) => {
    // No camera (or it was refused): MOUSE DEBUG MODE, clearly labelled.
    console.warn('Hand input unavailable, using mouse debug mode', err);
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

/** Leave the menu / end banner: a fresh round. */
function newRound() {
  world = startRound(createWorld(difficulty));
}

// ---- Casting: stroke -> recognizer -> spell on the enemy nearest the stroke centre ----
const view = { project: world3d.project, projectPoint: world3d.projectPoint };
const SPELL_COLOR: Record<string, number> = { water: 0x3fa9ff, fire: 0xff5a2e, nature: 0x6fe05a, lightning: 0xcfe6ff };

// Pen down: start the pen-down -> cast timer for the tuning log.
onStrokeStart(() => noteStrokeStart(world));

// Every finished stroke: recorder first (if armed), otherwise recognize it and cast.
onStrokeEnd((points) => {
  if (recorder.consume(points)) return;
  const shape = classify(points);
  const centre = overlay.worldUi.strokeCentre(points)!;
  if (debugOverlay.isVisible()) overlay.showDebugLabel(`${shape.name ?? 'no match'} ${shape.score.toFixed(2)}`, centre.x, centre.y);
  // Mouse debug: a stroke also starts the round (right button = palm works too).
  if (world.phase !== 'PLAYING') {
    if (mouse.isEnabled()) newRound();
    return;
  }
  showCast(castSpell(world, shape.name, centre, world3d.project));
});

// Open palm = shield, instantly.
onPalm(() => {
  if (world.phase === 'PLAYING') showCast(castShield(world));
});

// Hold the open palm 1.2 s to start / play again (outside a round only).
const palmHold = createPalmHold(() => {
  if (world.phase !== 'PLAYING') newRound();
});

/** 3D + overlay feedback for a cast (texts arrive separately, as game events). */
function showCast(result: SpellResult) {
  const color = result.spell ? SPELL_COLOR[result.spell] : undefined;
  if (color !== undefined) {
    for (const hit of result.hits) world3d.burstAt(hit.pos, hit.enemyId, color, hit.effect === 'strong' ? 40 : 20);
  }
  overlay.worldUi.handleCast(result, view, performance.now());
}

/** Game events: camera shake on castle hits, round log at game over; the overlay shows the rest. */
function handleEvents(events: GameEvent[]) {
  for (const ev of events) {
    if (ev.type === 'castleHit') world3d.shake(ev.cause === 'blast' ? 0.9 : 0.6);
    else if (ev.type === 'gameOver') saveRoundLog(formatRoundLog(world));
  }
  overlay.worldUi.handleEvents(events, performance.now());
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

/** Temporary start / end prompt until the title and end screens (F3) exist. */
function drawTempPrompt(ctx: CanvasRenderingContext2D) {
  if (world.phase === 'PLAYING') return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const title = world.phase === 'WIN' ? 'VICTORY!' : world.phase === 'LOSE' ? 'THE WALL FELL' : 'SIGIL SIEGE';
  const sub = mouse.isEnabled() ? 'Hold right mouse button (or draw) to start' : 'Hold your open palm to start';
  ctx.save();
  ctx.fillStyle = 'rgba(13, 11, 36, 0.55)';
  ctx.fillRect(0, h * 0.32, w, h * 0.3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 56px ${FONT_TITLE}`;
  ctx.fillStyle = '#F2C14E';
  ctx.fillText(title, w / 2, h * 0.42);
  ctx.font = `20px ${FONT_TITLE}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${sub}  (${difficulty.toUpperCase()})`, w / 2, h * 0.52);
  // Palm-hold progress ring.
  if (palmHold.progress > 0) {
    ctx.strokeStyle = '#9fe6ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.58, 16, -Math.PI / 2, -Math.PI / 2 + palmHold.progress * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

let lastNow = 0;
function frame(now: number) {
  // Never 0: update() treats time 0 as "round just started".
  const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 1 / 60;
  lastNow = now;
  hand?.update();
  palmHold.update(now);
  update(world, dt);
  handleEvents(takeEvents(world));
  world3d.render(world, dt);
  overlay.draw(world, view, now);
  drawTempPrompt(overlay.ctx);
  debugOverlay.tick(now);
  debugOverlay.draw(overlay.ctx, hand);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
