// Entry point: creates the two canvases (3D below, 2D overlay on top) and runs the frame loop.
import { CONFIG, type Difficulty } from './config.ts';
import { createScene } from './render/scene.ts';
import { createOverlay } from './ui/overlay.ts';
import { createDebugOverlay } from './ui/debugOverlay.ts';
import { createMouseInput } from './input/mouseInput.ts';
import { createHandInput, type HandInput } from './input/handInput.ts';
import { onCursor, onPalm, onStrokeEnd, onStrokeStart, type Point, type Pose } from './events.ts';
import { classify } from './recognizer/index.ts';
import { createRecorder } from './recognizer/recorder.ts';
import type { World } from './game/types.ts';
import { createWorld, startRound, takeEvents, update } from './game/world.ts';
import { castShield, castSpell } from './game/spells.ts';
import { formatRoundLog, noteStrokeStart } from './game/roundLog.ts';

const glCanvas = document.createElement('canvas');
const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'overlay';
document.body.append(glCanvas, overlayCanvas);

const world3d = createScene(glCanvas);
const overlay = createOverlay(overlayCanvas);
const debugOverlay = createDebugOverlay();
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

/** Centre of a stroke's bounding box: picks the target. */
function strokeCentre(points: Point[]): Point {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Leave the menu / end banner: a fresh round. */
function newRound() {
  world = startRound(createWorld(difficulty));
  overlay.flash(`DEFEND THE WALL (${difficulty.toUpperCase()})`, 1.5);
}

// Pen down: start the pen-down -> cast timer for the tuning log.
onStrokeStart(() => noteStrokeStart(world));

// Every finished stroke: recorder first (if armed), otherwise recognize it and cast.
onStrokeEnd((points) => {
  if (recorder.consume(points)) return;
  const shape = classify(points);
  console.log('classify:', shape);
  // Mouse debug has no open palm: a stroke starts the round instead.
  if (world.phase !== 'PLAYING') {
    if (mouse.isEnabled()) newRound();
    return;
  }
  const result = castSpell(world, shape.name, strokeCentre(points), world3d.project);
  console.log('cast:', result.kind, result.spell, result.texts.map((t) => t.text).join(' '));
});

// Open palm = shield, instantly.
onPalm(() => {
  if (world.phase === 'PLAYING') castShield(world);
});

// Hold the open palm to start / play again (outside a round only).
let pose: Pose = 'other';
let palmHeldS = 0;
onCursor((_x, _y, p) => (pose = p));
function updatePalmHold(dt: number) {
  palmHeldS = world.phase !== 'PLAYING' && pose === 'palm' ? palmHeldS + dt : 0;
  if (palmHeldS >= CONFIG.PALM_HOLD_START_S) {
    palmHeldS = 0;
    newRound();
  }
}

/** React to game events. Temporary text feedback until the HUD and floating texts (F2) exist. */
function handleEvents() {
  for (const ev of takeEvents(world)) {
    if (ev.type === 'floatText') overlay.flash(ev.text, 0.8);
    else if (ev.type === 'castleHit') world3d.shake(ev.cause === 'blast' ? 0.8 : 0.5);
    else if (ev.type === 'bossArrive') overlay.flash('THE BOSS IS COMING', 2);
    else if (ev.type === 'waveStart') overlay.flash(`WAVE ${ev.wave}`, 1.5);
    else if (ev.type === 'gameOver') {
      overlay.flash(ev.result === 'WIN' ? 'VICTORY! Hold palm to play again' : 'THE WALL FELL. Hold palm to play again', 5);
      saveRoundLog(formatRoundLog(world));
    }
  }
}

/** A3 tuning: print the round log and keep the last 20 in localStorage ("sigil-siege-round-logs"). */
function saveRoundLog(report: string) {
  console.log(report);
  try {
    const key = 'sigil-siege-round-logs';
    const logs: string[] = JSON.parse(localStorage.getItem(key) ?? '[]');
    logs.push(`${new Date().toISOString()}
${report}`);
    localStorage.setItem(key, JSON.stringify(logs.slice(-20)));
  } catch {
    // Storage blocked: the console copy is enough.
  }
}

/** Temporary HUD (top-left) until Farhan's HUD (F2) lands. */
function drawTempHud(ctx: CanvasRenderingContext2D) {
  ctx.font = '18px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  const lines =
    world.phase === 'MENU'
      ? [mouse.isEnabled() ? 'Draw any stroke to start' : 'Hold open palm to start', `Difficulty: ${difficulty}`]
      : [
          `Castle ${world.castleHp}/${CONFIG.CASTLE_HP}   Score ${world.score}   Combo x${world.combo}`,
          `Wave ${world.wave}   Time ${Math.max(0, CONFIG.ROUND_SECONDS - world.time).toFixed(0)} s`,
          `Lightning ${world.lightningCooldown > 0 ? world.lightningCooldown.toFixed(0) + ' s' : 'READY'}`,
        ];
  lines.forEach((line, i) => ctx.fillText(line, 12, 70 + i * 24));
}

let lastNow = 0;
function frame(now: number) {
  const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
  lastNow = now;
  hand?.update();
  updatePalmHold(dt);
  update(world, dt);
  handleEvents();
  world3d.render(world, dt);
  overlay.draw();
  drawTempHud(overlay.ctx);
  debugOverlay.tick(now);
  debugOverlay.draw(overlay.ctx, hand);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
