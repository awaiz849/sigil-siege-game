// The castle catches fire as it gets damaged: each fire spot (towers, roofs, merlons) lights up when
// the castle's HP drops below its threshold and grows as HP keeps falling, with dark smoke rising
// from it. A new round (full HP) puts everything out. Sprites only (bloom makes the flames glow).
import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { radialTexture, WALL_TOP } from './environment.ts';

type Spot = { pos: THREE.Vector3; below: number; size: number };

/** Where fires break out, and below which castle HP fraction each one starts. */
function spots(): Spot[] {
  const towerX = CONFIG.LANDMARKS.towerX;
  const towerZ = CONFIG.FIELD.wallZ - CONFIG.LANDMARKS.towerForward;
  const front = towerZ + 1.9; // the side of the towers the camera sees
  const gap = CONFIG.CAMERA.crenelHalfWidth;
  const merlonY = WALL_TOP + 0.55 + 1.25;
  const merlonZ = CONFIG.FIELD.wallZ + 0.4;
  return [
    { pos: new THREE.Vector3(towerX - 0.4, 3.4, front + 0.2), below: 0.7, size: 2.4 }, // right tower, low window
    { pos: new THREE.Vector3(-towerX + 1.2, 9.6, towerZ + 1.9), below: 0.55, size: 3.4 }, // left tower roof
    { pos: new THREE.Vector3(-(gap + 0.65), merlonY, merlonZ), below: 0.45, size: 1.2 }, // merlon left of the wizard
    { pos: new THREE.Vector3(towerX - 1.2, 9.8, towerZ + 1.9), below: 0.35, size: 3.4 }, // right tower roof
    { pos: new THREE.Vector3(gap + 5.25, merlonY, merlonZ), below: 0.3, size: 1.3 }, // right merlon
    { pos: new THREE.Vector3(-towerX + 0.4, 3.2, front + 0.2), below: 0.2, size: 2.4 }, // left tower, low window
    { pos: new THREE.Vector3(gap + 2.95, merlonY, merlonZ), below: 0.12, size: 1.2 }, // merlon right of the gap
  ];
}

export function createCastleFire(scene: THREE.Scene) {
  const flameTex = radialTexture('rgba(255,225,150,1)', 'rgba(255,80,20,0)');
  const smokeTex = radialTexture('rgba(35,28,36,0.9)', 'rgba(35,28,36,0)');
  const fires = spots().map((spot, i) => {
    const g = new THREE.Group();
    g.position.copy(spot.pos);
    g.visible = false;
    scene.add(g);
    // Flames: a few additive sprites that flicker and lick upwards.
    const flames = [0, 1, 2, 3, 4].map((k) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flameTex, color: k === 0 ? 0xfff0b0 : k < 3 ? 0xffb040 : 0xff5a18, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      );
      g.add(s);
      return s;
    });
    // Smoke: puffs that rise, grow and fade, then start again at the fire.
    const smoke = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true }));
      s.userData.age = k / 8; // spread out over the cycle
      g.add(s);
      return s;
    });
    return { spot, g, flames, smoke, level: 0, phase: i * 1.7 };
  });

  return {
    /** hpFraction = castle HP / max HP (1 = no fire). */
    update(hpFraction: number, t: number, dt: number) {
      for (const f of fires) {
        // 0 = out, 1 = blazing (grows as HP keeps dropping below the spot's threshold).
        const want = hpFraction >= f.spot.below ? 0 : Math.min(1, 0.45 + (f.spot.below - hpFraction) * 3);
        f.level += (want - f.level) * Math.min(1, dt * (want > f.level ? 1.5 : 4));
        f.g.visible = f.level > 0.02;
        if (!f.g.visible) continue;
        const size = f.spot.size * f.level;
        f.flames.forEach((s, k) => {
          const ph = t * (7 + k * 1.3) + f.phase + k;
          const flicker = 0.8 + Math.sin(ph) * 0.12 + Math.sin(ph * 2.3) * 0.08;
          const w = size * (1.1 - k * 0.16) * flicker;
          s.scale.set(w * 0.8, w * 1.45, 1);
          s.position.set(Math.sin(ph * 0.7 + k) * size * 0.18, size * (0.3 + k * 0.2), 0.05 * k);
        });
        for (const s of f.smoke) {
          s.userData.age = (s.userData.age + dt * 0.35) % 1;
          const a = s.userData.age as number;
          s.position.set(Math.sin(a * 5 + f.phase) * size * 0.4 + a * size * 0.8, size * 0.9 + a * size * 4.5, -0.1);
          const w = size * (0.7 + a * 2.4);
          s.scale.set(w, w, 1);
          (s.material as THREE.SpriteMaterial).opacity = Math.min(1, f.level * 1.2) * (a < 0.15 ? a / 0.15 : 1 - a) * 0.95;
        }
      }
    },
  };
}
