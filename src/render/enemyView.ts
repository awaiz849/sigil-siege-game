// Keeps one 3D model per enemy in the World: creates models for new enemies, moves and animates
// them every frame, and plays a death or wall-crash effect when an enemy disappears.
// Reads the World only; never changes it.
import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { Enemy, World } from '../game/types.ts';
import { createEnemyModel, type EnemyModel } from './models.ts';
import { ELEMENT_COLOR } from './palette.ts';
import type { Particles } from './particles.ts';
import { radialTexture } from './environment.ts';

type View = {
  model: EnemyModel;
  shadow: THREE.Mesh;
  stunStars: THREE.Group;
  element: Enemy['element'];
  /** Body materials (not the bright glow ones): flashed white when the enemy is hit. */
  flashMats: Array<{ mat: THREE.MeshStandardMaterial; base: THREE.Color; baseIntensity: number }>;
  hp: number;
  hitT: number; // 1 right after a hit, fades to 0
  stepT: number; // time to the next footstep dust puff
  state: Enemy['state']; // last seen state (archer: charge -> recharge = arrow fired)
  last: Enemy; // last seen state (used for the death effect after removal)
  spawnT: number;
};

type Dying = { model: EnemyModel; shadow: THREE.Mesh; t: number; crash: boolean };

const SPAWN_TIME = 0.5;
const DEATH_TIME = 0.4;

/** Called when a skeleton archer looses its arrow at the castle (from = arrow tip). */
export type ShotHandler = (from: THREE.Vector3, enemy: Enemy) => void;

