// Both-palms meteor gesture: two open palms pushed toward the camera (or held) fire once;
// one palm, a palm + a fist, or a slow approach does not. Run: npm run test:palms
import type { Landmark } from '../src/input/poses.ts';
import { PalmsPush } from '../src/input/palmsPush.ts';

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passes++;
  else {
    failures++;
    console.log(`FAIL ${name} ${detail}`);
  }
}

/** Upright hand (wrist at origin, fingers up), all four fingers open or curled; placed at (cx, cy) with size. */
function hand(open: boolean, cx: number, cy: number, size: number): Landmark[] {
  const lm: Landmark[] = new Array(21);
  lm[0] = { x: 0, y: 0 };
  lm[1] = { x: -0.1, y: -0.08 };
  lm[2] = { x: -0.18, y: -0.15 };
  lm[3] = { x: -0.24, y: -0.22 };
  lm[4] = { x: -0.28, y: -0.28 };
  [-0.12, -0.04, 0.04, 0.12].forEach((bx, k) => {
    const mcp = 5 + k * 4;
    lm[mcp] = { x: bx, y: -0.35 };
    lm[mcp + 1] = { x: bx, y: open ? -0.47 : -0.45 };
    lm[mcp + 2] = { x: bx, y: open ? -0.55 : -0.38 };
    lm[mcp + 3] = { x: bx, y: open ? -0.62 : -0.3 };
  });
  return lm.map((p) => ({ x: cx + p.x * size, y: cy + p.y * size }));
}

const cfg = { enabled: true, grow: 1.2, pushMs: 600, holdMs: 800, cooldownMs: 1500 };

// Push: both palms grow 30% in 300 ms -> fires, aimed between them.
{
  const d = new PalmsPush(cfg);
  let fired: Landmark | null = null;
  for (let t = 0; t <= 300; t += 33) {
    const s = 0.3 * (1 + (0.3 * t) / 300);
    fired ??= d.push(t, [hand(true, 0.3, 0.7, s), hand(true, 0.7, 0.7, s)]);
  }
  check('push fires', fired !== null);
  check('aim is between the hands', fired !== null && Math.abs(fired.x - 0.5) < 0.05, JSON.stringify(fired));
  // Still holding both palms: no second meteor until the hands drop.
  let again = false;
  for (let t = 330; t <= 3000; t += 33) if (d.push(t, [hand(true, 0.3, 0.7, 0.39), hand(true, 0.7, 0.7, 0.39)])) again = true;
  check('no repeat while held', !again);
  d.push(3100, [hand(true, 0.3, 0.7, 0.3)]); // one hand drops
  let rearmed = false;
  for (let t = 4700; t <= 5600; t += 33) if (d.push(t, [hand(true, 0.3, 0.7, 0.3), hand(true, 0.7, 0.7, 0.3)])) rearmed = true;
  check('fires again after dropping the hands (hold)', rearmed);
}

// Hold: both palms still for holdMs fires; shorter does not.
{
  const d = new PalmsPush(cfg);
  let early = false;
  for (let t = 0; t < 700; t += 33) if (d.push(t, [hand(true, 0.3, 0.7, 0.3), hand(true, 0.7, 0.7, 0.3)])) early = true;
  check('no fire before holdMs', !early);
  check('hold fires', d.push(820, [hand(true, 0.3, 0.7, 0.3), hand(true, 0.7, 0.7, 0.3)]) !== null);
}

// Not the gesture: one palm (that's the shield), palm + fist, slow approach.
{
  const one = new PalmsPush(cfg);
  let f1 = false;
  for (let t = 0; t <= 2000; t += 33) if (one.push(t, [hand(true, 0.5, 0.7, 0.3 + t * 0.0001)])) f1 = true;
  check('one palm never fires', !f1);
  const fist = new PalmsPush(cfg);
  let f2 = false;
  for (let t = 0; t <= 2000; t += 33) if (fist.push(t, [hand(true, 0.3, 0.7, 0.3), hand(false, 0.7, 0.7, 0.3)])) f2 = true;
  check('palm + fist never fires', !f2);
  const slow = new PalmsPush({ ...cfg, holdMs: 99999 });
  let f3 = false;
  for (let t = 0; t <= 2000; t += 33) {
    const s = 0.3 * (1 + (0.3 * t) / 2000); // +30% but over 2 s: too slow to be a push
    if (slow.push(t, [hand(true, 0.3, 0.7, s), hand(true, 0.7, 0.7, s)])) f3 = true;
  }
  check('slow approach is not a push', !f3);
}

if (failures > 0) throw new Error(`${failures} palms checks failed (${passes} passed)`);
console.log(`ALL ${passes} palms checks passed`);
