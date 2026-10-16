// Hands-free "confirm": hold an open palm for PALM_HOLD_START_S seconds (start / play again).
// Reads onCursor only (its pose is already the stable, de-flickered pose).
// Fires once per hold: the palm must close before it can fire again.
import { CONFIG } from '../config.ts';
import { onCursor, type Pose } from '../events.ts';

export function createPalmHold(onHold: () => void, seconds = CONFIG.PALM_HOLD_START_S) {
  let pose: Pose = 'other';
  let since: number | null = null;
  let fired = false;
  let progress = 0;

  const unsubscribe = onCursor((_x, _y, p) => (pose = p));

  return {
    /** 0..1: how long the palm has been held (for a ring that fills up). */
    get progress() {
      return progress;
    },
    /** Call every frame with the current time in ms. */
    update(now: number) {
      if (pose !== 'palm') {
        since = null;
        fired = false;
        progress = 0;
        return;
      }
      since ??= now;
      progress = fired ? 1 : Math.min(1, (now - since) / (seconds * 1000));
      if (progress >= 1 && !fired) {
        fired = true;
        onHold();
      }
    },
    /** Start over. A palm that is already open must close first (no accidental instant confirm). */
    reset() {
      since = null;
      progress = 0;
      fired = pose === 'palm';
    },
    dispose: unsubscribe,
  };
}
