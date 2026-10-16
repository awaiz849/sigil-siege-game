// Spawn simulation: plays full 90 s rounds on each difficulty with a fake player and checks
// the spawn counts (~27 / 34 / 43 from CLAUDE.md), the boss pause and the enemy cap.
// Run: npm run test:spawn
import { CONFIG, type Difficulty } from '../src/config.ts';
import type { World } from '../src/game/types.ts';
import { createWorld, updateWorld } from '../src/game/world.ts';
import { removeEnemy } from '../src/game/enemies.ts';

/** Target spawns per round from CLAUDE.md, and how far off we allow. */
const TARGET: Record<Difficulty, number> = { easy: 27, normal: 34, hard: 43 };
const TOLERANCE = 2;
const SEEDS = 10;
const DT = 1 / 60;

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) {
    failures++;
    console.log(`FAIL ${name} ${detail}`);
  }
}

interface RoundLog {
  world: World;
  spawnTimes: number[];
  maxOnField: number;
  bossAt: number;
}

/**
 * One round. The fake player kills every enemy `killAfter` seconds after it spawns
 * (never the boss, so the round lasts the full 90 s). The castle can't fall, so we see every spawn.
 * frozen = enemies stop a little way in (clear of the spawn lanes) and never die, so the field fills to the cap.
 */
function playRound(difficulty: Difficulty, seed: number, killAfter: number, frozen = false): RoundLog {
  const world = createWorld(difficulty, seed);
  world.castleHp = Infinity;
  const log: RoundLog = { world, spawnTimes: [], maxOnField: 0, bossAt: -1 };
  while (world.phase === 'playing') {
    updateWorld(world, DT);
    for (const ev of world.events) {
      if (ev.type === 'spawn' && ev.enemyType !== 'boss') log.spawnTimes.push(world.time);
      if (ev.type === 'bossArrive') log.bossAt = world.time;
    }
    const regular = world.enemies.filter((e) => e.type !== 'boss').length;
    log.maxOnField = Math.max(log.maxOnField, regular);
    for (const e of world.enemies.slice()) {
      if (frozen && e.pos.z > CONFIG.FIELD.spawnZ + 2 * CONFIG.FIELD.laneClearDist) e.speed = 0;
      else if (e.type !== 'boss' && e.age >= killAfter) removeEnemy(world, e.id);
    }
  }
  return log;
}

const total = (w: World) => Object.values(w.stats.spawned).reduce((a, b) => a + b, 0);

console.log('difficulty  spawns (target)  imp/bird/warlock/boss  max on field (cap)');
for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
  const cap = CONFIG.DIFFICULTY[difficulty].maxEnemies;
  const counts: number[] = [];

  for (let seed = 1; seed <= SEEDS; seed++) {
    const log = playRound(difficulty, seed, 4);
    const w = log.world;
    counts.push(total(w));
    if (seed === 1) {
      const s = w.stats.spawned;
      console.log(
        `${difficulty.padEnd(10)}  ${String(total(w)).padStart(6)} (${TARGET[difficulty]})      ` +
          `${s.imp}/${s.bird}/${s.warlock}/${s.boss}`.padEnd(22) +
          `${log.maxOnField} (${cap})`,
      );
    }

    // Spawn count close to the CLAUDE.md table.
    check(`${difficulty} seed ${seed} spawn count`, Math.abs(total(w) - TARGET[difficulty]) <= TOLERANCE, `got ${total(w)}`);
    // Exactly one boss, on time.
    check(`${difficulty} one boss`, w.stats.spawned.boss === 1);
    check(`${difficulty} boss at ${CONFIG.BOSS.arriveS} s`, Math.abs(log.bossAt - CONFIG.BOSS.arriveS) < 2 * DT, `at ${log.bossAt}`);
    // Boss pause: nothing else spawns for 6 s after the boss.
    const inPause = log.spawnTimes.filter((t) => t >= log.bossAt && t < log.bossAt + CONFIG.BOSS_SPAWN_PAUSE_S);
    check(`${difficulty} boss pause`, inPause.length === 0, `spawns at ${inPause.join(', ')}`);
    // Minimum gap between spawns.
    const gaps = log.spawnTimes.slice(1).map((t, i) => t - log.spawnTimes[i]);
    check(`${difficulty} min gap`, gaps.every((g) => g >= CONFIG.SPAWN_MIN_GAP_S - DT), `min ${Math.min(...gaps)}`);
    // Cap respected.
    check(`${difficulty} cap`, log.maxOnField <= cap, `max ${log.maxOnField}`);
  }
  console.log(`            ${SEEDS} seeds: ${Math.min(...counts)}-${Math.max(...counts)} spawns`);

  // Nobody dies or moves: the field fills to the cap, then spawns wait.
  const full = playRound(difficulty, 1, Infinity, true);
  check(`${difficulty} field fills to the cap`, full.maxOnField === cap, `max ${full.maxOnField}`);
  check(`${difficulty} spawns wait at the cap`, total(full.world) === cap + 1, `${total(full.world)} spawns`);
  console.log(`            frozen field: ${total(full.world)} spawns (cap + boss), max ${full.maxOnField} on field`);
}

if (failures > 0) throw new Error(`${failures} spawn checks failed`);
console.log('ALL spawn checks passed');
