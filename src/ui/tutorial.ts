// First-time tutorial: how to draw each sigil. One page per spell: an animated demo traces the
// shape (start marker, moving pen, arrow at the end), then the player draws it for real and the
// recognizer checks it. A correct shape moves on; after a few misses a NEXT button appears so
// nobody gets stuck. The last page explains aiming, then the round starts.
// screens.ts owns the buttons (SKIP / NEXT / START) and shows this as the 'tutorial' screen.
import { CONFIG } from '../config.ts';
import { FONT_TEXT, FONT_TITLE } from './fonts.ts';
import { drawElementIcon, drawPalm, ELEMENT_CSS, GOLD, roundRect, type SigilShape } from './icons.ts';
import type { Element } from '../game/types.ts';

const DONE_KEY = 'sigil-siege-tutorial-done';
type Hero = 'wizard' | 'warden';
/** Each hero has his own "seen the tutorial" flag (the wizard keeps the old key). */
const doneKey = (hero: Hero) => (hero === 'wizard' ? DONE_KEY : `${DONE_KEY}-${hero}`);

type Step = {
  shape: SigilShape | 'palm';
  name: string;
  color: string;
  how: string;
  what: string;
  beats?: Element;
};

const WIZARD_STEPS: Step[] = [
  { shape: 'C', name: 'WATER', color: ELEMENT_CSS.water, how: 'Draw a C: start top right, curve round to the left, end bottom right', what: 'Hits one monster.', beats: 'fire' },
  { shape: 'L', name: 'FIRE', color: ELEMENT_CSS.fire, how: 'Draw a backwards L: straight DOWN, then LEFT', what: 'Hits one monster.', beats: 'nature' },
  { shape: 'v', name: 'NATURE', color: ELEMENT_CSS.nature, how: 'Draw a V: down to a point, then back up', what: 'Hits one monster.', beats: 'water' },
  { shape: 'zigzag', name: 'LIGHTNING', color: '#cfe6ff', how: 'Draw a W zigzag: down, up, down, up', what: 'Hits EVERY monster once. 10 s cooldown.' },
  { shape: 'line', name: 'WIND', color: '#b8f0d8', how: 'Draw one straight line across', what: 'Pushes walking monsters back. 12 s cooldown.' },
  { shape: 'palm', name: 'SHIELD', color: '#9fe6ff', how: 'Open your whole hand toward the camera', what: 'Blocks the skeleton archers’ arrows and stuns them.' },
];

/** Level 2: the Grand Warden's spells (cousins of the wizard's shapes). */
const WARDEN_STEPS: Step[] = [
  { shape: 'U', name: 'FROST NOVA', color: ELEMENT_CSS.water, how: 'Draw a U: down, round the bottom, back up', what: 'Hits one monster and splashes the ones next to it.', beats: 'fire' },
  { shape: 'Z', name: 'SOUL FLAME', color: ELEMENT_CSS.fire, how: 'Draw a Z: right, diagonal down-left, right again', what: 'Hits one monster, and it burns again 2 s later.', beats: 'nature' },
  { shape: 'peak', name: 'THORN SPIRE', color: ELEMENT_CSS.nature, how: 'Draw a peak: up to a point, then back down', what: 'Hits one monster and roots it: frozen, double damage.', beats: 'water' },
  { shape: 'M', name: 'ARCANE RAIN', color: '#c9a0ff', how: 'Draw an M: up, down, up, down', what: 'Hits EVERY monster and slows them. 10 s cooldown.' },
  { shape: 'line', name: 'TIME WARP', color: '#b8a0ff', how: 'Draw one straight line', what: 'Every walking monster moves at half speed for 5 s.' },
  { shape: 'palm', name: 'ETERNAL TOME', color: '#ffd86a', how: 'Open your whole hand toward the camera', what: 'The castle can’t be damaged for 3 s, and archers are blocked.' },
];
const STEPS_BY_HERO: Record<Hero, Step[]> = { wizard: WIZARD_STEPS, warden: WARDEN_STEPS };

/** Recognizer name for each tutorial shape (the same names the game uses). */
const SHAPE_NAME: Record<SigilShape, string> = { C: 'C', L: 'L', v: 'v', zigzag: 'zigzag', line: 'line', U: 'U', Z: 'Z', peak: 'peak', M: 'M' };

type Pt = { x: number; y: number };

