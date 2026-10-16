// Canvas 2D overlay drawn on top of the 3D scene. It puts together:
//   world UI (badges, rings, floating texts, banners, flashes)  -> worldUi.ts
//   fixed HUD (castle HP, timer, score, spellbook)               -> hud.ts
//   the glowing stroke trail                                      -> trail.ts
//   the cursor, plus debug labels (mouse mode, recorder, recognizer result)
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

  function resize(width: number, height: number) {
    canvas.width = width;
    canvas.height = height;
  }

  /** Draw one frame. world/view are null before the game exists (e.g. loading). */
  function draw(world: World | null, view: View | null, now: number) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (world && view) {
      worldUi.draw(ctx, world, view, now);
      drawHud(ctx, world, now);
    }
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

    if (recordedCount > 0) {
      ctx.font = `14px ${FONT_TITLE}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ffb347';
      ctx.fillText(`${recordedCount} recorded templates loaded (Shift+R clears)`, w - 12, h - 12);
    }
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
