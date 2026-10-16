// Screens, all on the overlay canvas over the live 3D scene:
//   handCheck  show palm, then point (live camera preview + skeleton)   -> title
//   title      hover a difficulty button 0.8 s to pick it, hold palm 1.2 s (or hover START) to start
//   tutorial   how to draw every sigil (tutorial.ts); runs before the very first round, HOW TO PLAY replays it
//   pause      RESUME / RESTART / EXIT TO MENU; hold palm to resume
//   end        victory / defeat, score + stats, PLAY AGAIN / CHANGE DIFFICULTY, hold palm to play again
// Everything works hands-free (dwell.ts buttons + palmHold.ts). Mouse clicks and keys work too:
//   click a button; title: 1/2/3 or arrows pick, Enter/Space starts; in game: Esc/P pauses;
//   pause: Esc/P/Enter resumes; end: Enter plays again, Esc goes to the menu.
import { CONFIG, type Difficulty } from '../config.ts';
import { onCursor, type Pose } from '../events.ts';
import type { Hero, World } from '../game/types.ts';
import type { HandInput } from '../input/handInput.ts';
import { createDwell, type Rect } from '../input/dwell.ts';
import { createPalmHold } from '../input/palmHold.ts';
import { sound } from '../audio/sound.ts';
import { drawHandPreview } from './debugOverlay.ts';
import { FONT_TEXT, FONT_TITLE } from './fonts.ts';
import { drawPalm, drawSigil, ELEMENT_CSS, GOLD, NAVY, roundRect } from './icons.ts';
import { createTutorial, tutorialDone } from './tutorial.ts';

export type ScreenName = 'handCheck' | 'title' | 'tutorial' | 'pause' | 'end';
export type CameraState = 'loading' | 'ready' | 'failed';

type Opts = {
  hand: () => HandInput | null;
  mouseMode: () => boolean;
  camera: () => CameraState;
  onStart: (difficulty: Difficulty, hero: Hero) => void;
  /** The level / hero picked on the title changed (the 3D wall shows that hero). */
  onHero: (hero: Hero) => void;
  /** True while a round is running (the in-game pause button is live then). */
  playing: () => boolean;
  /** Pause menu: start the same difficulty over / leave the round for the title screen. */
  onRestart: () => void;
  onExit: () => void;
};

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const BEST_KEY = 'sigil-siege-best';
/** Best scores are kept per difficulty, and separately for level 2 (the wizard keeps the old keys). */
const bestKey = (d: Difficulty, hero: Hero) => (hero === 'wizard' ? d : `${hero}:${d}`);

