// Canvas drawings shared by the HUD, badges and hints:
//   element icons (flame / drop / leaf) and sigil shapes (circle / triangle / V / W zigzag / line).
// Icons are distinct SHAPES, not just colours: the flame has three tongues and a flat base so it
// never reads as a drop; the drop is round at the bottom with one point at the top.
import type { Element } from '../game/types.ts';

export const ELEMENT_CSS: Record<Element, string> = {
  fire: '#ff5a2e',
  water: '#3fa9ff',
  nature: '#6fe05a',
};

export const GOLD = '#F2C14E';
export const NAVY = '#0D0B24';

/** Element icon centred on (x, y), roughly `size` pixels tall. */
export function drawElementIcon(ctx: CanvasRenderingContext2D, element: Element, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20); // icons are designed in a 20x20 box centred on 0,0
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = NAVY;
  ctx.fillStyle = ELEMENT_CSS[element];
  ctx.beginPath();
  if (element === 'fire') {
    // Flame: flat-ish base, three tongues of different heights.
    ctx.moveTo(-7, 8);
    ctx.quadraticCurveTo(-10, 2, -6, -4);
    ctx.quadraticCurveTo(-5, 0, -3, 1);
    ctx.quadraticCurveTo(-4, -6, 1, -10);
    ctx.quadraticCurveTo(0, -4, 3, -2);
    ctx.quadraticCurveTo(4, -6, 6, -7);
    ctx.quadraticCurveTo(11, 1, 7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Bright inner core.
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.moveTo(-3, 8);
    ctx.quadraticCurveTo(-5, 3, -1, -2);
    ctx.quadraticCurveTo(0, 2, 2, 2);
    ctx.quadraticCurveTo(5, 4, 3, 8);
    ctx.closePath();
    ctx.fill();
  } else if (element === 'water') {
    // Drop: one point at the top, round bottom.
    ctx.moveTo(0, -10);
    ctx.bezierCurveTo(4, -4, 8, 0, 8, 3);
    ctx.arc(0, 3, 8, 0, Math.PI, false);
    ctx.bezierCurveTo(-8, 0, -4, -4, 0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Shine.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-3, 3, 1.6, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Leaf: tilted almond with a midrib and a stem.
    ctx.rotate(-0.6);
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(9, -2, 0, 9);
    ctx.quadraticCurveTo(-9, -2, 0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(13,11,36,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 11);
    ctx.stroke();
  }
  ctx.restore();
}

export type SigilShape = 'circle' | 'triangle' | 'v' | 'zigzag' | 'line';

/** Sigil outline centred on (x, y) inside a `size` box. Lightning is always a W, never a Z. */
export function drawSigil(ctx: CanvasRenderingContext2D, shape: SigilShape, x: number, y: number, size: number, color: string, lineWidth = 3) {
  const h = size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, h * 0.85, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(x, y - h * 0.9);
      ctx.lineTo(x + h * 0.9, y + h * 0.7);
      ctx.lineTo(x - h * 0.9, y + h * 0.7);
      ctx.closePath();
      break;
    case 'v':
      ctx.moveTo(x - h * 0.7, y - h * 0.8);
      ctx.lineTo(x, y + h * 0.8);
      ctx.lineTo(x + h * 0.7, y - h * 0.8);
      break;
    case 'zigzag':
      ctx.moveTo(x - h, y - h * 0.7);
      ctx.lineTo(x - h * 0.5, y + h * 0.7);
      ctx.lineTo(x, y - h * 0.7);
      ctx.lineTo(x + h * 0.5, y + h * 0.7);
      ctx.lineTo(x + h, y - h * 0.7);
      break;
    case 'line':
      ctx.moveTo(x - h, y);
      ctx.lineTo(x + h, y);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

/** The sigil that beats each element (for the wave-1 hints above enemies). */
export const COUNTER_SIGIL: Record<Element, SigilShape> = {
  fire: 'circle', // water beats fire
  nature: 'triangle', // fire beats nature
  water: 'v', // nature beats water
};

/** Rounded rectangle path helper. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Simple open-hand icon: palm + four fingers + thumb. */
export function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const u = size / 20;
  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, x - 6 * u, y - 2 * u, 12 * u, 11 * u, 3 * u);
  ctx.fill();
  for (let k = 0; k < 4; k++) {
    roundRect(ctx, x - 6 * u + k * 3.2 * u, y - 10 * u + (k === 0 || k === 3 ? 2 * u : 0), 2.6 * u, 10 * u, 1.3 * u);
    ctx.fill();
  }
  ctx.translate(x - 6 * u, y + 2 * u);
  ctx.rotate(-0.7);
  roundRect(ctx, -1.3 * u, -7 * u, 2.6 * u, 8 * u, 1.3 * u);
  ctx.fill();
  ctx.restore();
}
