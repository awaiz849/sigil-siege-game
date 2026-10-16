// DEBUG input only: mouse drag = stroke. Emits exactly the same events as hand input,
// so the rest of the game cannot tell the difference.
// Mouse position is already in overlay pixels (CSS px, origin top-left), no mirroring needed.
import { CONFIG } from '../config.ts';
import { emitCursor, emitStrokeEnd, emitStrokePoint, emitStrokeStart, type Point } from '../events.ts';
import { isStrokeLongEnough } from './strokeFilter.ts';

export function createMouseInput() {
  let enabled = false;
  let drawing = false;
  let points: Point[] = [];

  function addPoint(x: number, y: number) {
    // Skip points closer than a few pixels to the last one (mouse spam).
    const last = points[points.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < CONFIG.MOUSE_MIN_STEP_PX) return;
    points.push({ x, y });
    emitStrokePoint(x, y);
  }

  function endStroke() {
    if (!drawing) return;
    drawing = false;
    // Too short = ignored (a click or a twitch, not a sigil).
    if (isStrokeLongEnough(points)) emitStrokeEnd(points);
    points = [];
  }

  // Listen on window: the overlay canvas has pointer-events: none.
  window.addEventListener('mousedown', (e) => {
    if (!enabled || e.button !== 0) return;
    drawing = true;
    points = [];
    emitStrokeStart();
    emitCursor(e.clientX, e.clientY, 'point');
    addPoint(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', (e) => {
    if (!enabled) return;
    // Pen down while dragging = 'point', otherwise just hovering = 'other'.
    emitCursor(e.clientX, e.clientY, drawing ? 'point' : 'other');
    if (drawing) addPoint(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', (e) => {
    if (!enabled || e.button !== 0) return;
    endStroke();
    emitCursor(e.clientX, e.clientY, 'other');
  });

  // Releasing the button outside the window still ends the stroke.
  window.addEventListener('blur', endStroke);

  return {
    isEnabled: () => enabled,
    setEnabled(on: boolean) {
      if (!on) endStroke();
      enabled = on;
    },
  };
}
