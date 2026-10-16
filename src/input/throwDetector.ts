// "Throw" gesture for the METEOR ultimate: a fast flick of the hand across the camera view.
// Speed is measured in HAND-LENGTHS per second (wrist -> middle knuckle), so it works the same
// whether the player stands near or far from the camera. Only movement across the image counts,
// not the hand growing toward the camera: pushing the open palm forward is the SHIELD, and must
// never fire the meteor by accident.
// Pure logic (no DOM), so it is tested in Node: tests/throw.test.ts.
import { CONFIG } from '../config.ts';
import type { Point } from '../events.ts';
import type { Landmark } from './poses.ts';

type Sample = { t: number; x: number; y: number; size: number };

export class ThrowDetector {
  private prev: Sample | null = null;
  private fastFrames = 0;
  private lastThrowAt = -Infinity;
  /** Recent cursor positions, to aim where the hand was just BEFORE the flick started. */
  private cursors: Array<{ t: number; p: Point }> = [];

  private readonly cfg: typeof CONFIG.THROW;

  constructor(cfg = CONFIG.THROW) {
    this.cfg = cfg;
  }

  /** Forget the motion so far (hand lost, or pen down). */
  reset(): void {
    this.prev = null;
    this.fastFrames = 0;
    this.cursors = [];
  }

  /**
   * Feed one camera frame. Returns the aim point (overlay pixels) when a throw happens this frame,
   * otherwise null.
   * @param t      time in ms
   * @param lm     the 21 hand landmarks (camera coords 0..1)
   * @param cursor the cursor position this frame (overlay pixels)
   */
  push(t: number, lm: Landmark[], cursor: Point): Point | null {
    // Hand centre = halfway between the wrist (0) and the middle-finger knuckle (9).
    const wrist = lm[0];
    const knuckle = lm[9];
    const sample: Sample = {
      t,
      x: (wrist.x + knuckle.x) / 2,
      y: (wrist.y + knuckle.y) / 2,
      size: Math.hypot(knuckle.x - wrist.x, knuckle.y - wrist.y),
    };
    this.cursors.push({ t, p: cursor });
    while (this.cursors.length > 0 && t - this.cursors[0].t > this.cfg.aimLookbackMs * 2) this.cursors.shift();

    const prev = this.prev;
    this.prev = sample;
    const dt = prev ? (t - prev.t) / 1000 : 0;
    // First frame, or a gap in tracking: nothing to compare with.
    if (!prev || dt <= 0 || dt > this.cfg.maxGapS || sample.size <= 0) {
      this.fastFrames = 0;
      return null;
    }

    // Speed across the image, in hand-lengths per second.
    const speed = Math.hypot(sample.x - prev.x, sample.y - prev.y) / sample.size / dt;
    this.fastFrames = speed >= this.cfg.speed ? this.fastFrames + 1 : 0;

    // A real flick is fast for several frames in a row (one-frame jitter is ignored).
    if (this.fastFrames < this.cfg.frames || t - this.lastThrowAt < this.cfg.cooldownMs) return null;
    this.lastThrowAt = t;
    this.fastFrames = 0;
    // Aim: where the cursor was aimLookbackMs ago (before the flick moved it).
    const aim = this.cursors.find((c) => c.t >= t - this.cfg.aimLookbackMs) ?? this.cursors[0];
    return aim.p;
  }
}
