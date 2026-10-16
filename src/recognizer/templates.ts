// Built-in templates, generated from math (no recorded data needed).
// Screen coordinates: y grows DOWNWARD. Shapes are drawn in a box of roughly -1..1.
import type { Point } from '../events.ts';
import { makeTemplate, type Template } from './dollar.ts';

/** Every name the recognizer can return (besides null). */
export type SigilName = 'line' | 'v' | 'zigzag' | 'circle' | 'triangle';
export const SIGIL_NAMES: SigilName[] = ['line', 'v', 'zigzag', 'circle', 'triangle'];

/** Closed shapes end near where they started; open shapes do not. */
export const CLOSED_SHAPES: SigilName[] = ['circle', 'triangle'];
export const OPEN_SHAPES: SigilName[] = ['v', 'zigzag'];

function circle(clockwise: boolean): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 32; i++) {
    // Start at the top. Increasing angle = clockwise on screen (y down).
    const a = -Math.PI / 2 + (clockwise ? 1 : -1) * (i / 32) * Math.PI * 2;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return pts;
}

function triangle(clockwise: boolean): Point[] {
  const top = { x: 0, y: -1 };
  const right = { x: 0.87, y: 0.5 };
  const left = { x: -0.87, y: 0.5 };
  return clockwise ? [top, right, left, top] : [top, left, right, top];
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
    makeTemplate('triangle', triangle(true)),
    makeTemplate('triangle', triangle(false)),
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
