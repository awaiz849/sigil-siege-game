// Enemy behaviour: walking to the wall, wall damage, birds diving, warlock charge/blast,
// boss element swaps. Pure logic on the World; no drawing.
import { CONFIG } from '../config.ts';
import type { Element, Enemy, EnemyType, World } from './types.ts';
import { ELEMENTS, damageCastle, pick } from './world.ts';
import { scaledSpeed } from './difficulty.ts';

/** Base stats (Normal difficulty) per enemy type. */
const STATS: Record<EnemyType, { hp: number; speed: number }> = {
  imp: CONFIG.IMP,
  bird: CONFIG.BIRD,
  warlock: CONFIG.WARLOCK,
  boss: CONFIG.BOSS,
};

/** Create an enemy at the far end of the field at sideways position x, and add it to the world. */
export function spawnEnemy(world: World, type: EnemyType, element: Element, x: number): Enemy {
  const stats = STATS[type];
  const enemy: Enemy = {
    id: world.nextEnemyId++,
    type,
    element,
    hp: stats.hp,
    maxHp: stats.hp,
    pos: { x, y: type === 'bird' ? CONFIG.BIRD_FLIGHT.flyY : 0, z: CONFIG.FIELD.spawnZ },
    speed: scaledSpeed(world, stats.speed),
    radius: CONFIG.ENEMY_RADIUS[type],
    state: 'walk',
    stateT: 0,
    stunT: 0,
    hint: false,
    nextElement: null,
    swapT: 0,
    age: 0,
  };
  world.enemies.push(enemy);
  world.stats.spawned[type]++;
  world.events.push({ type: 'spawn', enemyId: enemy.id, enemyType: type });
  if (type === 'boss') world.events.push({ type: 'bossArrive', enemyId: enemy.id });
  return enemy;
}

/** Remove an enemy from the world (killed or reached the wall). */
export function removeEnemy(world: World, id: number): void {
  world.enemies = world.enemies.filter((e) => e.id !== id);
}

/** z where warlocks stop to charge. */
export function warlockStopZ(): number {
  const { spawnZ, wallZ } = CONFIG.FIELD;
  return spawnZ + (wallZ - spawnZ) * CONFIG.WARLOCK_STOP_FRACTION;
}

/** Move and run every enemy for dt seconds. */
export function updateEnemies(world: World, dt: number): void {
  // Copy the list: enemies that reach the wall are removed while we loop.
  for (const enemy of world.enemies.slice()) {
    enemy.age += dt;
    if (enemy.type === 'boss') updateBossElement(world, enemy, dt);

    // Stunned enemies freeze completely (no walking, no charging).
    if (enemy.stunT > 0) {
      enemy.stunT = Math.max(0, enemy.stunT - dt);
      continue;
    }

    if (enemy.type === 'warlock' && enemy.state !== 'walk') {
      updateWarlockCasting(world, enemy, dt);
      continue;
    }

    // Walk toward the wall (+z).
    enemy.pos.z += enemy.speed * dt;
    if (enemy.type === 'bird') updateBirdHeight(enemy);
    if (enemy.type === 'warlock' && enemy.pos.z >= warlockStopZ()) {
      enemy.pos.z = warlockStopZ();
      startCharge(world, enemy);
    }

    if (enemy.pos.z >= CONFIG.FIELD.wallZ) {
      damageCastle(world, enemy.id, CONFIG.WALL_HIT_DAMAGE[enemy.type], 'wall');
      removeEnemy(world, enemy.id);
    }
  }
}

/** Birds fly high, then dive down over the last stretch before the wall. */
function updateBirdHeight(bird: Enemy): void {
  const { flyY, diveY, diveDist } = CONFIG.BIRD_FLIGHT;
  const distToWall = CONFIG.FIELD.wallZ - bird.pos.z;
  const t = Math.min(1, Math.max(0, 1 - distToWall / diveDist)); // 0 = far, 1 = at the wall
  bird.pos.y = flyY + (diveY - flyY) * t;
}

function startCharge(world: World, warlock: Enemy): void {
  warlock.state = 'charge';
  warlock.stateT = 0;
  world.events.push({ type: 'chargeStart', enemyId: warlock.id });
}

/** Warlock at its spot: charge for chargeS, blast the castle, wait rechargeS, charge again. */
function updateWarlockCasting(world: World, warlock: Enemy, dt: number): void {
  warlock.stateT += dt;
  if (warlock.state === 'charge' && warlock.stateT >= CONFIG.WARLOCK.chargeS) {
    damageCastle(world, warlock.id, CONFIG.WARLOCK.blastDamage, 'blast');
    warlock.state = 'recharge';
    warlock.stateT = 0;
  } else if (warlock.state === 'recharge' && warlock.stateT >= CONFIG.WARLOCK.rechargeS) {
    startCharge(world, warlock);
  }
}

/** Boss: every elementSwapS it switches element, announcing the next one swapWarningS before. */
function updateBossElement(world: World, boss: Enemy, dt: number): void {
  const { elementSwapS, swapWarningS } = CONFIG.BOSS;
  boss.swapT += dt;
  if (boss.nextElement === null && boss.swapT >= elementSwapS - swapWarningS) {
    boss.nextElement = pick(world, ELEMENTS.filter((el) => el !== boss.element));
    world.events.push({ type: 'bossWarning', enemyId: boss.id, nextElement: boss.nextElement });
  }
  if (boss.nextElement !== null && boss.swapT >= elementSwapS) {
    boss.element = boss.nextElement;
    boss.nextElement = null;
    boss.swapT = 0;
    world.events.push({ type: 'bossSwap', enemyId: boss.id, element: boss.element });
  }
}
