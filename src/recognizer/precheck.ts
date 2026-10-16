// Cheap geometric checks run BEFORE $1:
//  - an almost-straight stroke is a line ($1 cannot handle lines: it scales them into a square).
//    Judged by how far the (jitter-smoothed) stroke bends away from the line between its ends,
//    not by path length: a shaky hand adds lots of length to a perfectly good line.
//  - otherwise: is the stroke closed (circle) or open (v / zigzag / L)?
import { CONFIG } from '../config.ts';
import type { Point } from '../events.ts';
import { dist, pathLength } from './dollar.ts';

export type StrokeKind = 'line' | 'closed' | 'open';

export function precheck(points: Point[]): { kind: StrokeKind; straightness: number } {
  const first = points[0];
  const last = points[points.length - 1];
  const length = pathLength(points);
  const endGap = dist(first, last);

  // 1 = perfectly straight, near 0 = ends meet (or the stroke doubles back).
  const straightness = length > 0 ? endGap / length : 0;
  const bend = endGap > 0 ? maxBend(points, first, last, endGap) : 1;
  if (bend <= CONFIG.LINE.maxBend && straightness >= CONFIG.LINE.minStraightness) {
    // Score for the PERFECT bonus: 1 = dead straight.
    return { kind: 'line', straightness: 1 - bend };
  }

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

/** Largest distance of the stroke from the straight segment first -> last, as a fraction of its
 *  length. Each point is averaged with its neighbours first, so hand jitter doesn't count as bending. */
function maxBend(points: Point[], first: Point, last: Point, chord: number): number {
  const dx = (last.x - first.x) / chord;
  const dy = (last.y - first.y) / chord;
  let worst = 0;
  for (let i = 0; i < points.length; i++) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(points.length - 1, i + 2); k++) {
      sx += points[k].x;
      sy += points[k].y;
      n++;
    }
    const off = Math.abs((sx / n - first.x) * dy - (sy / n - first.y) * dx); // distance from the line
    worst = Math.max(worst, off);
  }
  return worst / chord;
}
