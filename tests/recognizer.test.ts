// Recognizer test: generates "hand-drawn" strokes (noise, tilt, odd sizes, start points)
// and checks classify() names them correctly. Run: npm run test:recognizer
import type { Point } from '../src/events.ts';
import { classify } from '../src/recognizer/index.ts';

// Seeded random so failures are reproducible.
let seed = 12345;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);

/** Densify a polyline, then tilt, scale, move and jitter it like a shaky finger. */
function humanize(vertices: Point[], opts: { tilt?: number; sx?: number; sy?: number; noise?: number } = {}): Point[] {
  const dense: Point[] = [];
  for (let i = 1; i < vertices.length; i++) {
    for (let s = 0; s < 12; s++) {
      const t = s / 12;
      dense.push({
        x: vertices[i - 1].x + t * (vertices[i].x - vertices[i - 1].x),
        y: vertices[i - 1].y + t * (vertices[i].y - vertices[i - 1].y),
      });
    }
  }
  dense.push(vertices[vertices.length - 1]);
  const tilt = ((opts.tilt ?? between(-15, 15)) * Math.PI) / 180;
  const sx = opts.sx ?? between(80, 200);
  const sy = opts.sy ?? sx * between(0.8, 1.2);
  const noise = opts.noise ?? 0.03;
  const cx = between(200, 800);
  const cy = between(200, 500);
  return dense.map((p) => {
    const x = p.x + between(-noise, noise);
    const y = p.y + between(-noise, noise);
    return {
      x: cx + sx * (x * Math.cos(tilt) - y * Math.sin(tilt)),
      y: cy + sy * (x * Math.sin(tilt) + y * Math.cos(tilt)),
    };
  });
}

function circle(startDeg: number, clockwise: boolean, sweepDeg = 360): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = ((startDeg + (clockwise ? 1 : -1) * (i / 40) * sweepDeg) * Math.PI) / 180;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return pts;
}

/** C opening to the right: start near the top-right, go round the left side. */
function cArc(sweepDeg: number, reverse = false): Point[] {
  const pts = circle(-90 + (360 - sweepDeg) / 2, false, sweepDeg);
  return reverse ? pts.reverse() : pts;
}

/** Mirrored L corners: top of the upright, the corner, end of the foot. */
const TOP = { x: 0, y: -1 }, CORNER = { x: 0, y: 1 }, FOOT = { x: -1.2, y: 1 }; // mirrored L: foot to the left

const cases: Array<[string, Point[]]> = [];
for (let k = 0; k < 6; k++) {
  cases.push(['C', humanize(cArc(between(240, 290)))]); // classic C
  cases.push(['C', humanize(cArc(between(180, 220)))]); // half circle
  cases.push(['C', humanize(cArc(between(230, 280), true))]); // drawn bottom-up
  cases.push(['C', humanize(cArc(between(200, 260)), { noise: 0.08 })]); // shaky
  cases.push(['C', humanize(circle(between(0, 360), true))]); // full circle still = water
  cases.push(['C', humanize(circle(between(0, 360), false, 320))]); // nearly full circle
  cases.push(['L', humanize([TOP, CORNER, FOOT])]);
  cases.push(['L', humanize([TOP, CORNER, { x: -0.5, y: 1 }])]); // short foot
  cases.push(['L', humanize([TOP, CORNER, { x: -2, y: 1 }])]); // long foot
  cases.push(['L', humanize([FOOT, CORNER, TOP])]); // drawn backwards
  cases.push(['v', humanize([{ x: -0.6, y: -1 }, { x: 0, y: 1 }, { x: 0.6, y: -1 }])]);
  cases.push(['v', humanize([{ x: -0.3, y: -1 }, { x: 0, y: 1 }, { x: 0.3, y: -1 }])]); // narrow
  cases.push(['v', humanize([{ x: -1.2, y: -1 }, { x: 0, y: 1 }, { x: 1.2, y: -1 }])]); // wide
  cases.push(['v', humanize([{ x: 0.6, y: -1 }, { x: 0, y: 1 }, { x: -0.6, y: -1 }])]); // right-to-left
  cases.push(['zigzag', humanize([{ x: -1, y: -1 }, { x: -0.5, y: 1 }, { x: 0, y: -1 }, { x: 0.5, y: 1 }, { x: 1, y: -1 }])]);
  cases.push(['zigzag', humanize([{ x: 1, y: -1 }, { x: 0.5, y: 1 }, { x: 0, y: -1 }, { x: -0.5, y: 1 }, { x: -1, y: -1 }])]);
  cases.push(['zigzag', humanize([{ x: -1, y: -1 }, { x: -0.67, y: 1 }, { x: -0.33, y: -1 }, { x: 0, y: 1 }, { x: 0.33, y: -1 }, { x: 0.67, y: 1 }, { x: 1, y: -1 }])]);
  cases.push(['line', humanize([{ x: -1, y: 0 }, { x: 1, y: 0 }], { tilt: between(-60, 60), noise: 0.01 })]);
}