export function createEnemyView(scene: THREE.Scene, particles: Particles, onArcherShot: ShotHandler) {
  const views = new Map<number, View>();
  const dying: Dying[] = [];

  // Soft round shadow under each enemy grounds them visually (much cheaper than real shadows).
  const shadowGeo = new THREE.CircleGeometry(1, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowTex = radialTexture('rgba(0,0,0,0.65)', 'rgba(0,0,0,0)');
  const starGeo = new THREE.OctahedronGeometry(0.14);
  const starMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x9fe6ff, emissiveIntensity: 2 });

  function add(enemy: Enemy, t: number) {
    const model = createEnemyModel(enemy.type, enemy.element);
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.scale.setScalar(enemy.radius * 1.3);
    const stunStars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(starGeo, starMat);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      stunStars.add(s);
    }
    stunStars.position.y = model.height + 0.3;
    stunStars.visible = false;
    model.group.add(stunStars);
    scene.add(model.group, shadow);
    const flashMats = new Set<THREE.MeshStandardMaterial>();
    model.group.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m instanceof THREE.MeshStandardMaterial && m.emissiveIntensity < 1) flashMats.add(m);
    });
    const flash = [...flashMats].map((mat) => ({ mat, base: mat.emissive.clone(), baseIntensity: mat.emissiveIntensity }));
    views.set(enemy.id, { model, shadow, stunStars, element: enemy.element, flashMats: flash, hp: enemy.hp, hitT: 0, stepT: 0, state: enemy.state, last: { ...enemy, pos: { ...enemy.pos } }, spawnT: t });
    // Puff of dust where it appears.
    particles.burst(new THREE.Vector3(enemy.pos.x, 0.4, enemy.pos.z), 0x8a7a9a, 12, 2.5, 1, 0.6);
  }

  function remove(id: number, view: View) {
    views.delete(id);
    const e = view.last;
    const crash = e.pos.z >= CONFIG.FIELD.wallZ - 1.5; // reached the wall vs. killed
    const at = new THREE.Vector3(e.pos.x, e.pos.y + view.model.height * 0.5, e.pos.z);
    if (crash) particles.burst(at, 0xff4030, 30, 5, 2, 0.7);
    else {
      particles.burst(at, ELEMENT_COLOR[e.element], 40, 6, 3, 0.9);
      particles.burst(at, 0xffffff, 10, 3, 2, 0.4);
    }
    dying.push({ model: view.model, shadow: view.shadow, t: 0, crash });
  }

  return {
    /** Sync models with the World. t = time in seconds, dt = frame time. */
    update(world: World, t: number, dt: number) {
      const alive = new Set<number>();
      for (const enemy of world.enemies) {
        alive.add(enemy.id);
        let view = views.get(enemy.id);
        if (!view) {
          add(enemy, t);
          view = views.get(enemy.id)!;
        }
        view.last = { ...enemy, pos: { ...enemy.pos } };
        const g = view.model.group;
        g.position.set(enemy.pos.x, enemy.pos.y, enemy.pos.z);
        view.shadow.position.set(enemy.pos.x, 0.03, enemy.pos.z);

        // Spawn: rise out of the ground with a little overshoot.
        const s = Math.min(1, (t - view.spawnT) / SPAWN_TIME);
        const pop = s < 1 ? 1 - Math.pow(1 - s, 3) * (1 - 1.7 * s * (1 - s)) : 1;
        g.scale.setScalar(g.userData.baseScale ?? (g.userData.baseScale = g.scale.x));
        g.scale.multiplyScalar(Math.max(0.01, pop));

        // Element changes (boss) + the 1.5 s warning flicker toward the next element.
        const shown = enemy.nextElement && Math.floor(t * 8) % 2 === 0 ? enemy.nextElement : enemy.element;
        if (shown !== view.element) {
          view.model.setElement(shown);
          view.element = shown;
        }

        // Stunned: spinning stars above the head, model frozen and slightly tilted.
        view.stunStars.visible = enemy.stunT > 0;
        view.stunStars.rotation.y = t * 4;
        g.rotation.z = enemy.stunT > 0 ? Math.sin(t * 6) * 0.08 : 0;

        // Hit: white flash + a little stagger backwards.
        if (enemy.hp < view.hp) view.hitT = 1;
        view.hp = enemy.hp;
        view.hitT = Math.max(0, view.hitT - dt * 4);
        for (const f of view.flashMats) {
          if (view.hitT > 0) {
            f.mat.emissive.setRGB(1, 1, 1);
            f.mat.emissiveIntensity = f.baseIntensity + view.hitT * 0.9;
          } else if (f.mat.emissiveIntensity !== f.baseIntensity) {
            f.mat.emissive.copy(f.base);
            f.mat.emissiveIntensity = f.baseIntensity;
          } else {
            f.base.copy(f.mat.emissive); // keep up with boss element swaps
          }
        }
        g.position.z -= view.hitT * 0.35;
        g.rotation.x = -view.hitT * 0.25;

        // Archer: charge finished -> the arrow flies at the castle.
        if (view.state === 'charge' && enemy.state === 'recharge' && enemy.stunT <= 0 && view.model.arrowTip) {
          onArcherShot(view.model.arrowTip(new THREE.Vector3()), enemy);
        }
        view.state = enemy.state;

        // Hoof stomps for the boss's horse.
        if (enemy.type === 'boss' && enemy.state === 'walk' && enemy.stunT <= 0) {
          view.stepT -= dt;
          if (view.stepT <= 0) {
            const boss = enemy.type === 'boss';
            view.stepT = boss ? 0.55 : 0.33;
            particles.burst(new THREE.Vector3(enemy.pos.x, 0.15, enemy.pos.z), 0x7a6a80, boss ? 14 : 4, boss ? 2.5 : 1.2, 0.4, 0.5);
          }
        }

        view.model.animate(enemy, t, dt);
      }

      for (const [id, view] of views) if (!alive.has(id)) remove(id, view);

      // Death / crash animation: shrink + spin (killed) or squash into the wall (crash).
      for (let i = dying.length - 1; i >= 0; i--) {
        const d = dying[i];
        d.t += dt;
        const k = Math.min(1, d.t / DEATH_TIME);
        const g = d.model.group;
        const base = g.userData.baseScale ?? 1;
        if (d.crash) g.scale.set(base * (1 + k), base * (1 - k), base * (1 + k));
        else {
          g.scale.setScalar(base * (1 - k) * (1 + 0.3 * Math.sin(k * Math.PI)));
          g.rotation.y += dt * 12;
          g.position.y += dt * 2;
        }
        if (k >= 1) {
          scene.remove(g, d.shadow);
          d.model.dispose();
          (d.shadow.material as THREE.Material).dispose();
          dying.splice(i, 1);
        }
      }
    },

    /** Height of an enemy's model (for badge placement), or a default. */
    heightOf(id: number): number {
      return views.get(id)?.model.height ?? 2;
    },
  };
}
