// Canvas 2D overlay drawn on top of the 3D scene: trail, HUD, badges, menus.
// For now it only draws the cursor and the current stroke trail.
import { onCursor, onStrokeEnd, onStrokePoint, onStrokeStart, type Point, type Pose } from '../events.ts';

export function createOverlay(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let cursor: { x: number; y: number; pose: Pose } | null = null;
  let trail: Point[] = [];

  let mouseDebug = false;
  let message: { text: string; until: number } | null = null;
  let recordedCount = 0;

  onCursor((x, y, pose) => {
    cursor = { x, y, pose };
    // Pen lifted: clear the trail even if the stroke was too short to be emitted.
    if (pose !== 'point') trail = [];
  });
  onStrokeStart(() => (trail = []));
  onStrokePoint((x, y) => trail.push({ x, y }));
  onStrokeEnd(() => (trail = []));

  function resize(width: number, height: number) {
    canvas.width = width;
    canvas.height = height;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Stroke trail
    if (trail.length > 1) {
      ctx.strokeStyle = '#ffe28a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (const p of trail) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // Cursor dot
    if (cursor) {
      ctx.fillStyle = cursor.pose === 'point' ? '#ffe28a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Big label so mouse mode is never mistaken for the real hands-free demo.
    if (mouseDebug) {
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(canvas.width / 2 - 200, 12, 400, 48);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillText('MOUSE DEBUG MODE', canvas.width / 2, 20);
    }

    if (message && performance.now() < message.until) {
      ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(message.text, canvas.width / 2, canvas.height * 0.2);
    }

    if (recordedCount > 0) {
      ctx.font = '16px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ffb347';
      ctx.fillText(`${recordedCount} recorded templates loaded (Shift+R clears)`, 12, canvas.height - 12);
    }
  }

  function setMouseDebug(on: boolean) {
    mouseDebug = on;
  }

  /** Show a short message in the middle of the screen (debug results, recorder). */
  function flash(text: string, seconds = 1.2) {
    message = { text, until: performance.now() + seconds * 1000 };
  }

  /** How many recorded templates are loaded (shown so we never demo with stale ones). */
  function setRecordedCount(n: number) {
    recordedCount = n;
  }

  return { resize, draw, setMouseDebug, flash, setRecordedCount };
}
