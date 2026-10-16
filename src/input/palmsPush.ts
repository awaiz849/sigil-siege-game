// "Both palms" gesture for the METEOR ultimate: open BOTH hands and push them toward the camera
// (both hands grow on the image), or simply hold both palms up for a moment. Two hands are needed,
// so a single open palm stays the shield and never fires the meteor.
// Pure logic (no DOM), so it is tested in Node: tests/palms.test.ts.
import { CONFIG } from '../config.ts';
import { classifyPose, type Landmark } from './poses.ts';

/** Hand size on the image: wrist -> middle-finger knuckle (grows as the hand comes closer). */
const handSize = (lm: Landmark[]) => Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);

export class PalmsPush {
  private since: number | null = null; // when both palms first showed (ms)
  private startSize = 0;
  private lastFireAt = -Infinity;
  private armed = true; // after a meteor, both hands must drop before the next one
  private readonly cfg: typeof CONFIG.PALMS_PUSH;

  constructor(cfg = CONFIG.PALMS_PUSH) {
    this.cfg = cfg;
  }

  /** Feed every tracked hand each camera frame. Returns the aim (camera coords, the point between
   *  the two palms) when the gesture fires, else null. */
  push(now: number, hands: Landmark[][]): Landmark | null {
    const palms = hands.filter((lm) => classifyPose(lm) === 'palm');
    if (palms.length < 2) {
      this.since = null;
      this.armed = true;
      return null;
    }
    if (!this.armed) return null;
    const [a, b] = palms;
    const size = (handSize(a) + handSize(b)) / 2;
    if (this.since === null) {
      this.since = now;
      this.startSize = size;
    }
    const pushed = size >= this.startSize * this.cfg.grow && now - this.since <= this.cfg.pushMs;
    const held = now - this.since >= this.cfg.holdMs;
    if (!(pushed || held) || now - this.lastFireAt < this.cfg.cooldownMs) return null;
    this.lastFireAt = now;
    this.since = null;
    this.armed = false;
    return { x: (a[9].x + b[9].x) / 2, y: (a[9].y + b[9].y) / 2 };
  }

  reset(): void {
    this.since = null;
  }
}
