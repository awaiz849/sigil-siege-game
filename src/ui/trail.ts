// The glowing trail your finger leaves while drawing a sigil.
// Each point fades out over TRAIL_FADE_MS, so the tail dissolves behind the fingertip,
// and the whole stroke fades away after the pen lifts.
// Gold while the shape is unknown; as soon as the half-drawn stroke is recognized (main.ts calls
// setSpell), it takes on the element's colour and sheds that element's particles:
// blue droplets that fall, red embers that rise, green leaves that drift, lightning sparks, wind streaks.
import { CONFIG } from '../config.ts';
import { onStrokePoint, onStrokeStart } from '../events.ts';

type TrailPoint = { x: number; y: number; t: number };
type Kind = 'water' | 'fire' | 'nature' | 'lightning' | 'wind';
type Particle = { kind: Kind; x: number; y: number; vx: number; vy: number; born: number; life: number; spin: number };

/** Glow colours per spell (outer, core) as "r,g,b"; null = the default gold. */
const TINT: Record<Kind, [string, string]> = {
  water: ['63,169,255', '210,238,255'],
  fire: ['255,90,46', '255,226,170'],
  nature: ['111,224,90', '226,255,200'],
  lightning: ['170,210,255', '250,252,255'],
  wind: ['184,240,216', '240,255,250'],
};
const GOLD: [string, string] = ['242,193,78', '255,244,214'];

export function createTrail() {
  let points: TrailPoint[] = [];
  let spell: Kind | null = null;
  const particles: Particle[] = [];
  let lastNow = performance.now();

  onStrokeStart(() => {
    points = [];
    spell = null;
  });
  onStrokePoint((x, y) => {
    const now = performance.now();
    points.push({ x, y, t: now });
    if (spell) emit(spell, x, y, now);
  });

  /** One or two particles of the recognized element at the pen. */
  function emit(kind: Kind, x: number, y: number, now: number) {
    const r = Math.random;
    const n = kind === 'lightning' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p: Particle = { kind, x: x + (r() - 0.5) * 10, y: y + (r() - 0.5) * 10, vx: 0, vy: 0, born: now, life: 700, spin: r() * 6 };
      if (kind === 'water') Object.assign(p, { vx: (r() - 0.5) * 40, vy: 20 + r() * 40, life: 800 }); // falls
      if (kind === 'fire') Object.assign(p, { vx: (r() - 0.5) * 30, vy: -60 - r() * 60, life: 650 }); // rises
      if (kind === 'nature') Object.assign(p, { vx: (r() - 0.5) * 70, vy: 15 + r() * 25, life: 1100 }); // drifts
      if (kind === 'lightning') Object.assign(p, { vx: (r() - 0.5) * 220, vy: (r() - 0.5) * 220, life: 220 }); // crackles
      if (kind === 'wind') Object.assign(p, { vx: 140 + r() * 80, vy: (r() - 0.5) * 20, life: 500 }); // blows
      particles.push(p);
    }
  }

  return {
    /** The shape being drawn was recognized as this spell (null = not yet / not sure). */
    setSpell(s: string | null) {
      spell = s && s in TINT ? (s as Kind) : null;
    },

    draw(ctx: CanvasRenderingContext2D, now: number) {
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      const fade = CONFIG.TRAIL_FADE_MS;
      // Drop fully faded points from the front.
      while (points.length > 0 && now - points[0].t > fade) points.shift();

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter'; // additive: overlapping glow gets brighter
      if (points.length >= 2) {
        const [outer, core] = spell ? TINT[spell] : GOLD;
        // Three passes, wide + faint to thin + bright: a cheap glow (no canvas blur, which is slow).
        for (const [width, rgb, alpha] of [
          [22, outer, 0.12],
          [11, outer, 0.35],
          [4, core, 0.95],
        ] as const) {
          ctx.lineWidth = width;
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const life = Math.max(0, 1 - (now - b.t) / fade); // 1 = fresh, 0 = gone
            ctx.strokeStyle = `rgba(${rgb},${(life * alpha).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      drawParticles(ctx, now, dt);
      ctx.restore();
    },
  };

  function drawParticles(ctx: CanvasRenderingContext2D, now: number, dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = (now - p.born) / p.life;
      if (age >= 1) {
        particles.splice(i, 1);
        continue;
      }
      if (p.kind === 'water') p.vy += 500 * dt; // gravity
      if (p.kind === 'nature') p.vx += Math.sin(now / 200 + p.spin) * 120 * dt; // flutter
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - age;
      const [outer, core] = TINT[p.kind];
      if (p.kind === 'water') {
        ctx.fillStyle = `rgba(${core},${a})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 2.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'fire') {
        ctx.fillStyle = `rgba(${outer},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5 * a + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${core},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 * a + 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'nature') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin + age * 6);
        ctx.fillStyle = `rgba(${outer},${a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Lightning sparks and wind streaks: short bright lines along their motion.
        ctx.strokeStyle = `rgba(${core},${a})`;
        ctx.lineWidth = p.kind === 'lightning' ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      }
    }
  }
}
