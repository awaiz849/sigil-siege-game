// Small live camera view in the bottom-right corner during play, so the player always sees
// their hand: mirrored image, hand skeleton, and what the game thinks the hand is doing.
import { onCursor, type Pose } from '../events.ts';
import type { HandInput } from '../input/handInput.ts';
import { drawHandPreview } from './debugOverlay.ts';
import { FONT_TITLE } from './fonts.ts';
import { GOLD, roundRect } from './icons.ts';

const POSE_LABEL: Record<Pose, { text: string; color: string }> = {
  point: { text: 'DRAWING', color: GOLD },
  two: { text: 'CAST!', color: '#ffffff' },
  palm: { text: 'SHIELD', color: '#9fe6ff' },
  other: { text: 'READY', color: '#b8b0d8' },
};

export function createCameraCorner() {
  let pose: Pose = 'other';
  onCursor((_x, _y, p) => (pose = p));

  return {
    draw(ctx: CanvasRenderingContext2D, hand: HandInput) {
      const W = ctx.canvas.clientWidth;
      const H = ctx.canvas.clientHeight;
      const s = Math.max(0.7, Math.min(1.4, Math.min(W / 1280, H / 720)));
      const w = 224 * s;
      const h = 168 * s;
      const x = W - w - 16 * s;
      const y = H - h - 40 * s;

      ctx.save();
      // Frame.
      roundRect(ctx, x - 4 * s, y - 4 * s, w + 8 * s, h + 34 * s, 10 * s);
      ctx.fillStyle = 'rgba(13, 11, 36, 0.8)';
      ctx.fill();
      const visible = hand.debug.handVisible;
      ctx.strokeStyle = visible ? 'rgba(242, 193, 78, 0.7)' : 'rgba(255, 110, 90, 0.8)';
      ctx.lineWidth = 2 * s;
      ctx.stroke();

      // Camera image (clipped to rounded corners).
      ctx.save();
      roundRect(ctx, x, y, w, h, 7 * s);
      ctx.clip();
      ctx.globalAlpha = 0.9;
      drawHandPreview(ctx, hand, x, y, w, h);
      ctx.restore();

      // Pose label under the image.
      const label = visible ? POSE_LABEL[pose] : { text: 'NO HAND', color: '#ff8a7a' };
      ctx.font = `700 ${13 * s}px ${FONT_TITLE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, x + w / 2, y + h + 14 * s);
      ctx.restore();
    },
  };
}
