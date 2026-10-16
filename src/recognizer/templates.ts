// Built-in templates, generated from math (no recorded data needed).
// Screen coordinates: y grows DOWNWARD. Shapes are drawn in a box of roughly -1..1.
import type { Point } from '../events.ts';
import { makeTemplate, type Template } from './dollar.ts';

/** Every name the recognizer can return (besides null).
 *  Wizard (level 1): C, L (mirrored L), v, zigzag (W), line; a full circle O also counts as his C.
 *  Grand Warden (level 2): C, O (full circle), peak (Λ), M, line. */
export type SigilName = 'line' | 'v' | 'zigzag' | 'C' | 'L' | 'O' | 'peak' | 'M';
export const SIGIL_NAMES: SigilName[] = ['line', 'v', 'zigzag', 'C', 'L', 'O', 'peak', 'M'];

/** Which hero draws which shapes. $1 ignores rotation, so each hero only matches his own set
 *  (an M is a W upside down, a Λ a V: never in the same set). The wizard's O is read as his C. */
export type Hero = 'wizard' | 'warden';
export const HERO_SHAPES: Record<Hero, SigilName[]> = {
  wizard: ['C', 'L', 'v', 'zigzag', 'O'],
  warden: ['C', 'O', 'peak', 'M'],
};

/** Closed shapes end near where they started; open shapes do not.
 *  C and O are in both lists: a sloppy circle can leave a gap, a C can nearly close. */
export const CLOSED_SHAPES: SigilName[] = ['C', 'O'];
export const OPEN_SHAPES: SigilName[] = ['v', 'zigzag', 'L', 'C', 'O', 'peak', 'M'];

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

/** Mirrored L (⅃): straight down, then LEFT along the bottom. Mirrored so it can't be confused
 *  with a C, which ends heading right. footLength = bottom bar / upright bar. */
function ell(footLength: number, reverse = false): Point[] {
  const pts = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -footLength * 2, y: 1 }];
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

/** Λ (peak): up from the bottom-left to a sharp top, down to the bottom-right. */
function peak(halfWidth: number, rightToLeft = false): Point[] {
  const pts = [{ x: -halfWidth, y: 1 }, { x: 0, y: -1 }, { x: halfWidth, y: 1 }];
  return rightToLeft ? pts.reverse() : pts;
}

/** M: starts at the bottom, alternates top/bottom (a W upside down). */
function emm(rightToLeft = false): Point[] {
  const pts = [-1, -0.5, 0, 0.5, 1].map((x, i) => ({ x, y: i % 2 === 0 ? 1 : -1 }));
  return rightToLeft ? pts.reverse() : pts;
}

export function builtInTemplates(): Template[] {
  return [
    makeTemplate('C', cShape(270)), // classic C
    makeTemplate('C', cShape(220)), // wide open
    makeTemplate('C', cShape(180)), // half circle
    makeTemplate('C', cShape(270, true)), // drawn from the bottom up
    makeTemplate('C', cShape(200, true)),
    makeTemplate('O', circle(true)), // full circle (the wizard reads it as his C)
    makeTemplate('O', circle(false)),
    makeTemplate('O', circle(true, 330)), // a circle with a small gap
    makeTemplate('O', circle(false, 330)),
    makeTemplate('O', circle(true, 390)), // went round a bit too far
    makeTemplate('O', circle(false, 390)),
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
    // Grand Warden (level 2)
    makeTemplate('peak', peak(0.45)),
    makeTemplate('peak', peak(0.25)), // narrow
    makeTemplate('peak', peak(0.45, true)), // right-to-left
    makeTemplate('M', emm()),
    makeTemplate('M', emm(true)),
  ];
}
