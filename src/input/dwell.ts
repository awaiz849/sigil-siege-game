// Hands-free button press: hold the cursor over a rectangle for HOVER_SELECT_S seconds.
// Reads onCursor only. progress (0..1) drives the fill animation on the button.
// After it fires, the cursor must leave the rectangle before it can fire again.
import { CONFIG } from '../config.ts';
import { onCursor } from '../events.ts';

export type Rect = { x: number; y: number; w: number; h: number };

export function createDwell(getRect: () => Rect, onSelect: () => void, seconds = CONFIG.HOVER_SELECT_S) {
  let cursor: { x: number; y: number } | null = null;
  let since: number | null = null; // when the cursor entered (ms)
  let fired = false;
  let progress = 0;

  const unsubscribe = onCursor((x, y) => (cursor = { x, y }));

  return {
    /** 0..1: how far the hold has got (for the fill animation). */
    get progress() {
      return progress;
    },
    /** Call every frame with the current time in ms. */
    update(now: number) {
      const r = getRect();
      const inside = cursor !== null && cursor.x >= r.x && cursor.x <= r.x + r.w && cursor.y >= r.y && cursor.y <= r.y + r.h;
      if (!inside) {
        since = null;
        fired = false;
        progress = 0;
        return;
      }
      since ??= now;
      progress = fired ? 1 : Math.min(1, (now - since) / (seconds * 1000));
      if (progress >= 1 && !fired) {
        fired = true;
        onSelect();
      }
    },
    dispose: unsubscribe,
  };
}
