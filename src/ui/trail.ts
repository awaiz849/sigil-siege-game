// The glowing gold trail your finger leaves while drawing a sigil.
// Each point fades out over TRAIL_FADE_MS, so the tail dissolves behind the fingertip,
// and the whole stroke fades away after the pen lifts.
import { CONFIG } from '../config.ts';
import { onStrokePoint, onStrokeStart } from '../events.ts';

type TrailPoint = { x: number; y: number; t: number };

export function createTrail() {
  let points: TrailPoint[] = [];

  onStrokeStart(() => (points = []));
  onStrokePoint((x, y) => points.push({ x, y, t: performance.now() }));

  return {
    draw(ctx: CanvasRenderingContext2D, now: number) {
      const fade = CONFIG.TRAIL_FADE_MS;
      // Drop fully faded points from the front.
      while (points.length > 0 && now - points[0].t > fade) points.shift();
      if (points.length < 2) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter'; // additive: overlapping glow gets brighter
      // Three passes, wide + faint to thin + bright: a cheap glow (no canvas blur, which is slow).
      for (const [width, rgb, alpha] of [
        [22, '242,193,78', 0.12],
        [11, '242,193,78', 0.35],
        [4, '255,244,214', 0.95],
      ] as const) {
        ctx.lineWidth = width;
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const life = Math.max(0, 1 - (now - b.t) / fade); // 1 = fresh, 0 = gone
          ctx.strokeStyle = `rgba(${rgb},${(life * alpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}
