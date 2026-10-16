// Entry point: creates the two canvases (3D below, 2D overlay on top) and runs the frame loop.
import { createScene } from './render/scene';
import { createOverlay } from './ui/overlay';
import { createMouseInput } from './input/mouseInput';
import { onStrokeEnd } from './events';

const glCanvas = document.createElement('canvas');
const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'overlay';
document.body.append(glCanvas, overlayCanvas);

const world3d = createScene(glCanvas);
const overlay = createOverlay(overlayCanvas);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  world3d.resize(w, h);
  // Overlay uses CSS pixels so stroke points match the screen 1:1.
  overlay.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// Debug mouse input. On until hand tracking exists; later it is only the no-camera fallback.
const mouse = createMouseInput();
function setMouseMode(on: boolean) {
  mouse.setEnabled(on);
  overlay.setMouseDebug(on);
}
setMouseMode(true);

// Debug keys only (never needed during real gameplay). M = toggle mouse input.
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') setMouseMode(!mouse.isEnabled());
});

// Temporary: log finished strokes until the recognizer is wired in.
onStrokeEnd((points) => console.log(`stroke: ${points.length} points`));

function frame() {
  world3d.render();
  overlay.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
