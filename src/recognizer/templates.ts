// Built-in templates, generated from math (no recorded data needed).
// Screen coordinates: y grows DOWNWARD. Shapes are drawn in a box of roughly -1..1.
import type { Point } from '../events.ts';
import { makeTemplate, type Template } from './dollar.ts';

/** Every name the recognizer can return (besides null). */
export type SigilName = 'line' | 'v' | 'zigzag' | 'C' | 'L';
export const SIGIL_NAMES: SigilName[] = ['line', 'v', 'zigzag', 'C', 'L'];

/** Closed shapes end near where they started; open shapes do not.
 *  C (water) is in both lists: a C is open, but a full circle also counts as water. */
export const CLOSED_SHAPES: SigilName[] = ['C'];
export const OPEN_SHAPES: SigilName[] = ['v', 'zigzag', 'L', 'C'];

/** Circle starting at the top. sweepDeg < 360 = left a gap, > 360 = went round too far
 *  (both are common when drawing in the air). Increasing angle = clockwise on screen (y down). */
function circle(clockwise: boolean, sweepDeg = 360): Point[] {
  const pts: Point[] = [];
  const steps = Math.round(sweepDeg / 10);
  for (let i = 0; i <= steps; i++) {
    const a = ((-90 + (clockwise ? 1 : -1) * (i / steps) * sweepDeg) * Math.PI) / 180;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return pts;
}

/** C (half circle opening to the right, like the letter): from the top-right, round the left side,
 *  to the bottom-right. sweepDeg = how far round (180 = half circle, 270 = classic C).
 *  reverse = drawn from the bottom up. */
function cShape(sweepDeg: number, reverse = false): Point[] {
  const pts: Point[] = [];
  const start = -90 + (360 - sweepDeg) / 2; // top end of the opening
  const steps = Math.round(sweepDeg / 10);
  for (let i = 0; i <= steps; i++) {
    const a = ((start - (i / steps) * sweepDeg) * Math.PI) / 180; // counter-clockwise on screen
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return reverse ? pts.reverse() : pts;
}

/** L: straight down, then right along the bottom. footLength = bottom bar / upright bar. */
function ell(footLength: number, reverse = false): Point[] {
  const pts = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: footLength * 2, y: 1 }];
  return reverse ? pts.reverse() : pts;
}

/** V: from top-left down to the bottom point and up to top-right. */
function v(halfWidth: number, rightToLeft = false): Point[] {
  const pts = [{ x: -halfWidth, y: -1 }, { x: 0, y: 1 }, { x: halfWidth, y: -1 }];
  return rightToLeft ? pts.reverse() : pts;
}

/** W-style zigzag: starts at the top, alternates bottom/top. 2 valleys = classic W. */
function zigzag(valleys: number, rightToLeft = false): Point[] {
  const segments = valleys * 2;
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    pts.push({ x: -1 + (2 * i) / segments, y: i % 2 === 0 ? -1 : 1 });
  }
  return rightToLeft ? pts.reverse() : pts;
}

export function builtInTemplates(): Template[] {
  return [
    makeTemplate('C', cShape(270)), // classic C
    makeTemplate('C', cShape(220)), // wide open
    makeTemplate('C', cShape(180)), // half circle
    makeTemplate('C', cShape(270, true)), // drawn from the bottom up
    makeTemplate('C', cShape(200, true)),
    makeTemplate('C', circle(true)), // a full circle still counts as water
    makeTemplate('C', circle(false)),
    makeTemplate('L', ell(0.6)), // normal
    makeTemplate('L', ell(0.3)), // short foot
    makeTemplate('L', ell(1)), // long foot
    makeTemplate('L', ell(0.6, true)), // drawn backwards: foot first, then up
    makeTemplate('v', v(0.6)), // normal
    makeTemplate('v', v(0.25)), // narrow
    makeTemplate('v', v(1.2)), // wide
    makeTemplate('v', v(0.6, true)), // right-to-left
    makeTemplate('zigzag', zigzag(2)), // W, left-to-right
    makeTemplate('zigzag', zigzag(2, true)),
    makeTemplate('zigzag', zigzag(3)), // 3 valleys
    makeTemplate('zigzag', zigzag(3, true)),
  ];
}
