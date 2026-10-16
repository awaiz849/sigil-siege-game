// Fixed HUD on the overlay canvas:
//   top-left   castle HP bar, mana bar under it
//   top-centre round timer + wave
//   top-right  score + combo
//   bottom-left spellbook: each sigil drawn as a real shape, what it casts, what it beats,
//               its mana cost, lightning / wind cooldown, and the palm = shield reminder
import { CONFIG } from '../config.ts';
import type { Hero, World } from '../game/types.ts';
import { castleMaxHp } from '../game/difficulty.ts';
import { bossAlive } from '../game/world.ts';
import { FONT_TEXT, FONT_TITLE } from './fonts.ts';
import { drawElementIcon, drawPalm, drawSigil, ELEMENT_CSS, GOLD, roundRect, type SigilShape } from './icons.ts';

const PANEL = 'rgba(13, 11, 36, 0.72)';
const BORDER = 'rgba(242, 193, 78, 0.55)';

export function drawHud(ctx: CanvasRenderingContext2D, world: World, now: number) {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;
  // Scale everything with the window (designed at 1280x720).
  const s = Math.max(0.7, Math.min(1.6, Math.min(w / 1280, h / 720)));
  ctx.save();
  ctx.textBaseline = 'middle';
  drawCastleHp(ctx, world, s, now);
  drawMana(ctx, world, s, now);
  drawMeteor(ctx, world, s, now);
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

  const frac = Math.max(0, world.castleHp / castleMaxHp(world));
  const bx = x + 52 * s;
  const by = y + 31 * s;
  const bw = pw - 66 * s;
  const bh = 14 * s;
  ctx.font = `${13 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = '#e8e2ff';
  ctx.textAlign = 'left';
  ctx.fillText('CASTLE', bx, y + 17 * s);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(world.castleHp)} / ${castleMaxHp(world)}`, bx + bw, y + 17 * s);

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

const MANA_BLUE = '#5fb4ff';

