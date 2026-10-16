// TEMPORARY until integration (I1): a World driven by Awaiz's real logic (updateWorld),
// but with a simple stand-in spawner so the renderer has every enemy type to show.
// Delete this file once waves.ts spawns enemies and main.ts runs the real game.
import { createWorld, updateWorld } from '../game/world.ts';
import { spawnEnemy } from '../game/enemies.ts';
import type { Element, EnemyType, World } from '../game/types.ts';
import { CONFIG } from '../config.ts';

const ORDER: Array<[EnemyType, Element]> = [
  ['imp', 'fire'],
  ['warlock', 'water'],
  ['bird', 'nature'],
  ['imp', 'water'],
  ['boss', 'fire'],
  ['imp', 'nature'],
  ['bird', 'fire'],
];

export function createDemoWorld() {
  let world: World = createWorld('normal', 1);
  let nextSpawn = 0;
  let k = 0;

  function spawnNext() {
    const [type, element] = ORDER[k % ORDER.length];
    const lanes = CONFIG.FIELD.lanes;
    spawnEnemy(world, type, element, lanes[(k * 2) % lanes.length]);
    k++;
  }

  return {
    get world() {
      return world;
    },
    update(dt: number) {
      // Endless demo: restart the round when it ends.
      if (world.phase !== 'playing') {
        world = createWorld('normal', 1);
        nextSpawn = 0;
      }
      if (world.time >= nextSpawn && world.enemies.length < 6) {
        spawnNext();
        nextSpawn = world.time + 2.5;
      }
      updateWorld(world, dt);
    },
  };
}
