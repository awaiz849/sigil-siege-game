// TEMPORARY until integration (I1): runs a real round of Awaiz's game logic on Normal,
// restarting it when it ends, so the renderer always has enemies to show.
// Delete this file once main.ts runs the real game with screens.
import { createWorld, startRound, takeEvents, update } from '../game/world.ts';
import type { World } from '../game/types.ts';

export function createDemoWorld() {
  let world: World = startRound(createWorld('normal'));

  return {
    get world() {
      return world;
    },
    update(dt: number) {
      if (world.phase === 'WIN' || world.phase === 'LOSE') world = startRound(createWorld('normal'));
      update(world, dt);
      takeEvents(world); // nobody listens yet; drain so the list doesn't grow
    },
  };
}
