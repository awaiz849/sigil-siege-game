// Overlay drawn ON TOP of the 3D enemies (positions come from the renderer's projection):
//   badges (element icon + HP pips), wave-1 counter-shape hints, warlock charge bars,
//   aim-preview ring on the current target, red danger ring near the wall, boss element warning,
//   floating texts, banners, red edge glow on castle hits, lightning bolts and the shield flash.
import { CONFIG } from '../config.ts';
import { onStrokeEnd, onStrokePoint, onStrokeStart, type Point } from '../events.ts';
import { pickTarget, type SpellResult } from '../game/spells.ts';
import type { Enemy, FloatText, GameEvent, Vec3, World } from '../game/types.ts';
import { FONT_TITLE } from './fonts.ts';
import { COUNTER_SIGIL, drawElementIcon, drawSigil, ELEMENT_CSS, GOLD, roundRect } from './icons.ts';

/** What the overlay needs from the renderer. */
export type View = {
  project: (enemy: Enemy, heightFactor?: number) => { x: number; y: number } | null;
  projectPoint: (x: number, y: number, z: number) => { x: number; y: number } | null;
};

type Floating = FloatText & { born: number; at: Point | null };
type Banner = { text: string; sub: string; color: string; born: number };
type Bolt = { points: Point[]; born: number };

/** Colour of each spell's sigil flare. */
const SPELL_CSS: Record<string, string> = {
  water: '#3fa9ff',
  fire: '#ff5a2e',
  nature: '#6fe05a',
  lightning: '#cfe6ff',
  wind: '#e8f6ff',
  shield: '#9fe6ff',
};

const TONE_COLOR: Record<FloatText['tone'], string> = {
  great: GOLD,
  good: '#9fe6ff',
  bad: '#ff7a6a',
  info: '#ffffff',
};