export function createScreens(opts: Opts) {
  let screen: ScreenName | null = 'handCheck';
  let difficulty: Difficulty = 'normal';
  /** Level 1 = the wizard, level 2 = the Grand Warden. */
  let hero: Hero = 'wizard';
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
  /** Buttons stacked in the middle of the screen (pause menu, end screen). */
  function stackRect(i: number, y0: number): Rect {
    const s = scale();
    return { x: W / 2 - 160 * s, y: y0 + i * 70 * s, w: 320 * s, h: 56 * s };
  }
  function startRect(): Rect {
    const s = scale();
    return { x: W / 2 - 130 * s, y: H * 0.56 + 92 * s, w: 260 * s, h: 56 * s };
  }
  /** In-game pause button, top right under the score panel. */
  function pauseRect(): Rect {
    const s = scale();
    return { x: W - 16 * s - 150 * s, y: 84 * s, w: 150 * s, h: 44 * s };
  }
  /** Level buttons on the title, above the difficulty row. */
  function levelRect(i: number): Rect {
    const s = scale();
    const bw = 320 * s;
    const gap = 28 * s;
    return { x: W / 2 - bw - gap / 2 + i * (bw + gap), y: H * 0.37, w: bw, h: 58 * s };
  }
  /** Bottom-right corner button (SKIP TUTORIAL, HOW TO PLAY). */
  function cornerRect(): Rect {
    const s = scale();
    return { x: W - 16 * s - 240 * s, y: H - 16 * s - 50 * s, w: 240 * s, h: 50 * s };
  }
  const offscreen: Rect = { x: -1e6, y: -1e6, w: 0, h: 0 };

  // ---- tutorial: before the first round ever, or from HOW TO PLAY
  const tutorial = createTutorial();
  let startAfterTutorial = false;
  let wasReadyPage = false;
  function openTutorial(thenStart: boolean) {
    sound.select();
    startAfterTutorial = thenStart;
    tutorial.reset(hero);
    show('tutorial');
  }
  function finishTutorial() {
    if (startAfterTutorial) {
      startAfterTutorial = false;
      sound.start();
      screen = null;
      opts.onStart(difficulty, hero);
    } else {
      sound.select();
      show('title');
    }
  }

  // ---- actions (shared by hover, click and keys)
  function pickDifficulty(d: Difficulty) {
    difficulty = d;
    sound.select();
  }
  function start() {
    if (!tutorialDone(hero)) return openTutorial(true); // first time with this hero: learn his shapes first
    sound.start();
    screen = null;
    opts.onStart(difficulty, hero);
  }
  function pickHero(h: Hero) {
    if (h === hero) return;
    hero = h;
    sound.select();
    opts.onHero(h);
  }
  function pause() {
    if (screen !== null || !opts.playing()) return;
    sound.select();
    show('pause');
  }
  function resume() {
    sound.select();
    screen = null;
  }
  function restart() {
    sound.start();
    screen = null;
    opts.onRestart();
  }
  function exitToMenu() {
    sound.select();
    opts.onExit();
    show('title');
  }

  // ---- buttons: each is live only on its own screen; hover (dwell) or click presses it.
  type Button = { rect: () => Rect; label: string; action: () => void; dwell: ReturnType<typeof createDwell> };
  function makeButton(on: () => boolean, rect: () => Rect, label: string, action: () => void, seconds?: number): Button {
    const live = () => (on() ? rect() : offscreen);
    return { rect: live, label, action, dwell: createDwell(live, action, seconds) };
  }
  const difficultyButtons = DIFFICULTIES.map((d, i) =>
    makeButton(() => screen === 'title', () => difficultyRect(i), d.toUpperCase(), () => pickDifficulty(d)),
  );
  const startButton = makeButton(() => screen === 'title', startRect, 'START', start);
  const levelButtons = (['wizard', 'warden'] as const).map((h, i) =>
    makeButton(() => screen === 'title', () => levelRect(i), i === 0 ? 'LEVEL 1  WIZARD' : 'LEVEL 2  GRAND WARDEN', () => pickHero(h)),
  );
  const pauseButtons = [
    makeButton(() => screen === 'pause', () => stackRect(0, H * 0.38), 'RESUME', resume),
    makeButton(() => screen === 'pause', () => stackRect(1, H * 0.38), 'RESTART', restart),
    makeButton(() => screen === 'pause', () => stackRect(2, H * 0.38), 'EXIT TO MENU', exitToMenu),
  ];
  const endButtons = [
    makeButton(() => screen === 'end', () => stackRect(0, H * 0.72), 'PLAY AGAIN', start),
    makeButton(() => screen === 'end', () => stackRect(1, H * 0.72), 'CHANGE DIFFICULTY', () => {
      sound.select();
      show('title');
    }),
  ];
  const howToButton = makeButton(() => screen === 'title', cornerRect, 'HOW TO PLAY', () => openTutorial(false));
  const tutorialButtons = [
    makeButton(() => screen === 'tutorial' && !tutorial.onReadyPage, cornerRect, 'SKIP TUTORIAL', () => tutorial.skipAll()),
    makeButton(() => screen === 'tutorial' && tutorial.canSkipStep, () => stackRect(0, H * 0.86), 'NEXT', () => tutorial.skipStep()),
    makeButton(() => screen === 'tutorial' && tutorial.onReadyPage, () => stackRect(0, H * 0.7), "LET'S GO!", finishTutorial),
  ];
  // In game: a longer hover, so aiming near the corner never pauses by accident.
  const pauseGameButton = makeButton(() => screen === null && opts.playing(), pauseRect, 'II  PAUSE', pause, CONFIG.PAUSE_HOVER_S);
  const allButtons = [...difficultyButtons, ...levelButtons, startButton, howToButton, ...tutorialButtons, ...pauseButtons, ...endButtons, pauseGameButton];

  // Mouse: a left click on a live button presses it (overlay pixels = CSS pixels).
  window.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    for (const b of allButtons) {
      const r = b.rect();
      if (e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h) {
        b.action();
        return;
      }
    }
  });

  // Keyboard shortcuts for every screen (debug keys D / M / R stay in main.ts).
  window.addEventListener('keydown', (e) => {
    const confirm = e.key === 'Enter' || e.key === ' ';
    const back = e.key === 'Escape' || e.key === 'p' || e.key === 'P';
    if (screen === 'handCheck' && confirm) show('title');
    else if (screen === 'tutorial') {
      if (e.key === 'Escape') tutorial.skipAll();
      else if (confirm && tutorial.onReadyPage) finishTutorial();
      else if (confirm && tutorial.canSkipStep) tutorial.skipStep();
      else return;
    } else if (screen === 'title' && (e.key === 'h' || e.key === 'H')) openTutorial(false);
    else if (screen === 'title') {
      const i = DIFFICULTIES.indexOf(difficulty);
      if (e.key >= '1' && e.key <= '3') pickDifficulty(DIFFICULTIES[Number(e.key) - 1]);
      else if (e.key === 'ArrowLeft') pickDifficulty(DIFFICULTIES[Math.max(0, i - 1)]);
      else if (e.key === 'ArrowRight') pickDifficulty(DIFFICULTIES[Math.min(2, i + 1)]);
      else if (e.key === 'ArrowUp') pickHero('wizard');
      else if (e.key === 'ArrowDown') pickHero('warden');
      else if (confirm) start();
      else return;
    } else if (screen === 'pause' && (back || confirm)) resume();
    else if (screen === 'end' && confirm) start();
    else if (screen === 'end' && e.key === 'Escape') show('title');
    else if (screen === null && back) pause();
    else return;
    e.preventDefault();
  });
  // Switching tabs / windows mid-round pauses the game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  // Hold palm: start (title, tutorial's last page), play again (end) or resume (pause).
  const palmHold = createPalmHold(() => {
    if (screen === 'title' || screen === 'end') start();
    else if (screen === 'pause') resume();
    else if (screen === 'tutorial' && tutorial.onReadyPage) finishTutorial();
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
      const key = bestKey(world.difficulty, world.hero);
      if (world.score > (best[key] ?? 0)) {
        best[key] = world.score;
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
      return (JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>)[bestKey(d, hero)] ?? 0;
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
      if (screen === 'tutorial') {
        tutorial.update(now);
        // Reaching the last page: an open palm from the shield page must close before it can start the round.
        if (tutorial.onReadyPage && !wasReadyPage) palmHold.reset();
        wasReadyPage = tutorial.onReadyPage;
      }
      allButtons.forEach((b) => b.dwell.update(now));
      palmHold.update(now);
    },

    draw(ctx: CanvasRenderingContext2D, now: number) {
      if (!screen) return;
      W = ctx.canvas.clientWidth;
      H = ctx.canvas.clientHeight;
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
      else if (screen === 'tutorial') drawTutorial(ctx, s, now);
      else if (screen === 'pause') drawPause(ctx, s, now);
      else drawEnd(ctx, s, now);
      ctx.restore();
    },

    /** A finished stroke / an open palm while the tutorial shows (main.ts forwards them). */
    tutorialStroke(name: string | null) {
      tutorial.stroke(name);
    },
    tutorialPalm() {
      tutorial.palm();
    },

    /** During a round: the pause button (hover, click, or Esc / P). */
    drawGameButtons(ctx: CanvasRenderingContext2D) {
      if (screen !== null || !opts.playing()) return;
      W = ctx.canvas.clientWidth;
      H = ctx.canvas.clientHeight;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawButton(ctx, pauseGameButton, false, scale(), 18);
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
      CONFIG.INPUT_MODE === 'pinch'
        ? { text: 'Now PINCH thumb + index', icon: 'point' as const }
        : { text: 'Now POINT with one finger', icon: 'point' as const },
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
      else if (CONFIG.INPUT_MODE === 'pinch') drawPinch(ctx, cx + 44 * s, y, 30 * s, GOLD);
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

    // Level choice: level 1 the wizard, level 2 the Grand Warden (his own shapes and spells).
    levelButtons.forEach((b, i) => drawButton(ctx, b, hero === (i === 0 ? 'wizard' : 'warden'), s, 18));
    // The chosen hero's four sigils, glowing in turn, under the level buttons.
    const sig = hero === 'wizard'
      ? [{ shape: 'C' as const, color: ELEMENT_CSS.water }, { shape: 'L' as const, color: ELEMENT_CSS.fire }, { shape: 'v' as const, color: ELEMENT_CSS.nature }, { shape: 'zigzag' as const, color: '#cfe6ff' }]
      : [{ shape: 'U' as const, color: ELEMENT_CSS.water }, { shape: 'Z' as const, color: ELEMENT_CSS.fire }, { shape: 'peak' as const, color: ELEMENT_CSS.nature }, { shape: 'M' as const, color: '#c9a0ff' }];
    sig.forEach((g, i) => {
      const x = W / 2 + (i - 1.5) * 60 * s;
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 500 - i * 0.8);
      drawSigil(ctx, g.shape, x, H * 0.37 + 82 * s, 28 * s, g.color, 3 * s);
      ctx.globalAlpha = 1;
    });

    // Difficulty buttons (hover to pick).
    ctx.font = `${16 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = '#e8e2ff';
    ctx.fillText('HOVER OR CLICK TO CHOOSE DIFFICULTY', W / 2, H * 0.56 - 22 * s);
    DIFFICULTIES.forEach((d, i) => {
      const r = difficultyRect(i);
      button(ctx, r, d.toUpperCase(), difficulty === d, difficultyButtons[i].dwell.progress, s, `best ${bestScore(d)}`);
    });
    drawButton(ctx, startButton, true, s);
    drawButton(ctx, howToButton, false, s, 18);

    confirmPrompt(ctx, s, now, H * 0.56 + 186 * s, 'TO START', 'or press ENTER');
  }

  // ---------------------------------------------------------------- tutorial

  function drawTutorial(ctx: CanvasRenderingContext2D, s: number, now: number) {
    tutorial.draw(ctx, W, H, s, now, opts.mouseMode());
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    tutorialButtons.forEach((b, i) => {
      if (b.rect().x > -1e5) drawButton(ctx, b, i === 2, s, i === 0 ? 18 : 22);
    });
    if (tutorial.onReadyPage) confirmPrompt(ctx, s, now, H * 0.7 + 86 * s, startAfterTutorial ? 'TO START' : 'TO GO BACK', 'or press ENTER');
  }

  // ---------------------------------------------------------------- pause

  function drawPause(ctx: CanvasRenderingContext2D, s: number, now: number) {
    title(ctx, 'PAUSED', H * 0.24, 72 * s, GOLD);
    pauseButtons.forEach((b, i) => drawButton(ctx, b, i === 0, s));
    confirmPrompt(ctx, s, now, H * 0.38 + 240 * s, 'TO RESUME', 'or press ESC');
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
    ctx.fillStyle = 'rgba(13,11,36,0.72)'; // see-through: the victory / defeat scene shows behind it
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

    confirmPrompt(ctx, s, now, H * 0.62, 'TO PLAY AGAIN', 'or press ENTER');
    endButtons.forEach((b, i) => drawButton(ctx, b, i === 0, s));
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

  function drawButton(ctx: CanvasRenderingContext2D, b: Button, selected: boolean, s: number, fontPx = 22) {
    button(ctx, b.rect(), b.label, selected, b.dwell.progress, s, undefined, fontPx);
  }

  /** Dwell button: fills from the bottom while the cursor hovers. */
  function button(ctx: CanvasRenderingContext2D, r: Rect, label: string, selected: boolean, progress: number, s: number, sub?: string, fontPx = 22) {
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
    ctx.font = `700 ${fontPx * s}px ${FONT_TITLE}`;
    ctx.fillStyle = selected ? GOLD : '#ffffff';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 - (sub ? 8 * s : 0));
    if (sub) {
      ctx.font = `${12 * s}px ${FONT_TEXT}`;
      ctx.fillStyle = '#b8b0d8';
      ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + 16 * s);
    }
  }

  /** "Hold your open palm" with a palm icon whose ring fills up. */
  function confirmPrompt(ctx: CanvasRenderingContext2D, s: number, now: number, y: number, what: string, keyHint?: string) {
    const mouse = opts.mouseMode();
    const text = mouse ? `HOLD RIGHT MOUSE BUTTON ${what}` : `HOLD YOUR OPEN PALM ${what}`;
    if (keyHint) {
      ctx.font = `${13 * s}px ${FONT_TEXT}`;
      ctx.fillStyle = '#b8b0d8';
      ctx.fillText(keyHint, W / 2, y + 28 * s);
    }
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

/** Pinch: thumb and index tips touching (an "OK" ring) with the other fingers up. */
function drawPinch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const u = size / 20;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.6 * u;
  ctx.beginPath();
  ctx.arc(x - 2 * u, y + 2 * u, 4.5 * u, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 3; k++) {
    roundRect(ctx, x + 1.5 * u + k * 3 * u, y - 10 * u + k * 0.8 * u, 2.4 * u, 10 * u, 1.2 * u);
    ctx.fill();
  }
  ctx.restore();
}
