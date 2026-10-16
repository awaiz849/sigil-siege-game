// Debug overlay (D key): camera preview with hand landmarks, current pose, pinch value, FPS.
// Also great for the judges: it shows the pipeline step by step.
import { CONFIG } from '../config.ts';
import type { HandInput } from '../input/handInput.ts';

// Bones between landmark ids, to draw the hand skeleton.
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // pinky + palm
];

export function createDebugOverlay() {
  let visible = false;
  let renderFps = 0;
  let lastFrame = 0;

  /** Call every frame (even when hidden) so the FPS value is ready. */
  function tick(now: number) {
    if (lastFrame > 0) renderFps += (1000 / (now - lastFrame) - renderFps) * 0.1;
    lastFrame = now;
  }

  function draw(ctx: CanvasRenderingContext2D, hand: HandInput | null) {
    if (!visible) return;
    const w = 320;
    const h = 240;
    const x0 = ctx.canvas.width - w - 12;
    const y0 = ctx.canvas.height - h - 12;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x0 - 8, y0 - 110, w + 16, h + 118);

    if (hand) {
      // Mirrored camera preview so it matches the player's movements.
      ctx.save();
      ctx.translate(x0 + w, y0);
      ctx.scale(-1, 1);
      ctx.drawImage(hand.video, 0, 0, w, h);
      ctx.restore();

      // Hand skeleton on the preview (mirrored like the video).
      const lm = hand.debug.landmarks;
      const px = (i: number) => x0 + (1 - lm[i].x) * w;
      const py = (i: number) => y0 + lm[i].y * h;
      if (lm.length === 21) {
        ctx.strokeStyle = '#7CFC9A';
        ctx.lineWidth = 2;
        for (const [a, b] of BONES) {
          ctx.beginPath();
          ctx.moveTo(px(a), py(a));
          ctx.lineTo(px(b), py(b));
          ctx.stroke();
        }
        ctx.fillStyle = '#F2C14E';
        for (let i = 0; i < 21; i++) ctx.fillRect(px(i) - 2, py(i) - 2, 4, 4);
      }

      // The active area that maps to the full screen.
      const m = CONFIG.HAND_EDGE_MARGIN;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.strokeRect(x0 + m * w, y0 + m * h, w * (1 - 2 * m), h * (1 - 2 * m));
    }

    const d = hand?.debug;
    const lines = [
      `render ${renderFps.toFixed(0)} fps   tracking ${d ? d.trackingFps.toFixed(0) : '-'} fps (${d ? d.detectMs.toFixed(1) : '-'} ms)`,
      `mode ${CONFIG.INPUT_MODE}   hand ${d?.handVisible ? 'yes' : 'no'}`,
      `pose raw ${d?.rawPose ?? '-'}   stable ${d?.stablePose ?? '-'}`,
      `pinch ${d ? d.pinch.toFixed(2) : '-'}  (on < ${CONFIG.PINCH_ON}, off > ${CONFIG.PINCH_OFF})`,
    ];
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    lines.forEach((t, i) => ctx.fillText(t, x0, y0 - 102 + i * 22));
    ctx.restore();
  }

  return {
    tick,
    draw,
    toggle: () => (visible = !visible),
    isVisible: () => visible,
  };
}
