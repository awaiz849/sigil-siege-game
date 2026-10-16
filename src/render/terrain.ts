// Ground shape of the valley, shared by everything that stands on it (ground mesh, trees, river,
// fences, siege towers): a flat road down the middle, hills rising to the sides, and a river
// bed carved into the right-hand hills (CONFIG.SCENERY.river).
import * as THREE from 'three';
import { CONFIG } from '../config.ts';

/** Smooth-ish value noise for hills and colour variation. */
export function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 +
    Math.sin(z * 0.13 + x * 0.05) * 0.35 +
    Math.sin((x + z) * 0.31) * 0.15
  );
}

const ROAD_HALF = CONFIG.FIELD.halfWidth + 1.5;

/** 1 on the road, 0 on the grass (soft edge that wobbles a little). */
export function roadAmount(x: number, z: number): number {
  const edge = ROAD_HALF + Math.sin(z * 0.2) * 0.8;
  return 1 - THREE.MathUtils.smoothstep(Math.abs(x), edge - 1.5, edge + 1.5);
}

/** Ground height before the river is carved in. */
function baseHeight(x: number, z: number): number {
  const edge = ROAD_HALF + Math.sin(z * 0.2) * 0.8;
  const n = noise2(x, z);
  const hill = Math.max(0, Math.abs(x) - edge) * 0.08 * (1.5 + n);
  return hill * (1 - roadAmount(x, z)) + n * 0.15;
}

// The river as a smooth curve through the configured points (x, z).
const riverCurve = new THREE.CatmullRomCurve3(CONFIG.SCENERY.river.map(([x, z]) => new THREE.Vector3(x, 0, z)));
const RIVER_SAMPLES = riverCurve.getSpacedPoints(160);

/** Water surface height at a point on the river's centre line (a little below the ground there). */
export function waterHeight(x: number, z: number): number {
  return baseHeight(x, z) - 0.55;
}

/** The river's centre points (evenly spaced), for building the water ribbon. */
export function riverPoints(): THREE.Vector3[] {
  return RIVER_SAMPLES;
}

/** Distance from (x, z) to the river's centre line, and the nearest centre point. */
export function nearestRiver(x: number, z: number): { dist: number; cx: number; cz: number } {
  let best = Infinity;
  let cx = 0;
  let cz = 0;
  for (const p of RIVER_SAMPLES) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) {
      best = d;
      cx = p.x;
      cz = p.z;
    }
  }
  return { dist: Math.sqrt(best), cx, cz };
}

/** Final ground height: hills and road, with the river bed carved in. */
export function groundHeight(x: number, z: number): number {
  const h = baseHeight(x, z);
  const w = CONFIG.SCENERY.riverWidth;
  const r = nearestRiver(x, z);
  if (r.dist > w * 1.5) return h;
  const bed = waterHeight(r.cx, r.cz) - 0.45;
  return THREE.MathUtils.lerp(bed, h, THREE.MathUtils.smoothstep(r.dist, w * 0.45, w * 1.5));
}
