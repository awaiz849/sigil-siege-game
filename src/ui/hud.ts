// Fixed HUD on the overlay canvas:
//   top-left   castle HP bar
//   top-centre round timer + wave
//   top-right  score + combo
//   bottom-left spellbook: each sigil drawn as a real shape, what it casts, what it beats,
//               lightning cooldown, and the palm = shield reminder
import { CONFIG } from '../config.ts';
import type { World } from '../game/types.ts';
import { FONT_TEXT, FONT_TITLE } from './fonts.ts';
import { drawElementIcon, drawPalm, drawSigil, ELEMENT_CSS, GOLD, roundRect, type SigilShape } from './icons.ts';

const PANEL = 'rgba(13, 11, 36, 0.72)';
const BORDER = 'rgba(242, 193, 78, 0.55)';

export function drawHud(ctx: CanvasRenderingContext2D, world: World, now: number) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  // Scale everything with the window (designed at 1280x720).
  const s = Math.max(0.7, Math.min(1.6, Math.min(w / 1280, h / 720)));
  ctx.save();
  ctx.textBaseline = 'middle';
  drawCastleHp(ctx, world, s, now);
  drawClock(ctx, world, s, w);
  drawScore(ctx, world, s, w);
  drawSpellbook(ctx, world, s, h);
  ctx.restore();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, pw: number, ph: number, s: number) {
  roundRect(ctx, x, y, pw, ph, 8 * s);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2 * s;
  ctx.stroke();
}

function drawCastleHp(ctx: CanvasRenderingContext2D, world: World, s: number, now: number) {
  const x = 16 * s;
  const y = 16 * s;
  const pw = 300 * s;
  const ph = 58 * s;
  panel(ctx, x, y, pw, ph, s);

  // Little castle tower icon.
  ctx.fillStyle = GOLD;
  const ix = x + 14 * s;
  const iy = y + 14 * s;
  ctx.fillRect(ix, iy + 8 * s, 26 * s, 22 * s);
  for (let k = 0; k < 3; k++) ctx.fillRect(ix + k * 10 * s, iy + 2 * s, 6 * s, 7 * s);
  ctx.fillStyle = '#0D0B24';
  ctx.fillRect(ix + 10 * s, iy + 20 * s, 6 * s, 10 * s);

  const frac = Math.max(0, world.castleHp / CONFIG.CASTLE_HP);
  const bx = x + 52 * s;
  const by = y + 31 * s;
  const bw = pw - 66 * s;
  const bh = 14 * s;
  ctx.font = `${13 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = '#e8e2ff';
  ctx.textAlign = 'left';
  ctx.fillText('CASTLE', bx, y + 17 * s);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(world.castleHp)} / ${CONFIG.CASTLE_HP}`, bx + bw, y + 17 * s);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bx, by, bw, bh);
  // Green -> yellow -> red as HP drops; blinks when low.
  const color = frac > 0.6 ? '#6fe05a' : frac > 0.3 ? '#F2C14E' : '#ff4a3a';
  const blink = frac <= 0.3 && Math.floor(now / 250) % 2 === 0;
  ctx.fillStyle = blink ? '#ffffff' : color;
  ctx.fillRect(bx, by, bw * frac, bh);
  // Segment ticks every 10 HP.
  ctx.fillStyle = 'rgba(13,11,36,0.6)';
  for (let k = 1; k < 10; k++) ctx.fillRect(bx + (bw * k) / 10 - 1, by, 2, bh);
}

