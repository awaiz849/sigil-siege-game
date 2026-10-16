// Entry point: creates the two canvases (3D below, 2D overlay on top) and runs the frame loop.
import { createScene } from './render/scene.ts';
import { createOverlay } from './ui/overlay.ts';
import { createDebugOverlay } from './ui/debugOverlay.ts';
import { createMouseInput } from './input/mouseInput.ts';
import { createHandInput, type HandInput } from './input/handInput.ts';
import { onPalm, onStrokeEnd } from './events.ts';
import { classify } from './recognizer/index.ts';
import { createRecorder } from './recognizer/recorder.ts';

const glCanvas = document.createElement('canvas');
const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'overlay';
document.body.append(glCanvas, overlayCanvas);

const world3d = createScene(glCanvas);
const overlay = createOverlay(overlayCanvas);
const debugOverlay = createDebugOverlay();

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

// Every finished stroke: recorder first (if armed), otherwise recognize it.
// Temporary: just show the result until the game logic is wired in.
onStrokeEnd((points) => {
  if (recorder.consume(points)) return;
  const result = classify(points);
  const label = result.name ? result.name.toUpperCase() : 'FIZZLE';
  overlay.flash(`${label} ${result.score.toFixed(2)}`);
  console.log('classify:', result);
});
onPalm(() => overlay.flash('SHIELD'));

function frame(now: number) {
  hand?.update();
  world3d.render();
  overlay.draw();
  debugOverlay.tick(now);
  debugOverlay.draw(overlay.ctx, hand);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