/** The sigil as an evenly spaced point list in the direction it should be drawn (matches icons.ts). */
function sigilPath(shape: SigilShape, x: number, y: number, size: number): Pt[] {
  const h = size / 2;
  let pts: Pt[];
  if (shape === 'C') {
    // Half circle opening right: from the upper right, over the top, round the left, to the lower right.
    pts = [];
    for (let k = 0; k <= 40; k++) {
      const a = -Math.PI * 0.3 - (k / 40) * Math.PI * 1.4;
      pts.push({ x: x + h * 0.15 + Math.cos(a) * h * 0.8, y: y + Math.sin(a) * h * 0.8 });
    }
  } else if (shape === 'L') {
    pts = [{ x: x + h * 0.5, y: y - h * 0.9 }, { x: x + h * 0.5, y: y + h * 0.8 }, { x: x - h * 0.7, y: y + h * 0.8 }];
  } else if (shape === 'v') {
    pts = [{ x: x - h * 0.7, y: y - h * 0.8 }, { x, y: y + h * 0.8 }, { x: x + h * 0.7, y: y - h * 0.8 }];
  } else if (shape === 'zigzag') {
    pts = [-1, -0.5, 0, 0.5, 1].map((u, i) => ({ x: x + u * h, y: y + (i % 2 === 0 ? -0.7 : 0.7) * h }));
  } else if (shape === 'U') {
    pts = [{ x: x - h * 0.7, y: y - h * 0.8 }];
    for (let k = 0; k <= 30; k++) {
      const a = Math.PI - (k / 30) * Math.PI;
      pts.push({ x: x + Math.cos(a) * h * 0.7, y: y + Math.sin(a) * h * 0.7 });
    }
    pts.push({ x: x + h * 0.7, y: y - h * 0.8 });
  } else if (shape === 'Z') {
    pts = [{ x: x - h * 0.7, y: y - h * 0.8 }, { x: x + h * 0.7, y: y - h * 0.8 }, { x: x - h * 0.7, y: y + h * 0.8 }, { x: x + h * 0.7, y: y + h * 0.8 }];
  } else if (shape === 'peak') {
    pts = [{ x: x - h * 0.6, y: y + h * 0.8 }, { x, y: y - h * 0.8 }, { x: x + h * 0.6, y: y + h * 0.8 }];
  } else if (shape === 'M') {
    pts = [-1, -0.5, 0, 0.5, 1].map((u, i) => ({ x: x + u * h, y: y + (i % 2 === 0 ? 0.7 : -0.7) * h }));
  } else {
    pts = [{ x: x - h, y }, { x: x + h, y }];
  }
  return resample(pts, 60);
}

/** Evenly spaced points along a polyline (so the pen moves at a steady speed). */
function resample(pts: Pt[], n: number): Pt[] {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = seg.reduce((a, b) => a + b, 0);
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    let d = (k / (n - 1)) * total;
    let i = 0;
    while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
    const t = seg[i] ? Math.min(1, d / seg[i]) : 0;
    out.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t });
  }
  return out;
}

export function tutorialDone(hero: Hero = 'wizard'): boolean {
  try {
    return localStorage.getItem(doneKey(hero)) === '1';
  } catch {
    return false;
  }
}

function markDone(hero: Hero) {
  try {
    localStorage.setItem(doneKey(hero), '1');
  } catch {
    // storage blocked: the tutorial shows again next time, which is fine
  }
}

