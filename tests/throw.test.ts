// Throw gesture test (METEOR ultimate): synthetic hands moving at different speeds.
// Run: npm run test:throw
import { CONFIG } from '../src/config.ts';
import { ThrowDetector } from '../src/input/throwDetector.ts';
import type { Landmark } from '../src/input/poses.ts';

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

const FRAME_MS = 33; // ~30 fps camera
const HAND = 0.12; // hand length (wrist -> middle knuckle) in camera units, about arm's length away

/** A hand whose centre is at (x, y) in camera coords, with the given size. Only landmarks 0 and 9 matter. */
function hand(x: number, y: number, size = HAND): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x, y }));
  lm[0] = { x, y: y + size / 2 }; // wrist below
  lm[9] = { x, y: y - size / 2 }; // middle knuckle above
  return lm;
}

/** Run a motion: each step moves the hand by (dx, dy) hand-lengths. Returns the frames that threw. */
function run(d: ThrowDetector, steps: Array<[number, number]>, start = { x: 0.5, y: 0.5 }, t0 = 0, size = HAND) {
  const throws: Array<{ frame: number; aim: { x: number; y: number } }> = [];
  let { x, y } = start;
  steps.forEach(([dx, dy], i) => {
    x += dx * size;
    y += dy * size;
    const cursor = { x: x * 1000, y: y * 1000 }; // fake overlay pixels
    const aim = d.push(t0 + i * FRAME_MS, hand(x, y, size), cursor);
    if (aim) throws.push({ frame: i, aim });
  });
  return throws;
}

const still = (n: number): Array<[number, number]> => Array.from({ length: n }, () => [0, 0]);
// Hand-lengths per frame for a given speed in hand-lengths per second.
const perFrame = (speed: number) => (speed * FRAME_MS) / 1000;
const fast = perFrame(CONFIG.THROW.speed * 1.5);
const slow = perFrame(CONFIG.THROW.speed * 0.5);

// 1. Holding still / moving slowly (repositioning the hand) never throws.
check(run(new ThrowDetector(), still(30)).length === 0, 'still hand: no throw');
check(run(new ThrowDetector(), Array.from({ length: 30 }, () => [slow, 0] as [number, number])).length === 0, 'slow move: no throw');

// 2. A fast flick (several fast frames) throws once, aimed where the hand was before the flick.
{
  const steps: Array<[number, number]> = [...still(10), [fast, fast], [fast, fast], [fast, fast], [fast, fast], ...still(5)];
  const t = run(new ThrowDetector(), steps);
  check(t.length === 1, `fast flick: exactly one throw (got ${t.length})`);
  // Before the flick the cursor was at (500, 500); after it, far away.
  check(t.length === 1 && Math.abs(t[0].aim.x - 500) < 1 && Math.abs(t[0].aim.y - 500) < 1, 'aim = where the hand was before the flick');
}

// 3. A single-frame jump (tracking jitter) is ignored.
check(run(new ThrowDetector(), [...still(10), [fast * 2, 0], ...still(10)]).length === 0, 'one-frame jitter: no throw');

// 4. Same flick far from the camera (small hand) still throws: speed is in hand-lengths.
{
  const steps: Array<[number, number]> = [...still(5), [fast, 0], [fast, 0], [fast, 0], ...still(3)];
  check(run(new ThrowDetector(), steps, { x: 0.5, y: 0.5 }, 0, HAND / 3).length === 1, 'small (far) hand: still throws');
}

// 5. Pushing the palm toward the camera (hand grows, centre still) is NOT a throw: that is the shield.
{
  const d = new ThrowDetector();
  let fired = 0;
  for (let i = 0; i < 20; i++) {
    const size = HAND * (1 + i * 0.15); // grows fast
    if (d.push(i * FRAME_MS, hand(0.5, 0.5, size), { x: 500, y: 500 })) fired++;
  }
  check(fired === 0, 'palm pushed forward (growing hand): no throw');
}

// 6. Cooldown: a second flick right after the first is ignored, a later one works.
{
  const d = new ThrowDetector();
  const flick: Array<[number, number]> = [[fast, 0], [fast, 0], [fast, 0]];
  const first = run(d, [...still(3), ...flick], { x: 0.3, y: 0.5 }, 0);
  const soon = run(d, [...still(2), ...flick.map(([a, b]) => [-a, b] as [number, number])], { x: 0.6, y: 0.5 }, 6 * FRAME_MS + 10);
  const later = run(d, [...still(2), ...flick], { x: 0.3, y: 0.5 }, 6 * FRAME_MS + CONFIG.THROW.cooldownMs + 500);
  check(first.length === 1 && soon.length === 0 && later.length === 1, `cooldown (${first.length}/${soon.length}/${later.length})`);
}

// 7. A gap in tracking (hand lost for a moment) resets the measurement instead of reading a huge jump.
{
  const d = new ThrowDetector();
  d.push(0, hand(0.2, 0.5), { x: 200, y: 500 });
  d.push(FRAME_MS, hand(0.2, 0.5), { x: 200, y: 500 });
  const a = d.push(FRAME_MS + 500, hand(0.8, 0.5), { x: 800, y: 500 }); // 0.5 s later, far away
  const b = d.push(2 * FRAME_MS + 500, hand(0.8, 0.5), { x: 800, y: 500 });
  check(!a && !b, 'tracking gap: no throw');
}

if (failures > 0) throw new Error(`${failures} throw checks failed`);
console.log('ALL throw checks passed');
