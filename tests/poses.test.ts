// Pose test: synthetic hands for each pose at 3 tilts and 2 sizes, plus a one-frame flicker sequence.
// Run: npm run test:poses
import type { Pose } from '../src/events.ts';
import { classifyPose, pinchRatio, PoseStabilizer, type Landmark } from '../src/input/poses.ts';

type Fingers = { index: boolean; middle: boolean; ring: boolean; pinky: boolean };

/** Build 21 landmarks for an upright right hand (wrist at origin, fingers pointing up = -y). */
function makeHand(f: Fingers, pinched = false): Landmark[] {
  const lm: Landmark[] = new Array(21);
  lm[0] = { x: 0, y: 0 };
  // Thumb out to the side (or touching the index tip when pinched; fixed below).
  lm[1] = { x: -0.1, y: -0.08 };
  lm[2] = { x: -0.18, y: -0.15 };
  lm[3] = { x: -0.24, y: -0.22 };
  lm[4] = { x: -0.28, y: -0.28 };
  const bases = [-0.12, -0.04, 0.04, 0.12];
  const ext = [f.index, f.middle, f.ring, f.pinky];
  for (let k = 0; k < 4; k++) {
    const mcp = 5 + k * 4;
    const bx = bases[k];
    lm[mcp] = { x: bx, y: -0.35 };
    if (ext[k]) {
      lm[mcp + 1] = { x: bx, y: -0.47 };
      lm[mcp + 2] = { x: bx, y: -0.55 };
      lm[mcp + 3] = { x: bx, y: -0.62 };
    } else {
      // Curled: PIP slightly out, then DIP and tip fold back toward the palm.
      lm[mcp + 1] = { x: bx, y: -0.45 };
      lm[mcp + 2] = { x: bx, y: -0.38 };
      lm[mcp + 3] = { x: bx, y: -0.3 };
    }
  }
  if (pinched) lm[4] = { x: lm[8].x - 0.01, y: lm[8].y + 0.01 };
  return lm;
}

/** Rotate by tilt (degrees), scale and move into camera coords 0..1. */
function place(lm: Landmark[], tiltDeg: number, size: number): Landmark[] {
  const a = (tiltDeg * Math.PI) / 180;
  return lm.map((p) => ({
    x: 0.5 + size * (p.x * Math.cos(a) - p.y * Math.sin(a)),
    y: 0.75 + size * (p.x * Math.sin(a) + p.y * Math.cos(a)),
  }));
}

const shapes: Array<[Pose, Fingers]> = [
  ['point', { index: true, middle: false, ring: false, pinky: false }],
  ['two', { index: true, middle: true, ring: false, pinky: false }],
  ['palm', { index: true, middle: true, ring: true, pinky: true }],
  ['other', { index: false, middle: false, ring: false, pinky: false }], // fist
  ['other', { index: false, middle: true, ring: true, pinky: true }], // odd pose
];

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

for (const [expected, fingers] of shapes) {
  for (const tilt of [-35, 0, 35]) {
    for (const size of [0.5, 1]) {
      const got = classifyPose(place(makeHand(fingers), tilt, size));
      check(got === expected, `${expected.padEnd(5)} tilt ${String(tilt).padStart(3)}  size ${size}  -> ${got}`);
    }
  }
}

// Pinch ratio: small when pinched, large when open, independent of hand size.
for (const size of [0.5, 1]) {
  const open = pinchRatio(place(makeHand(shapes[0][1]), 0, size));
  const closed = pinchRatio(place(makeHand(shapes[0][1], true), 0, size));
  check(closed < 0.25 && open > 0.4, `pinch size ${size}: pinched ${closed.toFixed(2)}, open ${open.toFixed(2)}`);
}

// Flicker: a single odd frame must not change the stable pose; 3 frames in a row must.
const s = new PoseStabilizer(3);
const seq: Pose[] = ['point', 'point', 'point', 'two', 'point', 'point', 'two', 'two', 'two'];
const out = seq.map((p) => s.push(p));
const expected: Pose[] = ['other', 'other', 'point', 'point', 'point', 'point', 'point', 'point', 'two'];
check(out.join() === expected.join(), `flicker sequence -> ${out.join(' ')}`);

if (failures > 0) throw new Error(`${failures} pose checks failed`);
console.log('ALL pose checks passed');
