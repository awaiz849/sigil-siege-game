// Built-in templates, generated from math (no recorded data needed).
// Screen coordinates: y grows DOWNWARD. Shapes are drawn in a box of roughly -1..1.
import type { Point } from '../events.ts';
import { makeTemplate, type Template } from './dollar.ts';

/** Every name the recognizer can return (besides null). */
export type SigilName = 'line' | 'v' | 'zigzag' | 'circle' | 'L';
export const SIGIL_NAMES: SigilName[] = ['line', 'v', 'zigzag', 'circle', 'L'];

/** Closed shapes end near where they started; open shapes do not.
 *  Circle is in both lists: circles drawn in the air often leave a big gap. */
export const CLOSED_SHAPES: SigilName[] = ['circle'];
export const OPEN_SHAPES: SigilName[] = ['v', 'zigzag', 'L', 'circle'];

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
    makeTemplate('circle', circle(true)),
    makeTemplate('circle', circle(false)),
    makeTemplate('circle', circle(true, 280)), // left a gap
    makeTemplate('circle', circle(false, 280)),
    makeTemplate('circle', circle(true, 450)), // went round too far
    makeTemplate('circle', circle(false, 450)),
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
