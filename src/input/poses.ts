// Finger-pose classifier from MediaPipe's 21 hand landmarks.
// A finger counts as "extended" when its tip is clearly farther from the wrist than its
// middle joint (PIP). Using distances (not up/down) makes it work at any hand angle.
//
// Landmark ids: 0 wrist, 4 thumb tip, 6/8 index PIP/tip, 9 middle knuckle,
// 10/12 middle PIP/tip, 14/16 ring PIP/tip, 18/20 pinky PIP/tip.
import { CONFIG } from '../config.ts';
import type { Pose } from '../events.ts';

export type Landmark = { x: number; y: number; z?: number };

const FINGERS = {
  index: { pip: 6, tip: 8 },
  middle: { pip: 10, tip: 12 },
  ring: { pip: 14, tip: 16 },
  pinky: { pip: 18, tip: 20 },
};

function d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isExtended(lm: Landmark[], finger: keyof typeof FINGERS): boolean {
  const { pip, tip } = FINGERS[finger];
  return d(lm[0], lm[tip]) > d(lm[0], lm[pip]) * CONFIG.FINGER_EXTEND_RATIO;
}

/** Raw pose for one frame (the stability filter lives in handInput). */
export function classifyPose(lm: Landmark[]): Pose {
  const index = isExtended(lm, 'index');
  const middle = isExtended(lm, 'middle');
  const ring = isExtended(lm, 'ring');
  const pinky = isExtended(lm, 'pinky');

  if (index && middle && ring && pinky) return 'palm';
  if (index && middle && !ring && !pinky) return 'two';
  if (index && !middle && !ring && !pinky) return 'point';
  return 'other';
}

/** Pinch amount for the fallback mode: thumb-index tip distance divided by hand size. */
export function pinchRatio(lm: Landmark[]): number {
  const handSize = d(lm[0], lm[9]); // wrist to middle knuckle
  return handSize > 0 ? d(lm[4], lm[8]) / handSize : Infinity;
}

/** Ignores flicker: a pose only becomes the stable pose after N identical frames in a row. */
export class PoseStabilizer {
  private candidate: Pose = 'other';
  private count = 0;
  stable: Pose = 'other';
  private frames: number;

  constructor(frames: number) {
    this.frames = frames;
  }

  push(raw: Pose): Pose {
    if (raw === this.candidate) this.count++;
    else {
      this.candidate = raw;
      this.count = 1;
    }
    if (this.count >= this.frames) this.stable = this.candidate;
    return this.stable;
  }

  reset(): void {
    this.candidate = this.stable = 'other';
    this.count = 0;
  }
}