export function createWorldUi() {
  let stroke: Point[] = [];
  let drawing = false;
  let lastStrokeCentre: Point | null = null;
  const floating: Floating[] = [];
  const bolts: Bolt[] = [];
  let banner: Banner | null = null;
  let hitGlowAt = -Infinity;
  let shieldAt = -Infinity;
  let lightningFlashAt = -Infinity;
  let windAt = -Infinity;
  let killFlashAt = -Infinity;
  let lastStroke: Point[] = [];
  let burn: { points: Point[]; color: string; born: number; fizzle: boolean; perfect: boolean } | null = null;

  onStrokeStart(() => {
    stroke = [];
    drawing = true;
  });
  onStrokePoint((x, y) => stroke.push({ x, y }));
  onStrokeEnd((points) => {
    drawing = false;
    lastStroke = points;
    lastStrokeCentre = strokeCentre(points);
  });

  /** Centre of a stroke = centre of its bounding box (same rule used for targeting). */
  function strokeCentre(points: Point[]): Point | null {
    if (points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  function addText(t: FloatText, now: number) {
    floating.push({ ...t, born: now, at: t.pos ? null : lastStrokeCentre });
  }

  return {
    strokeCentre,

    /** Game events from takeEvents(): texts, banners, hit glow. */
    handleEvents(events: GameEvent[], now: number) {
      for (const e of events) {
        if (e.type === 'floatText') addText(e, now);
        else if (e.type === 'castleHit') hitGlowAt = now;
        else if (e.type === 'waveStart') banner = { text: `WAVE ${e.wave}`, sub: e.wave === 1 ? 'Draw the sigil that beats each enemy' : e.wave === 2 ? 'Ghost horses incoming - they gallop fast!' : 'Skeleton archers: open your palm to block their arrows', color: GOLD, born: now };
        else if (e.type === 'bossArrive') banner = { text: 'BOSS INCOMING', sub: 'Kill it to win! It changes element - watch the warning', color: '#ff7a6a', born: now };
        else if (e.type === 'cleanWave') banner = { text: 'PERFECT DEFENSE', sub: `+${e.bonus}`, color: '#6fe05a', born: now };
      }
    },

    /** The sigil you just drew flares in the spell's colour (or crumbles on a fizzle).
     *  A PERFECT SIGIL burns gold, with sparkles rising off it. */
    burnStroke(result: SpellResult, now: number) {
      if (lastStroke.length < 2 || result.kind === 'ignored' || result.kind === 'nomana') return;
      const fizzle = result.kind === 'fizzle';
      const color = fizzle ? '#b06060' : result.perfect ? '#ffd86a' : SPELL_CSS[result.spell ?? ''] ?? '#ffffff';
      burn = { points: lastStroke, color, born: now, fizzle, perfect: result.perfect };
    },

    /** Visual extras for a cast (lightning bolts, shield flash). */
    handleCast(result: SpellResult, view: View, now: number) {
      if (result.spell === 'lightning' && result.kind !== 'cooldown' && result.hits.length > 0) {
        lightningFlashAt = now;
        for (const hit of result.hits) {
          const p = view.projectPoint(hit.pos.x, hit.pos.y + 1, hit.pos.z);
          if (p) bolts.push({ points: jaggedLine({ x: p.x + (Math.random() - 0.5) * 200, y: -20 }, p), born: now });
        }
      }
      if (result.spell === 'shield') shieldAt = now;
      if (result.kind === 'push') windAt = now;
      if (result.kind === 'kill') killFlashAt = now;
    },

    draw(ctx: CanvasRenderingContext2D, world: World, view: View, now: number) {
      const w = ctx.canvas.clientWidth;
      const h = ctx.canvas.clientHeight;
      const s = Math.max(0.7, Math.min(1.6, Math.min(w / 1280, h / 720)));

      // Draw far enemies first so near badges overlap them.
      const enemies = world.enemies.slice().sort((a, b) => a.pos.z - b.pos.z);
      for (const e of enemies) drawDangerRing(ctx, e, view, now, s);

      // Aim preview: who would be hit if the stroke ended now.
      if (drawing && stroke.length > 1) {
        const centre = strokeCentre(stroke)!;
        const id = pickTarget(world, centre, (e) => view.project(e));
        const target = world.enemies.find((e) => e.id === id);
        if (target) drawAimRing(ctx, target, view, now, s);
      }

      for (const e of enemies) drawBadge(ctx, e, view, now, s);
      drawBurn(ctx, now);
      drawFloating(ctx, view, now, s);
      drawBolts(ctx, now);
      drawFlashes(ctx, now, w, h);
      drawBanner(ctx, now, w, h, s);
    },
  };

  // ---------------------------------------------------------------- pieces

  function drawDangerRing(ctx: CanvasRenderingContext2D, e: Enemy, view: View, now: number, s: number) {
    const distToWall = CONFIG.FIELD.wallZ - e.pos.z;
    if (distToWall > CONFIG.DANGER_DIST) return;
    const feet = view.project(e, 0);
    if (!feet) return;
    const urgency = 1 - Math.max(0, distToWall) / CONFIG.DANGER_DIST; // 0..1
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 60, 40, ${0.45 + 0.45 * pulse * urgency})`;
    ctx.lineWidth = (3 + 3 * urgency) * s;
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y, (50 + 20 * urgency) * s, (16 + 6 * urgency) * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAimRing(ctx: CanvasRenderingContext2D, e: Enemy, view: View, now: number, s: number) {
    const mid = view.project(e, 0.5);
    const head = view.project(e, 1);
    const feet = view.project(e, 0);
    if (!mid || !head || !feet) return;
    const r = Math.max(28 * s, (feet.y - head.y) * 0.65);
    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate(now / 400);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3 * s;
    ctx.setLineDash([10 * s, 8 * s]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Four corner ticks pointing inward.
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(r + 10 * s, 0);
      ctx.lineTo(r - 4 * s, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBadge(ctx: CanvasRenderingContext2D, e: Enemy, view: View, now: number, s: number) {
    const head = view.project(e, 1);
    if (!head) return;
    const pip = 7 * s;
    const gap = 2 * s;
    const perRow = Math.min(e.maxHp, 8);
    const pipsW = perRow * pip + (perRow - 1) * gap;
    const icon = 20 * s;
    const bw = icon + 8 * s + pipsW + 14 * s;
    const bh = 26 * s;
    const bx = head.x - bw / 2;
    const by = head.y - bh - 10 * s;

    ctx.save();
    // Warlock charging: badge pulses red and a charge bar fills under it.
    const charging = e.type === 'warlock' && e.state === 'charge' && e.stunT <= 0;
    roundRect(ctx, bx, by, bw, bh, 6 * s);
    ctx.fillStyle = 'rgba(13, 11, 36, 0.78)';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = charging && Math.floor(now / 150) % 2 === 0 ? '#ff4a3a' : ELEMENT_CSS[e.element];
    ctx.stroke();

    drawElementIcon(ctx, e.element, bx + 6 * s + icon / 2, by + bh / 2, icon);

    // HP pips: filled = remaining HP (half pip for 0.5 damage), empty outline = lost.
    const px0 = bx + icon + 12 * s;
    for (let i = 0; i < e.maxHp; i++) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const px = px0 + col * (pip + gap);
      const py = by + bh / 2 - pip / 2 + (e.maxHp > 8 ? (row - 0.5) * (pip + gap) * 0.6 : 0);
      const fill = Math.max(0, Math.min(1, e.hp - i));
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, pip, pip);
      if (fill > 0) {
        ctx.fillStyle = '#ff5a6a';
        ctx.fillRect(px, py, pip * fill, pip);
      }
    }

    if (charging) {
      const p = Math.min(1, e.stateT / CONFIG.WARLOCK.chargeS);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bx, by + bh + 4 * s, bw, 5 * s);
      ctx.fillStyle = '#ff4a3a';
      ctx.fillRect(bx, by + bh + 4 * s, bw * p, 5 * s);
      ctx.font = `${12 * s}px ${FONT_TITLE}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb0a0';
      ctx.fillText('PALM!', head.x, by + bh + 20 * s);
    }

    if (e.stunT > 0) {
      ctx.font = `${12 * s}px ${FONT_TITLE}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fe6ff';
      ctx.fillText('STUNNED x2', head.x, by - 8 * s);
    }

    // Boss: next element warning, blinking.
    if (e.nextElement && Math.floor(now / 200) % 2 === 0) {
      const wy = by - 22 * s;
      ctx.font = `700 ${14 * s}px ${FONT_TITLE}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('NEXT', head.x - 2 * s, wy);
      drawElementIcon(ctx, e.nextElement, head.x + 16 * s, wy - 1 * s, 22 * s);
    }

    // Wave 1: faint hint of the sigil that beats this enemy.
    if (e.hint && !e.nextElement) {
      ctx.globalAlpha = 0.55;
      drawSigil(ctx, COUNTER_SIGIL[e.element], head.x, by - 22 * s, 24 * s, '#ffffff', 2.5 * s);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawFloating(ctx: CanvasRenderingContext2D, view: View, now: number, s: number) {
    const life = CONFIG.FLOAT_TEXT_S * 1000;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Stack texts that start at the same spot so they don't overlap.
    const used = new Map<string, number>();
    for (let i = floating.length - 1; i >= 0; i--) {
      const f = floating[i];
      const age = (now - f.born) / life;
      if (age >= 1) {
        floating.splice(i, 1);
        continue;
      }
      const at = f.pos ? projectVec(view, f.pos) : f.at;
      if (!at) continue;
      const key = `${Math.round(at.x / 40)},${Math.round(at.y / 40)}`;
      const stack = used.get(key) ?? 0;
      used.set(key, stack + 1);
      const rise = CONFIG.FLOAT_TEXT_RISE_PX * s * easeOut(age);
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : 1.1 - Math.min(0.1, (age - 0.15) * 0.3);
      const size = (f.tone === 'great' ? 30 : 24) * s * pop;
      ctx.globalAlpha = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;
      ctx.font = `700 ${size}px ${FONT_TITLE}`;
      const y = at.y - rise - stack * 30 * s;
      ctx.lineWidth = 5 * s;
      ctx.strokeStyle = 'rgba(13,11,36,0.9)';
      ctx.strokeText(f.text, at.x, y);
      ctx.fillStyle = TONE_COLOR[f.tone];
      ctx.fillText(f.text, at.x, y);
    }
    ctx.restore();
  }

  function drawBurn(ctx: CanvasRenderingContext2D, now: number) {
    if (!burn) return;
    const age = (now - burn.born) / (burn.perfect ? 800 : 450);
    if (age >= 1) {
      burn = null;
      return;
    }
    const c = strokeCentre(burn.points)!;
    const grow = burn.fizzle ? 1 - age * 0.15 : 1 + easeOut(age) * 0.25;
    ctx.save();
    ctx.globalCompositeOperation = burn.fizzle ? 'source-over' : 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.translate(c.x, c.y);
    ctx.scale(grow, grow);
    ctx.translate(-c.x, -c.y);
    for (const [width, alpha] of [
      [26, 0.18],
      [12, 0.45],
      [4, 1],
    ] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = burn.color;
      ctx.globalAlpha = alpha * (1 - age);
      ctx.beginPath();
      burn.points.forEach((p, k) => {
        // Fizzle: the stroke shakes apart.
        const jx = burn!.fizzle ? (Math.random() - 0.5) * 12 * age : 0;
        const jy = burn!.fizzle ? age * age * 40 : 0;
        if (k === 0) ctx.moveTo(p.x + jx, p.y + jy);
        else ctx.lineTo(p.x + jx, p.y + jy);
      });
      ctx.stroke();
    }
    ctx.restore();
    // PERFECT: golden four-point sparkles rising off the stroke.
    if (burn.perfect) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff2b0';
      burn.points.forEach((p, k) => {
        if (k % 3) return;
        const rise = age * (30 + (k * 37) % 40);
        const r = (5 + (k % 4)) * (1 - age);
        const x = p.x + Math.sin(k * 1.7) * 10 * age;
        const y = p.y - rise;
        ctx.globalAlpha = 1 - age;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 2);
        ctx.lineTo(x + r * 0.5, y);
        ctx.lineTo(x, y + r * 2);
        ctx.lineTo(x - r * 0.5, y);
        ctx.closePath();
        ctx.moveTo(x - r * 2, y);
        ctx.lineTo(x, y + r * 0.5);
        ctx.lineTo(x + r * 2, y);
        ctx.lineTo(x, y - r * 0.5);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    }
  }

  function drawBolts(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const age = (now - b.born) / 350;
      if (age >= 1) {
        bolts.splice(i, 1);
        continue;
      }
      for (const [width, color] of [
        [14, `rgba(120,170,255,${0.35 * (1 - age)})`],
        [4, `rgba(235,245,255,${1 - age})`],
      ] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath();
        b.points.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFlashes(ctx: CanvasRenderingContext2D, now: number, w: number, h: number) {
    // Red edge glow after a castle hit.
    const hit = (now - hitGlowAt) / (CONFIG.HIT_GLOW_S * 1000);
    if (hit < 1) edgeGlow(ctx, w, h, `rgba(255, 30, 20, ${0.55 * (1 - hit)})`);

    // Kill: a very short white flash (goes with the hit-stop in main.ts).
    const kf = (now - killFlashAt) / (CONFIG.KILL_FLASH_S * 1000);
    if (kf < 1) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * (1 - kf)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Lightning: quick white-blue screen flash.
    const lf = (now - lightningFlashAt) / 200;
    if (lf < 1) {
      ctx.fillStyle = `rgba(200, 225, 255, ${0.35 * (1 - lf)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Wind: pale streaks rushing away from the wall (up the screen).
    const wf = (now - windAt) / 600;
    if (wf < 1) {
      ctx.save();
      ctx.strokeStyle = `rgba(220, 255, 240, ${0.6 * (1 - wf)})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x = w * (0.1 + 0.1 * i);
        const y = h * (1 - wf) - (i % 3) * 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (i - 4) * 6, y - 90);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Shield: a cyan dome sweeping across the view.
    const sh = (now - shieldAt) / 500;
    if (sh < 1) {
      ctx.save();
      ctx.strokeStyle = `rgba(159, 230, 255, ${0.8 * (1 - sh)})`;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 1.05, w * (0.35 + 0.4 * sh), h * (0.45 + 0.5 * sh), 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      edgeGlow(ctx, w, h, `rgba(120, 210, 255, ${0.35 * (1 - sh)})`);
      ctx.restore();
    }
  }

  function drawBanner(ctx: CanvasRenderingContext2D, now: number, w: number, h: number, s: number) {
    if (!banner) return;
    const age = (now - banner.born) / (CONFIG.BANNER_S * 1000);
    if (age >= 1) {
      banner = null;
      return;
    }
    const alpha = age < 0.1 ? age / 0.1 : age > 0.75 ? 1 - (age - 0.75) / 0.25 : 1;
    const slide = (1 - easeOut(Math.min(1, age / 0.15))) * 40 * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = h * 0.3 - slide;
    // Dark band behind the text.
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(13,11,36,0)');
    grad.addColorStop(0.5, 'rgba(13,11,36,0.75)');
    grad.addColorStop(1, 'rgba(13,11,36,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 50 * s, w, 100 * s);
    ctx.font = `700 ${52 * s}px ${FONT_TITLE}`;
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = 'rgba(13,11,36,0.9)';
    ctx.strokeText(banner.text, w / 2, y - 10 * s);
    ctx.fillStyle = banner.color;
    ctx.fillText(banner.text, w / 2, y - 10 * s);
    ctx.font = `${18 * s}px ${FONT_TITLE}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(banner.sub, w / 2, y + 30 * s);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- helpers

function projectVec(view: View, v: Vec3) {
  return view.projectPoint(v.x, v.y + 2.2, v.z);
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Red/blue glow around the screen edges. */
function edgeGlow(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A zig-zag lightning path from a to b. */
function jaggedLine(a: Point, b: Point): Point[] {
  const pts: Point[] = [a];
  const steps = 9;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    pts.push({ x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 50, y: a.y + (b.y - a.y) * t });
  }
  pts.push(b);
  return pts;
}
