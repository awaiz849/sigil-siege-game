// Canvas 2D overlay drawn on top of the 3D scene: trail, HUD, badges, menus.
// For now it only draws the cursor and the current stroke trail.
import { onCursor, onStrokeEnd, onStrokePoint, onStrokeStart, type Point, type Pose } from '../events';

export function createOverlay(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let cursor: { x: number; y: number; pose: Pose } | null = null;
  let trail: Point[] = [];

  onCursor((x, y, pose) => (cursor = { x, y, pose }));
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
  }

  return { resize, draw };
}
