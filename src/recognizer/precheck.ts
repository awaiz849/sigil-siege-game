// Cheap geometric checks run BEFORE $1:
//  - an almost-straight stroke is a line ($1 cannot handle lines: it scales them into a square)
//  - otherwise: is the stroke closed (circle/triangle) or open (v/zigzag)?
import { CONFIG } from '../config.ts';
import type { Point } from '../events.ts';
import { dist, pathLength } from './dollar.ts';

export type StrokeKind = 'line' | 'closed' | 'open';

export function precheck(points: Point[]): { kind: StrokeKind; straightness: number } {
  const first = points[0];
  const last = points[points.length - 1];
  const length = pathLength(points);
  const endGap = dist(first, last);

  // 1 = perfectly straight, near 0 = ends meet.
  const straightness = length > 0 ? endGap / length : 0;
  if (straightness >= CONFIG.LINE_STRAIGHTNESS) return { kind: 'line', straightness };

  // Closed if the end gap is small compared with the stroke's size.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  const closed = endGap < CONFIG.CLOSED_GAP_RATIO * diagonal;
  return { kind: closed ? 'closed' : 'open', straightness };
}
