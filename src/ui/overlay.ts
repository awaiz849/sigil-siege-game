// Canvas 2D overlay drawn on top of the 3D scene. It puts together:
//   world UI (badges, rings, floating texts, banners, flashes)  -> worldUi.ts
//   fixed HUD (castle HP, timer, score, spellbook)               -> hud.ts
//   the glowing stroke trail                                      -> trail.ts
//   the cursor, plus debug labels (mouse mode, recorder, recognizer result)
import { CONFIG } from '../config.ts';
import { onCursor, type Pose } from '../events.ts';
import type { World } from '../game/types.ts';
import { FONT_TITLE } from './fonts.ts';
import { drawHud } from './hud.ts';
import { GOLD } from './icons.ts';
import { createTrail } from './trail.ts';
import { createWorldUi, type View } from './worldUi.ts';

export function createOverlay(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const trail = createTrail();
  const worldUi = createWorldUi();
  let cursor: { x: number; y: number; pose: Pose } | null = null;

  let mouseDebug = false;
  let message: { text: string; until: number } | null = null;
  let debugLabel: { text: string; x: number; y: number; until: number } | null = null;
  let recordedCount = 0;

  onCursor((x, y, pose) => (cursor = { x, y, pose }));

  // Draw at the screen's real pixel density (crisp text on high-DPI laptops). All drawing code
  // works in CSS pixels: we scale the context, and sizes come from canvas.clientWidth/Height.
  let dpr = 1;
  function resize(width: number, height: number) {
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.OVERLAY_MAX_PIXEL_RATIO);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  /** Draw one frame. world = null hides the HUD (menus). menu = screen layer drawn under the cursor. */
  function draw(world: World | null, view: View | null, now: number, menu: ((ctx: CanvasRenderingContext2D) => void) | null = null) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (world && view) {
      worldUi.draw(ctx, world, view, now);
      drawHud(ctx, world, now);
    }
    menu?.(ctx);
    trail.draw(ctx, now);
    drawCursor(now);

    // Recognizer result where the stroke ended (debug overlay only).
    if (debugLabel && now < debugLabel.until) {
      ctx.font = `14px ${FONT_TITLE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#cfe6ff';
      ctx.fillText(debugLabel.text, debugLabel.x, debugLabel.y + 40);
    }

    // Big label so mouse mode is never mistaken for the real hands-free demo.
    if (mouseDebug) {
      const bw = 420;
      const by = h - 64;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(w / 2 - bw / 2, by, bw, 48);
      ctx.font = `700 30px ${FONT_TITLE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff5a5a';
      ctx.fillText('MOUSE DEBUG MODE', w / 2, by + 25);
    }

    if (message && now < message.until) {
      ctx.font = `700 34px ${FONT_TITLE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(13,11,36,0.9)';
      ctx.strokeText(message.text, w / 2, h * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(message.text, w / 2, h * 0.5);
    }

    // First-cast tutorial: until the first kill in wave 1, tell new players exactly what to do.
    if (world && world.phase === 'PLAYING' && world.stats.kills === 0 && world.wave === 1) drawTutorial(world.time, now);

    if (recordedCount > 0) {
      ctx.font = `14px ${FONT_TITLE}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ffb347';
      ctx.fillText(`${recordedCount} recorded templates loaded (Shift+R clears)`, w - 12, h - 12);
    }
  }

  function drawTutorial(time: number, now: number) {
    const w = canvas.clientWidth;
    const s = Math.max(0.7, Math.min(1.5, Math.min(w / 1280, canvas.clientHeight / 720)));
    const lines = mouseDebug
      ? ['DRAG to draw the shape shown above a monster', 'release to cast  -  right button = shield']
      : ['PINCH thumb + index and draw the shape above a monster', 'RELEASE to cast  -  open palm = shield'];
    const y = 112 * s;
    const pulse = 0.85 + Math.sin(now / 250) * 0.15;
    ctx.save();
    ctx.globalAlpha = Math.min(1, time / 1.5) * pulse; // fade in after the wave banner
    ctx.font = `700 ${18 * s}px ${FONT_TITLE}`;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 40 * s;
    ctx.fillStyle = 'rgba(13, 11, 36, 0.8)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - bw / 2, y - 16 * s, bw, 58 * s, 10 * s);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = GOLD;
    ctx.fillText(lines[0], w / 2, y + 2 * s);
    ctx.font = `${14 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[1], w / 2, y + 26 * s);
    ctx.restore();
  }

  /** Gold dot while drawing, hollow ring while hovering, cyan ring for an open palm. */
  function drawCursor(now: number) {
    if (!cursor) return;
    const { x, y, pose } = cursor;
    ctx.save();
    if (pose === 'point') {
      ctx.fillStyle = '#fff4d6';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pose === 'palm') {
      ctx.strokeStyle = '#9fe6ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 22 + Math.sin(now / 120) * 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.restore();
  }

  return {
    ctx,
    worldUi,
    /** The drawing trail (main.ts tints it once the shape is recognized). */
    trail,
    resize,
    draw,
    setMouseDebug(on: boolean) {
      mouseDebug = on;
    },
    /** Short message in the middle of the screen (camera status, recorder). */
    flash(text: string, seconds = 1.2) {
      message = { text, until: performance.now() + seconds * 1000 };
    },
    /** Small label under the stroke end (recognizer name + score, debug). */
    showDebugLabel(text: string, x: number, y: number) {
      debugLabel = { text, x, y, until: performance.now() + 1500 };
    },
    /** How many recorded templates are loaded (shown so we never demo with stale ones). */
    setRecordedCount(n: number) {
      recordedCount = n;
    },
  };
}