function drawClock(ctx: CanvasRenderingContext2D, world: World, s: number, w: number) {
  const left = Math.max(0, CONFIG.ROUND_SECONDS - world.time);
  const m = Math.floor(left / 60);
  const sec = Math.floor(left % 60);
  const pw = 150 * s;
  const ph = 66 * s;
  const x = w / 2 - pw / 2;
  const y = 12 * s;
  panel(ctx, x, y, pw, ph, s);
  ctx.textAlign = 'center';
  ctx.font = `700 ${30 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = left <= 10 ? '#ff6a5a' : '#ffffff';
  ctx.fillText(`${m}:${String(sec).padStart(2, '0')}`, w / 2, y + 25 * s);
  ctx.font = `${14 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(world.bossSpawned && !world.bossDefeated ? 'BOSS WAVE' : `WAVE ${world.wave} / 3`, w / 2, y + 51 * s);
}

function drawScore(ctx: CanvasRenderingContext2D, world: World, s: number, w: number) {
  const pw = 230 * s;
  const ph = 58 * s;
  const x = w - pw - 16 * s;
  const y = 16 * s;
  panel(ctx, x, y, pw, ph, s);
  ctx.textAlign = 'left';
  ctx.font = `${13 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('SCORE', x + 14 * s, y + 17 * s);
  ctx.font = `700 ${24 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(world.score.toLocaleString('en-US'), x + 14 * s, y + 40 * s);

  // Combo badge: grows and turns gold as it climbs.
  const c = world.combo;
  const r = (16 + c * 2) * s;
  const cx = x + pw - 34 * s;
  const cy = y + ph / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = c >= CONFIG.MAX_COMBO ? GOLD : c > 1 ? 'rgba(242,193,78,0.35)' : 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `700 ${(14 + c) * s}px ${FONT_TITLE}`;
  ctx.fillStyle = c >= CONFIG.MAX_COMBO ? '#0D0B24' : '#ffffff';
  ctx.fillText(`x${c}`, cx, cy + 1 * s);
}

type Row = { shape: SigilShape | 'palm'; name: string; color: string; beats?: keyof typeof ELEMENT_CSS; self?: keyof typeof ELEMENT_CSS };

const ROWS: Row[] = [
  { shape: 'circle', name: 'WATER', color: ELEMENT_CSS.water, self: 'water', beats: 'fire' },
  { shape: 'triangle', name: 'FIRE', color: ELEMENT_CSS.fire, self: 'fire', beats: 'nature' },
  { shape: 'v', name: 'NATURE', color: ELEMENT_CSS.nature, self: 'nature', beats: 'water' },
  { shape: 'zigzag', name: 'LIGHTNING', color: '#cfe6ff' },
  { shape: 'palm', name: 'SHIELD', color: '#9fe6ff' },
];

function drawSpellbook(ctx: CanvasRenderingContext2D, world: World, s: number, h: number) {
  const rowH = 30 * s;
  const pw = 250 * s;
  const ph = rowH * ROWS.length + 20 * s;
  const x = 16 * s;
  const y = h - ph - 16 * s;
  panel(ctx, x, y, pw, ph, s);

  ROWS.forEach((row, i) => {
    const cy = y + 10 * s + rowH * i + rowH / 2;
    const sx = x + 24 * s;
    const ready = row.shape !== 'zigzag' || world.lightningCooldown <= 0;
    ctx.globalAlpha = ready ? 1 : 0.45;

    if (row.shape === 'palm') drawPalm(ctx, sx, cy, 20 * s, row.color);
    else drawSigil(ctx, row.shape, sx, cy, 20 * s, row.color, 2.5 * s);

    ctx.textAlign = 'left';
    ctx.font = `${14 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = row.color;
    ctx.fillText(row.name, x + 46 * s, cy + 1 * s);

    ctx.font = `${13 * s}px ${FONT_TEXT}`;
    ctx.fillStyle = '#d8d2f0';
    if (row.self && row.beats) {
      // "beats [icon]"
      ctx.fillText('beats', x + 150 * s, cy + 1 * s);
      drawElementIcon(ctx, row.beats, x + 214 * s, cy, 18 * s);
    } else if (row.shape === 'zigzag') {
      ctx.fillText(ready ? 'hits all' : '', x + 150 * s, cy + 1 * s);
    } else {
      ctx.fillText('open palm', x + 150 * s, cy + 1 * s);
    }
    ctx.globalAlpha = 1;

    // Lightning cooldown: a ring that refills + seconds left.
    if (row.shape === 'zigzag' && !ready) {
      const frac = world.lightningCooldown / CONFIG.LIGHTNING_COOLDOWN_S;
      const rx = x + 190 * s;
      ctx.strokeStyle = 'rgba(207,230,255,0.25)';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.arc(rx, cy, 10 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#cfe6ff';
      ctx.beginPath();
      ctx.arc(rx, cy, 10 * s, -Math.PI / 2, -Math.PI / 2 + (1 - frac) * Math.PI * 2);
      ctx.stroke();
      ctx.font = `${13 * s}px ${FONT_TITLE}`;
      ctx.fillStyle = '#cfe6ff';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.ceil(world.lightningCooldown)}s`, rx + 16 * s, cy + 1 * s);
    }
  });
}
