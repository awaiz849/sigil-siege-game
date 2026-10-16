// THE CONTRACT: the event bus between input, recognizer, game, render and UI.
// Never change these signatures without telling the team.
// All points are OVERLAY CANVAS PIXELS, already mirrored, origin top-left.

export type Point = { x: number; y: number };

/** Hand pose: point = index only (pen down), two = index + middle (pen up),
 *  palm = all four fingers open (shield), other = fist / anything else (hover). */
export type Pose = 'point' | 'two' | 'palm' | 'other';

// A tiny typed pub/sub: each event has a list of listeners.
function channel<Args extends unknown[]>() {
  const listeners: Array<(...args: Args) => void> = [];
  const on = (fn: (...args: Args) => void): (() => void) => {
    listeners.push(fn);
    // Return an unsubscribe function.
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  };
  const emit = (...args: Args): void => {
    for (const fn of listeners.slice()) fn(...args);
  };
  return { on, emit };
}

const strokeStart = channel<[]>();
const strokePoint = channel<[x: number, y: number]>();
const strokeEnd = channel<[points: Point[]]>();
const palm = channel<[]>();
const cursor = channel<[x: number, y: number, pose: Pose]>();

/** Pen went down: a new stroke begins. */
export const onStrokeStart = strokeStart.on;
export const emitStrokeStart = strokeStart.emit;

/** One new point of the current stroke. */
export const onStrokePoint = strokePoint.on;
export const emitStrokePoint = strokePoint.emit;

/** Pen went up: the full stroke, ready for the recognizer. */
export const onStrokeEnd = strokeEnd.on;
export const emitStrokeEnd = strokeEnd.emit;

/** Open palm detected (shield). */
export const onPalm = palm.on;
export const emitPalm = palm.emit;

/** Cursor position + pose every frame (hover menus, aim preview). */
export const onCursor = cursor.on;
export const emitCursor = cursor.emit;
