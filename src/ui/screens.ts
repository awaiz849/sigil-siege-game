// Hands-free screens, all on the overlay canvas over the live 3D scene:
//   handCheck  show palm, then point (live camera preview + skeleton)   -> title
//   title      hover a difficulty button 0.8 s to pick it, hold palm 1.2 s to start
//   end        victory / defeat, score + stats, hold palm to play again, or hover to change difficulty
// Nothing here needs a click: buttons use dwell.ts, confirming uses palmHold.ts.
import { CONFIG, type Difficulty } from '../config.ts';
import { onCursor, type Pose } from '../events.ts';
import type { World } from '../game/types.ts';
import type { HandInput } from '../input/handInput.ts';
import { createDwell, type Rect } from '../input/dwell.ts';
import { createPalmHold } from '../input/palmHold.ts';
import { sound } from '../audio/sound.ts';
import { drawHandPreview } from './debugOverlay.ts';
import { FONT_TEXT, FONT_TITLE } from './fonts.ts';
import { drawPalm, drawSigil, ELEMENT_CSS, GOLD, NAVY, roundRect } from './icons.ts';

export type ScreenName = 'handCheck' | 'title' | 'end';
export type CameraState = 'loading' | 'ready' | 'failed';

type Opts = {
  hand: () => HandInput | null;
  mouseMode: () => boolean;
  camera: () => CameraState;
  onStart: (difficulty: Difficulty) => void;
};

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const BEST_KEY = 'sigil-siege-best';

