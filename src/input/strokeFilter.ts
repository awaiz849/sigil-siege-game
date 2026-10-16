// Shared by mouse and hand input: decides if a finished stroke is worth recognizing.
import { CONFIG } from '../config';
import type { Point } from '../events';

/** True if the stroke has enough points and is big enough (bounding box). */
export function isStrokeLongEnough(points: Point[]): boolean {
  if (points.length < CONFIG.MIN_STROKE_POINTS) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Math.max(maxX - minX, maxY - minY) >= CONFIG.MIN_STROKE_PX;
}