/** Mana bar: blue, fills as it regenerates; blinks when even the cheapest spell can't be paid. */
function drawMana(ctx: CanvasRenderingContext2D, world: World, s: number, now: number) {
  const x = 16 * s;
  const y = 80 * s;
  const pw = 300 * s;
  const ph = 34 * s;
  panel(ctx, x, y, pw, ph, s);
  const frac = Math.max(0, world.mana / CONFIG.MANA.max);
  const cheapest = Math.min(CONFIG.MANA.cost.water, CONFIG.MANA.cost.fire, CONFIG.MANA.cost.nature);
  const empty = world.mana < cheapest;
  ctx.font = `${13 * s}px ${FONT_TITLE}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = empty && Math.floor(now / 250) % 2 === 0 ? '#ff6a5a' : MANA_BLUE;
  ctx.fillText('MANA', x + 14 * s, y + ph / 2 + 1 * s);
  const bx = x + 70 * s;
  const bw = pw - 84 * s;
  const by = y + 11 * s;
  const bh = 12 * s;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = MANA_BLUE;
  ctx.fillRect(bx, by, bw * frac, bh);
  // A tick at every cheap-spell's worth, so you can count casts left.
  ctx.fillStyle = 'rgba(13,11,36,0.7)';
  for (let k = cheapest; k < CONFIG.MANA.max; k += cheapest) ctx.fillRect(bx + (bw * k) / CONFIG.MANA.max - 1, by, 2, bh);
}

/** METEOR meter: fills from kills and perfect sigils; when full it glows and says how to throw. */
function drawMeteor(ctx: CanvasRenderingContext2D, world: World, s: number, now: number) {
  const x = 16 * s;
  const y = 120 * s;
  const pw = 300 * s;
  const ph = 30 * s;
  const full = world.ultimate >= CONFIG.METEOR.meterMax;
  panel(ctx, x, y, pw, ph, s);
  if (full) {
    // Pulsing orange outline when it's ready.
    roundRect(ctx, x, y, pw, ph, 8 * s);
    ctx.strokeStyle = `rgba(255, 140, 50, ${0.6 + 0.4 * Math.sin(now / 150)})`;
    ctx.lineWidth = 3 * s;
    ctx.stroke();
  }
  ctx.font = `${12 * s}px ${FONT_TITLE}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff9a4a';
  ctx.fillText('METEOR', x + 14 * s, y + ph / 2 + 1 * s);
  const bx = x + 84 * s;
  const bw = pw - 98 * s;
  const by = y + 10 * s;
  const bh = 10 * s;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = full ? (Math.floor(now / 200) % 2 ? '#ffd25a' : '#ff7a30') : '#ff7a30';
  ctx.fillRect(bx, by, (bw * Math.min(world.ultimate, CONFIG.METEOR.meterMax)) / CONFIG.METEOR.meterMax, bh);
  if (full) {
    ctx.font = `${11 * s}px ${FONT_TITLE}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('READY: FLICK or BOTH PALMS', bx + bw / 2, by + bh / 2 + 1 * s);
  }
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
  // Clock ran out but the boss still lives: the round goes on until it is killed.
  const overtime = left <= 0 && bossAlive(world);
  ctx.fillStyle = left <= 10 ? '#ff6a5a' : '#ffffff';
  ctx.fillText(overtime ? 'BOSS!' : `${m}:${String(sec).padStart(2, '0')}`, w / 2, y + 25 * s);
  ctx.font = `${14 * s}px ${FONT_TITLE}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(overtime ? 'KILL IT TO WIN' : bossAlive(world) ? 'BOSS WAVE' : `WAVE ${world.wave} / 3`, w / 2, y + 51 * s);
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

/** One spellbook row. cooldown: which cooldown it uses ("hits all" slot, push/slow slot, tome). */
type Row = {
  shape: SigilShape | 'palm';
  name: string;
  color: string;
  cost: number;
  note?: string;
  beats?: keyof typeof ELEMENT_CSS;
  self?: keyof typeof ELEMENT_CSS;
  cooldown?: 'all' | 'push' | 'tome';
};

const COST = CONFIG.MANA.cost;
const ROWS: Record<Hero, Row[]> = {
  wizard: [
    { shape: 'C', name: 'WATER', color: ELEMENT_CSS.water, cost: COST.water, self: 'water', beats: 'fire' },
    { shape: 'L', name: 'FIRE', color: ELEMENT_CSS.fire, cost: COST.fire, self: 'fire', beats: 'nature' },
    { shape: 'v', name: 'NATURE', color: ELEMENT_CSS.nature, cost: COST.nature, self: 'nature', beats: 'water' },
    { shape: 'zigzag', name: 'LIGHTNING', color: '#cfe6ff', cost: COST.lightning, note: 'hits all', cooldown: 'all' },
    { shape: 'line', name: 'WIND', color: '#b8f0d8', cost: COST.wind, note: 'push back', cooldown: 'push' },
    { shape: 'palm', name: 'SHIELD', color: '#9fe6ff', cost: COST.shield, note: 'open palm' },
  ],
  warden: [
    { shape: 'O', name: 'FROST', color: ELEMENT_CSS.water, cost: COST.frost, self: 'water', beats: 'fire' },
    { shape: 'C', name: 'FLAME', color: ELEMENT_CSS.fire, cost: COST.flame, self: 'fire', beats: 'nature' },
    { shape: 'peak', name: 'THORN', color: ELEMENT_CSS.nature, cost: COST.thorn, self: 'nature', beats: 'water' },
    { shape: 'M', name: 'ARCANE', color: '#c9a0ff', cost: COST.arcane, note: 'all + slow', cooldown: 'all' },
    { shape: 'line', name: 'TIME WARP', color: '#b8a0ff', cost: COST.timewarp, note: 'slow all', cooldown: 'push' },
    { shape: 'palm', name: 'TOME', color: '#ffd86a', cost: COST.tome, note: 'immune', cooldown: 'tome' },
  ],
};

/** Cooldown of a row's spell: seconds left and the full cooldown (null = none). */
function cooldownOf(row: Row, world: World): { left: number; total: number } | null {
  const warden = world.hero === 'warden';
  if (row.cooldown === 'all') return { left: world.lightningCooldown, total: warden ? CONFIG.WARDEN.arcaneCooldownS : CONFIG.LIGHTNING_COOLDOWN_S };
  if (row.cooldown === 'push') return { left: world.windCooldown, total: warden ? CONFIG.WARDEN.timewarpCooldownS : CONFIG.WIND_COOLDOWN_S };
  if (row.cooldown === 'tome') return { left: world.tomeCooldown, total: CONFIG.WARDEN.tomeCooldownS };
  return null;
}

function drawSpellbook(ctx: CanvasRenderingContext2D, world: World, s: number, h: number) {
  const rowH = 30 * s;
  const pw = 286 * s;
  const rows = ROWS[world.hero];
  const ph = rowH * rows.length + 20 * s;
  const x = 16 * s;
  const y = h - ph - 16 * s;
  panel(ctx, x, y, pw, ph, s);

  rows.forEach((row, i) => {
    const cy = y + 10 * s + rowH * i + rowH / 2;
    const sx = x + 24 * s;
    const cooldown = cooldownOf(row, world);
    const ready = (!cooldown || cooldown.left <= 0) && world.mana >= row.cost;
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
    } else if (row.note) {
      // Notes hide while the cooldown ring + seconds show in their place.
      const cd = cooldownOf(row, world);
      ctx.fillText(cd && cd.left > 0 ? '' : row.note, x + 150 * s, cy + 1 * s);
    }
    // Mana cost, right-aligned in mana blue.
    ctx.textAlign = 'right';
    ctx.font = `${13 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = MANA_BLUE;
    ctx.fillText(String(row.cost), x + pw - 12 * s, cy + 1 * s);
    ctx.globalAlpha = 1;

    // Lightning / wind cooldown: a ring that refills + seconds left.
    if (cooldown && cooldown.left > 0) {
      const frac = cooldown.left / cooldown.total;
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
      ctx.fillText(`${Math.ceil(cooldown.left)}s`, rx + 16 * s, cy + 1 * s);
    }
  });
}