export function createTutorial() {
  let hero: Hero = 'wizard';
  let STEPS = WIZARD_STEPS;
  let index = 0; // STEPS.length = the final "ready" page
  let misses = 0;
  let feedback: { text: string; good: boolean; at: number } | null = null;
  let advanceAt = 0; // a correct answer moves on at this time (ms)
  let shownAt = performance.now();

  function goTo(i: number) {
    index = i;
    misses = 0;
    feedback = null;
    advanceAt = 0;
    shownAt = performance.now();
    if (index >= STEPS.length) markDone(hero);
  }

  function answer(ok: boolean, text: string) {
    const now = performance.now();
    feedback = { text, good: ok, at: now };
    if (ok) advanceAt = now + 1100;
    else misses++;
  }

  return {
    /** Start from the first page, with this hero's spells. */
    reset(next: Hero = 'wizard') {
      hero = next;
      STEPS = STEPS_BY_HERO[hero];
      goTo(0);
    },
    get onReadyPage() {
      return index >= STEPS.length;
    },
    /** NEXT shows once the player has missed a couple of times (so nobody gets stuck). */
    get canSkipStep() {
      return index < STEPS.length && misses >= 2 && advanceAt === 0;
    },
    skipStep() {
      goTo(index + 1);
    },
    skipAll() {
      goTo(STEPS.length);
    },

    /** A finished stroke while the tutorial shows: was it the shape on this page? */
    stroke(name: string | null) {
      const step = STEPS[index];
      if (!step || advanceAt) return;
      if (step.shape === 'palm') {
        answer(false, 'For the shield, just OPEN YOUR HAND (no drawing)');
        return;
      }
      if (name === SHAPE_NAME[step.shape]) answer(true, `${step.name}! Nice!`);
      else if (name === null) answer(false, 'Not recognized: draw it BIGGER and a bit slower');
      else answer(false, `That was ${STEPS.find((st) => st.shape === name)?.name ?? name}. Try the shape above`);
    },
    /** Open palm while the tutorial shows (the shield page). */
    palm() {
      const step = STEPS[index];
      if (step?.shape === 'palm' && !advanceAt) answer(true, 'SHIELD! Nice!');
    },

    update(now: number) {
      if (advanceAt && now >= advanceAt) goTo(index + 1);
    },

    draw(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, now: number, mouseMode: boolean) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pen = mouseMode
        ? 'Hold the LEFT mouse button to draw, let go to cast'
        : CONFIG.INPUT_MODE === 'pinch'
          ? 'PINCH thumb + index finger to draw, let go to cast'
          : 'POINT one finger to draw, two fingers to cast';

      if (index >= STEPS.length) {
        drawReady(ctx, W, H, s);
        return;
      }
      const step = STEPS[index];
      heading(ctx, W, H, s, `HOW TO CAST  ${index + 1} / ${STEPS.length}`);
      ctx.font = `${16 * s}px ${FONT_TEXT}`;
      ctx.fillStyle = '#e8e2ff';
      ctx.fillText(step.shape === 'palm' ? (mouseMode ? 'Mouse: press the RIGHT button' : 'No drawing needed') : pen, W / 2, H * 0.17);

      // Demo panel (left): the shape drawing itself, over and over.
      const box = 300 * s;
      const bx = W / 2 - box - 30 * s;
      const by = H * 0.22;
      roundRect(ctx, bx, by, box, box, 14 * s);
      ctx.fillStyle = 'rgba(13,11,36,0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,193,78,0.6)';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      const cx = bx + box / 2;
      const cy = by + box / 2;
      if (step.shape === 'palm') {
        const pulse = 1 + 0.08 * Math.sin(now / 250);
        drawPalm(ctx, cx, cy, 120 * s * pulse, step.color);
      } else {
        drawDemo(ctx, step.shape, cx, cy, box * 0.62, step.color, s, now - shownAt);
      }

      // Explanation (right).
      const tx = W / 2 + 20 * s;
      ctx.textAlign = 'left';
      ctx.font = `700 ${44 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = step.color;
      ctx.fillText(step.name, tx, by + 40 * s);
      ctx.font = `${17 * s}px ${FONT_TEXT}`;
      ctx.fillStyle = '#ffffff';
      wrap(ctx, step.how, tx, by + 92 * s, 330 * s, 24 * s);
      ctx.fillStyle = '#d8d2f0';
      wrap(ctx, step.what, tx, by + 160 * s, 330 * s, 24 * s);
      if (step.beats) {
        ctx.font = `${17 * s}px ${FONT_TITLE}`;
        ctx.fillStyle = GOLD;
        ctx.fillText('BEATS', tx, by + 205 * s);
        drawElementIcon(ctx, step.beats, tx + 82 * s, by + 204 * s, 26 * s);
        ctx.fillStyle = ELEMENT_CSS[step.beats];
        ctx.fillText(step.beats.toUpperCase(), tx + 104 * s, by + 205 * s);
      }

      // Your turn + feedback.
      ctx.textAlign = 'center';
      const fy = by + box + 44 * s;
      if (feedback) {
        const age = (now - feedback.at) / 1000;
        ctx.font = `700 ${26 * s * (1 + Math.max(0, 0.25 - age))}px ${FONT_TITLE}`;
        ctx.fillStyle = feedback.good ? '#6fe05a' : '#ff8a7a';
        ctx.fillText(feedback.text, W / 2, fy);
      } else {
        ctx.font = `${22 * s}px ${FONT_TITLE}`;
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 300);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(step.shape === 'palm' ? 'YOUR TURN: OPEN YOUR HAND' : 'YOUR TURN: DRAW IT ANYWHERE', W / 2, fy);
        ctx.globalAlpha = 1;
      }
      // Progress dots.
      for (let k = 0; k < STEPS.length; k++) {
        ctx.beginPath();
        ctx.arc(W / 2 + (k - (STEPS.length - 1) / 2) * 22 * s, fy + 36 * s, 6 * s, 0, Math.PI * 2);
        ctx.fillStyle = k < index ? '#6fe05a' : k === index ? GOLD : 'rgba(255,255,255,0.25)';
        ctx.fill();
      }
    },
  };

  function heading(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, text: string) {
    ctx.font = `700 ${34 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(text, W / 2, H * 0.1);
  }

  /** Last page: how aiming works, then start. */
  function drawReady(ctx: CanvasRenderingContext2D, W: number, H: number, s: number) {
    heading(ctx, W, H, s, 'YOU ARE READY!');
    const lines: Array<[string, string]> = [
      ['AIM', 'The spell hits the monster CLOSEST to where you draw.'],
      ['ELEMENTS', 'Each monster has a badge. Cast the element that BEATS it: double damage, and you get mana back.'],
      ['MANA', 'Every spell costs mana (blue bar). Spamming the wrong element runs you dry.'],
      ['HINTS', 'In wave 1 the right shape floats above each monster.'],
    ];
    lines.forEach(([k, v], i) => {
      const y = H * 0.24 + i * 62 * s;
      ctx.textAlign = 'right';
      ctx.font = `700 ${18 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = GOLD;
      ctx.fillText(k, W / 2 - 230 * s, y);
      ctx.textAlign = 'left';
      ctx.font = `${17 * s}px ${FONT_TEXT}`;
      ctx.fillStyle = '#ffffff';
      wrap(ctx, v, W / 2 - 210 * s, y, 520 * s, 22 * s);
    });
    // Element triangle: water > fire > nature > water.
    const ty = H * 0.24 + 4 * 62 * s + 10 * s;
    const order: Element[] = ['water', 'fire', 'nature', 'water'];
    order.forEach((e, i) => {
      const x = W / 2 + (i - 1.5) * 110 * s;
      drawElementIcon(ctx, e, x, ty, 30 * s);
      if (i < 3) {
        ctx.textAlign = 'center';
        ctx.font = `700 ${16 * s}px ${FONT_TITLE}`;
        ctx.fillStyle = '#d8d2f0';
        ctx.fillText('beats', x + 55 * s, ty);
      }
    });
    ctx.textAlign = 'center';
  }
}

/** The animated demo: faint guide, the part drawn so far, a pen dot, start marker and end arrow. */
function drawDemo(ctx: CanvasRenderingContext2D, shape: SigilShape, cx: number, cy: number, size: number, color: string, s: number, ms: number) {
  const pts = sigilPath(shape, cx, cy, size);
  const cycle = 2600;
  const p = Math.min(1, ((ms % cycle) / cycle) * 1.45); // draw, then hold the finished shape
  const upto = Math.max(1, Math.floor(p * (pts.length - 1)));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Faint dashed guide of the whole shape.
  ctx.setLineDash([6 * s, 8 * s]);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3 * s;
  polyline(ctx, pts, pts.length - 1);
  ctx.setLineDash([]);
  // The drawn part, glowing.
  ctx.shadowColor = color;
  ctx.shadowBlur = 16 * s;
  ctx.strokeStyle = color;
  ctx.lineWidth = 9 * s;
  polyline(ctx, pts, upto);
  ctx.shadowBlur = 0;
  // Start marker.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, 9 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 ${12 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = '#0D0B24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1', pts[0].x, pts[0].y + 1 * s);
  ctx.font = `${12 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('START', pts[0].x, pts[0].y - 20 * s);
  // Arrow head at the end once finished; otherwise the pen dot.
  const end = pts[upto];
  const prev = pts[Math.max(0, upto - 3)];
  if (p >= 1) {
    const a = Math.atan2(end.y - prev.y, end.x - prev.x);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(end.x + Math.cos(a) * 16 * s, end.y + Math.sin(a) * 16 * s);
    ctx.lineTo(end.x + Math.cos(a + 2.5) * 14 * s, end.y + Math.sin(a + 2.5) * 14 * s);
    ctx.lineTo(end.x + Math.cos(a - 2.5) * 14 * s, end.y + Math.sin(a - 2.5) * 14 * s);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 20 * s;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 10 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function polyline(ctx: CanvasRenderingContext2D, pts: Pt[], upto: number) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k <= upto; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.stroke();
}

/** Word-wrapped text, left-aligned at x. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
