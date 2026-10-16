// Crowd rules: free spawn lanes and pushing enemies apart so they never walk through each other.
import { CONFIG } from '../config.ts';
import type { Enemy, World } from './types.ts';

/** Lanes (x positions) with nobody standing near their spawn point. */
export function freeLanes(world: World): number[] {
  const { lanes, spawnZ, laneClearDist } = CONFIG.FIELD;
  return lanes.filter((x) =>
    world.enemies.every((e) => Math.hypot(e.pos.x - x, e.pos.z - spawnZ) >= laneClearDist),
  );
}

/** Boss, stunned enemies and charging warlocks hold their ground. */
function canBePushed(e: Enemy): boolean {
  return e.type !== 'boss' && e.stunT === 0 && !(e.type === 'warlock' && e.state === 'charge');
}

/**
 * Push overlapping enemies apart (on the ground plane, x and z).
 * Birds fly above the ground enemies, so they only collide with other birds.
 */
export function pushApart(world: World): void {
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if ((a.type === 'bird') !== (b.type === 'bird')) continue;

      let dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const minDist = a.radius + b.radius;
      const overlap = minDist - Math.hypot(dx, dz);
      if (overlap <= 0) continue;

      const pushA = canBePushed(a);
      const pushB = canBePushed(b);
      if (!pushA && !pushB) continue;

      // Lined up exactly behind each other: tilt the push sideways so they slide around.
      if (Math.abs(dx) < CONFIG.PUSH_NUDGE) dx = b.id % 2 === 0 ? CONFIG.PUSH_NUDGE : -CONFIG.PUSH_NUDGE;
      const len = Math.hypot(dx, dz);
      const nx = dx / len;
      const nz = dz / len;

      // Share the push, or give it all to the one that can move.
      const shareA = pushA ? (pushB ? 0.5 : 1) : 0;
      const shareB = 1 - shareA;
      move(a, -nx * overlap * shareA, -nz * overlap * shareA);
      move(b, nx * overlap * shareB, nz * overlap * shareB);
    }
  }
}

/** Move an enemy, keeping it inside the field. */
function move(e: Enemy, dx: number, dz: number): void {
  const { halfWidth, spawnZ } = CONFIG.FIELD;
  e.pos.x = Math.max(-halfWidth, Math.min(halfWidth, e.pos.x + dx));
  e.pos.z = Math.max(spawnZ, e.pos.z + dz);
}
