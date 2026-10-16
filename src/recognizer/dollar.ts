// Our own port of the $1 Unistroke Recognizer (Wobbrock, Wilson & Li, 2007).
// Idea: normalize every stroke the same way (resample to N points, rotate, scale,
// move to origin), then compare point-by-point with each template.
// The template with the smallest average distance wins.
import type { Point } from '../events.ts';

export type Template = { name: string; points: Point[] }; // points are already normalized

const N = 64; // points after resampling
const SQUARE = 250; // strokes are scaled into a SQUARE x SQUARE box
const HALF_DIAGONAL = 0.5 * Math.sqrt(2 * SQUARE * SQUARE);
const ANGLE_RANGE = (45 * Math.PI) / 180; // search +-45 degrees for the best rotation
const ANGLE_PRECISION = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5)); // golden ratio, for golden-section search

/** Turn a raw stroke into a template (normalizes once, up front). */
export function makeTemplate(name: string, raw: Point[]): Template {
  return { name, points: normalize(raw) };
}

/** Compare a raw stroke against templates. Score is 0..1 (1 = perfect match). */
export function recognize(raw: Point[], templates: Template[]): { name: string | null; score: number } {
  if (raw.length < 2 || templates.length === 0) return { name: null, score: 0 };
  const points = normalize(raw);
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const t of templates) {
    const d = distanceAtBestAngle(points, t.points, -ANGLE_RANGE, ANGLE_RANGE, ANGLE_PRECISION);
    if (d < bestDistance) {
      bestDistance = d;
      best = t.name;
    }
  }
  return { name: best, score: Math.max(0, 1 - bestDistance / HALF_DIAGONAL) };
}

// ---- The four normalization steps ----

function normalize(raw: Point[]): Point[] {
  let pts = resample(raw, N);
  pts = rotateBy(pts, -indicativeAngle(pts));
  pts = scaleTo(pts, SQUARE);
  return translateToOrigin(pts);
}

/** Step 1: N points spaced evenly along the path (drawing speed no longer matters). */
function resample(raw: Point[], n: number): Point[] {
  const pts = raw.map((p) => ({ x: p.x, y: p.y }));
  const interval = pathLength(pts) / (n - 1);
  if (interval === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const out: Point[] = [{ ...pts[0] }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= interval) {
      // Insert a new point on this segment and continue from it.
      const t = (interval - acc) / d;
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) };
      out.push(q);
      pts.splice(i, 0, q);
      acc = 0;
    } else {
      acc += d;
    }
  }
  // Rounding can leave us one short.
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

/** Step 2: angle from the centroid to the first point; we rotate that to 0. */
function indicativeAngle(pts: Point[]): number {
  const c = centroid(pts);
  return Math.atan2(c.y - pts[0].y, c.x - pts[0].x);
}

function rotateBy(pts: Point[], angle: number): Point[] {
  const c = centroid(pts);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

/** Step 3: scale (non-uniformly) into a square, so size does not matter. */
function scaleTo(pts: Point[], size: number): Point[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  // Guard against a perfectly flat stroke (lines are caught by the precheck anyway).
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  return pts.map((p) => ({ x: (p.x * size) / w, y: (p.y * size) / h }));
}

/** Step 4: move the centroid to (0, 0), so position does not matter. */
function translateToOrigin(pts: Point[]): Point[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

// ---- Matching ----

/** Golden-section search for the rotation that best fits the template. */
function distanceAtBestAngle(pts: Point[], tmpl: Point[], a: number, b: number, threshold: number): number {
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = distanceAtAngle(pts, tmpl, x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = distanceAtAngle(pts, tmpl, x2);
  while (Math.abs(b - a) > threshold) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = distanceAtAngle(pts, tmpl, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = distanceAtAngle(pts, tmpl, x2);
    }
  }
  return Math.min(f1, f2);
}

function distanceAtAngle(pts: Point[], tmpl: Point[], angle: number): number {
  return pathDistance(rotateBy(pts, angle), tmpl);
}

/** Average distance between matching points of two normalized strokes. */
function pathDistance(a: Point[], b: Point[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += dist(a[i], b[i]);
  return d / a.length;
}

// ---- Small helpers (also used by the precheck) ----

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pathLength(pts: Point[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

function centroid(pts: Point[]): Point {
  let x = 0, y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}