// Grand Warden (level 2): his own shapes, classified against his set only.
const wardenCases: Array<[string, Point[]]> = [];
for (let k = 0; k < 6; k++) {
  wardenCases.push(['C', humanize(cArc(between(240, 290)))]); // soul flame: C
  wardenCases.push(['C', humanize(cArc(between(180, 220)))]);
  wardenCases.push(['C', humanize(cArc(between(230, 280), true))]); // drawn bottom-up
  wardenCases.push(['O', humanize(circle(between(0, 360), true))]); // frost nova: circle
  wardenCases.push(['O', humanize(circle(between(0, 360), false))]);
  wardenCases.push(['O', humanize(circle(between(0, 360), true, 330), { noise: 0.06 })]); // small gap, shaky
  wardenCases.push(['peak', humanize([{ x: -0.45, y: 1 }, { x: 0, y: -1 }, { x: 0.45, y: 1 }])]);
  wardenCases.push(['peak', humanize([{ x: -0.25, y: 1 }, { x: 0, y: -1 }, { x: 0.25, y: 1 }])]); // narrow
  wardenCases.push(['peak', humanize([{ x: 0.45, y: 1 }, { x: 0, y: -1 }, { x: -0.45, y: 1 }])]); // right-to-left
  wardenCases.push(['M', humanize([{ x: -1, y: 1 }, { x: -0.5, y: -1 }, { x: 0, y: 1 }, { x: 0.5, y: -1 }, { x: 1, y: 1 }])]);
  wardenCases.push(['M', humanize([{ x: 1, y: 1 }, { x: 0.5, y: -1 }, { x: 0, y: 1 }, { x: -0.5, y: -1 }, { x: -1, y: 1 }])]);
  wardenCases.push(['line', humanize([{ x: 0, y: -1 }, { x: 0, y: 1 }], { tilt: between(-40, 40), noise: 0.01 })]);
}

let failures = 0;
const tally: Record<string, { ok: number; total: number; minScore: number }> = {};
for (const [expected, points, hero] of [
  ...cases.map(([n, p]) => [n, p, 'wizard'] as const),
  ...wardenCases.map(([n, p]) => [n, p, 'warden'] as const),
]) {
  const result = classify(points, hero);
  const row = (tally[expected] ??= { ok: 0, total: 0, minScore: 1 });
  row.total++;
  if (result.name === expected) {
    row.ok++;
    row.minScore = Math.min(row.minScore, result.score);
  } else {
    failures++;
    console.log(`FAIL expected ${expected}, got ${result.name} (score ${result.score.toFixed(2)})`);
  }
}

// Garbage should FIZZLE, not cast a spell.
let scribbleCasts = 0;
for (let k = 0; k < 20; k++) {
  const scribble: Point[] = [];
  for (let i = 0; i < 12; i++) scribble.push({ x: between(-1, 1), y: between(-1, 1) });
  if (classify(humanize(scribble)).name !== null) scribbleCasts++;
  if (classify(humanize(scribble), 'warden').name !== null) scribbleCasts++;
}

for (const [name, r] of Object.entries(tally)) {
  console.log(`${name.padEnd(9)} ${r.ok}/${r.total}  lowest correct score ${r.minScore.toFixed(2)}`);
}
console.log(`random scribbles that still cast a spell: ${scribbleCasts}/40 (wizard + warden)`);

const total = cases.length + wardenCases.length;
if (failures > 0) throw new Error(`${failures} of ${total} strokes misclassified`);
console.log(`ALL ${total} strokes classified correctly`);
