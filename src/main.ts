// Entry point: creates the two canvases (3D below, 2D overlay on top) and runs the frame loop.
import { createScene } from './render/scene';
import { createOverlay } from './ui/overlay';

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

function frame() {
  world3d.render();
  overlay.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