export function createScreens(opts: Opts) {
  let screen: ScreenName | null = 'handCheck';
  let difficulty: Difficulty = 'normal';
  let endWorld: World | null = null;
  let newBest = false;
  let shownAt = performance.now();

  // ---- hand check state
  let pose: Pose = 'other';
  let step = 0; // 0 = show palm, 1 = point, 2 = done
  let heldS = 0;
  let lastNow = performance.now();
  onCursor((_x, _y, p) => (pose = p));

  // ---- layout (recomputed from the canvas size every frame)
  let W = 1280;
  let H = 720;
  const scale = () => Math.max(0.7, Math.min(1.6, Math.min(W / 1280, H / 720)));

  function difficultyRect(i: number): Rect {
    const s = scale();
    const bw = 210 * s;
    const bh = 70 * s;
    const gap = 28 * s;
    const total = bw * 3 + gap * 2;
    return { x: W / 2 - total / 2 + i * (bw + gap), y: H * 0.56, w: bw, h: bh };
  }
  function changeDifficultyRect(): Rect {
    const s = scale();
    return { x: W / 2 - 160 * s, y: H * 0.78, w: 320 * s, h: 56 * s };
  }
  const offscreen: Rect = { x: -1e6, y: -1e6, w: 0, h: 0 };

  // Dwell buttons: only "live" on their own screen.
  const difficultyButtons = DIFFICULTIES.map((d, i) =>
    createDwell(
      () => (screen === 'title' ? difficultyRect(i) : offscreen),
      () => {
        difficulty = d;
        sound.select();
      },
    ),
  );
  const changeButton = createDwell(
    () => (screen === 'end' ? changeDifficultyRect() : offscreen),
    () => {
      sound.select();
      show('title');
    },
  );

  // Hold palm: start (title) or play again (end).
  const palmHold = createPalmHold(() => {
    if (screen === 'title' || screen === 'end') {
      sound.start();
      screen = null;
      opts.onStart(difficulty);
    }
  });

  function show(name: ScreenName, world?: World) {
    screen = name;
    shownAt = performance.now();
    palmHold.reset();
    if (name === 'end' && world) {
      endWorld = world;
      newBest = saveBest(world);
    }
  }

  function saveBest(world: World): boolean {
    try {
      const best = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>;
      if (world.score > (best[world.difficulty] ?? 0)) {
        best[world.difficulty] = world.score;
        localStorage.setItem(BEST_KEY, JSON.stringify(best));
        return world.score > 0;
      }
    } catch {
      // storage blocked: no best score
    }
    return false;
  }

  function bestScore(d: Difficulty): number {
    try {
      return (JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>)[d] ?? 0;
    } catch {
      return 0;
    }
  }

  function updateHandCheck(dt: number) {
    // No camera: skip straight to the title (mouse debug mode).
    if (opts.camera() === 'failed' || opts.mouseMode()) {
      show('title');
      return;
    }
    if (opts.camera() !== 'ready') return;
    const want: Pose = step === 0 ? 'palm' : 'point';
    heldS = pose === want ? heldS + dt : 0;
    if (step < 2 && heldS >= CONFIG.HAND_CHECK_HOLD_S) {
      step++;
      heldS = 0;
      sound.select();
      if (step === 2) setTimeout(() => show('title'), 700);
    }
  }

  return {
    get current() {
      return screen;
    },
    show,

    update(now: number) {
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      if (screen === 'handCheck') updateHandCheck(dt);
      difficultyButtons.forEach((b) => b.update(now));
      changeButton.update(now);
      palmHold.update(now);
    },

    draw(ctx: CanvasRenderingContext2D, now: number) {
      if (!screen) return;
      W = ctx.canvas.width;
      H = ctx.canvas.height;
      const s = scale();
      const fade = Math.min(1, (now - shownAt) / 300);
      ctx.save();
      ctx.globalAlpha = fade;
      // Darken the 3D scene behind the menu (strongest at the top and bottom).
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(13,11,36,0.85)');
      g.addColorStop(0.5, 'rgba(13,11,36,0.45)');
      g.addColorStop(1, 'rgba(13,11,36,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (screen === 'handCheck') drawHandCheck(ctx, s, now);
      else if (screen === 'title') drawTitle(ctx, s, now);
      else drawEnd(ctx, s, now);
      ctx.restore();
    },
  };

  // ---------------------------------------------------------------- hand check

  function drawHandCheck(ctx: CanvasRenderingContext2D, s: number, now: number) {
    title(ctx, 'HAND CHECK', H * 0.12, 48 * s, GOLD);
    const hand = opts.hand();
    const pw = 400 * s;
    const ph = 300 * s;
    const px = W / 2 - pw / 2;
    const py = H * 0.2;

    roundRect(ctx, px - 8 * s, py - 8 * s, pw + 16 * s, ph + 16 * s, 12 * s);
    ctx.fillStyle = 'rgba(13,11,36,0.9)';
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    if (hand && opts.camera() === 'ready') drawHandPreview(ctx, hand, px, py, pw, ph);
    else {
      ctx.font = `${20 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Starting camera' + '.'.repeat(1 + Math.floor(now / 400) % 3), W / 2, py + ph / 2);
    }

    // The two steps, ticked off as they pass.
    const steps = [
      { text: 'Show your OPEN PALM', icon: 'palm' as const },
      { text: 'Now POINT with one finger', icon: 'point' as const },
    ];
    steps.forEach((st, i) => {
      const y = py + ph + (50 + i * 56) * s;
      const done = step > i;
      const active = step === i;
      ctx.globalAlpha = done || active ? 1 : 0.4;
      // Progress ring / tick.
      const cx = W / 2 - 200 * s;
      ctx.strokeStyle = done ? '#6fe05a' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.arc(cx, y, 16 * s, 0, Math.PI * 2);
      ctx.stroke();
      if (active && heldS > 0) {
        ctx.strokeStyle = '#9fe6ff';
        ctx.beginPath();
        ctx.arc(cx, y, 16 * s, -Math.PI / 2, -Math.PI / 2 + (heldS / CONFIG.HAND_CHECK_HOLD_S) * Math.PI * 2);
        ctx.stroke();
      }
      if (done) {
        ctx.strokeStyle = '#6fe05a';
        ctx.beginPath();
        ctx.moveTo(cx - 7 * s, y);
        ctx.lineTo(cx - 2 * s, y + 6 * s);
        ctx.lineTo(cx + 8 * s, y - 6 * s);
        ctx.stroke();
      }
      if (st.icon === 'palm') drawPalm(ctx, cx + 44 * s, y, 30 * s, '#9fe6ff');
      else drawPointer(ctx, cx + 44 * s, y, 30 * s, GOLD);
      ctx.textAlign = 'left';
      ctx.font = `${22 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = done ? '#6fe05a' : '#ffffff';
      ctx.fillText(st.text, cx + 76 * s, y + 1 * s);
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1;
    });

    // Help when the camera sees no hand.
    if (hand && opts.camera() === 'ready' && !hand.debug.handVisible) {
      ctx.font = `${16 * s}px ${FONT_TEXT}`;
      ctx.fillStyle = '#ffb0a0';
      ctx.fillText('No hand seen: raise your hand, step back to arm\'s length, face the light', W / 2, H - 40 * s);
    }
  }

  // ---------------------------------------------------------------- title

  function drawTitle(ctx: CanvasRenderingContext2D, s: number, now: number) {
    // Logo with a gentle float.
    const ly = H * 0.2 + Math.sin(now / 900) * 4 * s;
    title(ctx, 'SIGIL SIEGE', ly, 84 * s, GOLD);
    ctx.font = `${18 * s}px ${FONT_TEXT}`;
    ctx.fillStyle = '#e8e2ff';
    ctx.fillText('Draw sigils in the air to defend the wall.', W / 2, ly + 64 * s);
    ctx.fillText('The SHAPE picks the spell. WHERE you draw picks the target.', W / 2, ly + 90 * s);

    // A row of glowing sigils that "draw themselves" in a loop.
    const sig = [
      { shape: 'circle' as const, color: ELEMENT_CSS.water },
      { shape: 'triangle' as const, color: ELEMENT_CSS.fire },
      { shape: 'v' as const, color: ELEMENT_CSS.nature },
      { shape: 'zigzag' as const, color: '#cfe6ff' },
    ];
    sig.forEach((g, i) => {
      const x = W / 2 + (i - 1.5) * 90 * s;
      const pulse = 0.55 + 0.45 * Math.sin(now / 500 - i * 0.8);
      ctx.globalAlpha = pulse;
      drawSigil(ctx, g.shape, x, H * 0.44, 44 * s, g.color, 4 * s);
      ctx.globalAlpha = 1;
    });

    // Difficulty buttons (hover to pick).
    ctx.font = `${16 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = '#e8e2ff';
    ctx.fillText('HOVER TO CHOOSE DIFFICULTY', W / 2, H * 0.56 - 22 * s);
    DIFFICULTIES.forEach((d, i) => {
      const r = difficultyRect(i);
      button(ctx, r, d.toUpperCase(), difficulty === d, difficultyButtons[i].progress, s, `best ${bestScore(d)}`);
    });

    confirmPrompt(ctx, s, now, H * 0.82, 'TO START');
  }

  // ---------------------------------------------------------------- end

  function drawEnd(ctx: CanvasRenderingContext2D, s: number, now: number) {
    const w = endWorld;
    if (!w) return;
    const won = w.phase === 'WIN';
    const pop = 1 + Math.max(0, 0.3 - (now - shownAt) / 1000) ;
    title(ctx, won ? 'VICTORY!' : 'THE WALL FELL', H * 0.17, 80 * s * pop, won ? GOLD : '#ff6a5a');
    ctx.font = `${18 * s}px ${FONT_TEXT}`;
    ctx.fillStyle = '#e8e2ff';
    ctx.fillText(won ? (w.bossDefeated ? 'You defeated the boss!' : 'You held the wall for the whole siege!') : 'The castle has fallen... try again!', W / 2, H * 0.27);

    // Score card.
    const cw = 460 * s;
    const ch = 200 * s;
    const cx = W / 2 - cw / 2;
    const cy = H * 0.33;
    roundRect(ctx, cx, cy, cw, ch, 14 * s);
    ctx.fillStyle = 'rgba(13,11,36,0.9)';
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.font = `${16 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = '#e8e2ff';
    ctx.fillText('SCORE', W / 2, cy + 30 * s);
    ctx.font = `700 ${54 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(w.score.toLocaleString('en-US'), W / 2, cy + 74 * s);
    if (newBest && Math.floor(now / 400) % 2 === 0) {
      ctx.font = `700 ${16 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = GOLD;
      ctx.fillText('NEW BEST!', W / 2, cy + 108 * s);
    }
    const stats = [
      ['KILLS', String(w.stats.kills)],
      ['CASTLE', `${Math.ceil(w.castleHp)} HP`],
      ['TIME', `${Math.floor(w.time)} s`],
      ['MODE', w.difficulty.toUpperCase()],
    ];
    stats.forEach(([k, v], i) => {
      const x = cx + (cw / 4) * (i + 0.5);
      ctx.font = `${12 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = '#b8b0d8';
      ctx.fillText(k, x, cy + 145 * s);
      ctx.font = `${18 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(v, x, cy + 172 * s);
    });

    confirmPrompt(ctx, s, now, H * 0.66, 'TO PLAY AGAIN');
    button(ctx, changeDifficultyRect(), 'CHANGE DIFFICULTY', false, changeButton.progress, s);
  }

  // ---------------------------------------------------------------- widgets

  function title(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, color: string) {
    ctx.font = `700 ${size}px ${FONT_TITLE}`;
    ctx.lineJoin = 'round';
    // Hard pixel drop shadow, then outline, then fill.
    ctx.fillStyle = NAVY;
    ctx.fillText(text, W / 2 + size * 0.06, y + size * 0.06);
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = NAVY;
    ctx.strokeText(text, W / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  /** Dwell button: fills from the bottom while the cursor hovers. */
  function button(ctx: CanvasRenderingContext2D, r: Rect, label: string, selected: boolean, progress: number, s: number, sub?: string) {
    roundRect(ctx, r.x, r.y, r.w, r.h, 10 * s);
    ctx.fillStyle = selected ? 'rgba(242,193,78,0.25)' : 'rgba(13,11,36,0.85)';
    ctx.fill();
    if (progress > 0 && progress < 1) {
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 10 * s);
      ctx.clip();
      ctx.fillStyle = 'rgba(242,193,78,0.45)';
      ctx.fillRect(r.x, r.y + r.h * (1 - progress), r.w, r.h * progress);
      ctx.restore();
    }
    roundRect(ctx, r.x, r.y, r.w, r.h, 10 * s);
    ctx.strokeStyle = selected ? GOLD : 'rgba(242,193,78,0.45)';
    ctx.lineWidth = (selected ? 4 : 2) * s;
    ctx.stroke();
    ctx.font = `700 ${22 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = selected ? GOLD : '#ffffff';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 - (sub ? 8 * s : 0));
    if (sub) {
      ctx.font = `${12 * s}px ${FONT_TEXT}`;
      ctx.fillStyle = '#b8b0d8';
      ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + 16 * s);
    }
  }

  /** "Hold your open palm" with a palm icon whose ring fills up. */
  function confirmPrompt(ctx: CanvasRenderingContext2D, s: number, now: number, y: number, what: string) {
    const mouse = opts.mouseMode();
    const text = mouse ? `HOLD RIGHT MOUSE BUTTON ${what}` : `HOLD YOUR OPEN PALM ${what}`;
    ctx.font = `${22 * s}px ${FONT_TITLE}`;
    const tw = ctx.measureText(text).width;
    const ix = W / 2 - tw / 2 - 34 * s;
    const breathe = 0.75 + 0.25 * Math.sin(now / 300);
    ctx.globalAlpha = palmHold.progress > 0 ? 1 : breathe;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, W / 2 + 10 * s, y);
    drawPalm(ctx, ix, y, 30 * s, '#9fe6ff');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(159,230,255,0.3)';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.arc(ix, y, 22 * s, 0, Math.PI * 2);
    ctx.stroke();
    if (palmHold.progress > 0) {
      ctx.strokeStyle = '#9fe6ff';
      ctx.beginPath();
      ctx.arc(ix, y, 22 * s, -Math.PI / 2, -Math.PI / 2 + palmHold.progress * Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Pointing hand: index finger up, others folded. */
function drawPointer(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const u = size / 20;
  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, x - 6 * u, y - 1 * u, 12 * u, 10 * u, 3 * u);
  ctx.fill();
  roundRect(ctx, x - 6 * u, y - 11 * u, 3 * u, 11 * u, 1.5 * u);
  ctx.fill();
  ctx.restore();
}
