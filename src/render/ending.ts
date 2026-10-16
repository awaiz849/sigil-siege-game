// End-of-round cinematics, played in the 3D scene before the end screen appears.
//   VICTORY  the camera swings out over the field to look back at the castle; giant banners with
//            the hero's face (a portrait rendered from his 3D model) unfurl down the wall, fireworks
//            burst over the towers and the hero keeps casting gold.
//   DEFEAT   the camera swings out the same way; the boss rears up at the gate and smashes it, then
//            the towers topple, the wall crumbles into the ground and rubble and dust fly.
// A new round puts everything back.
import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { Enemy, Hero, World } from '../game/types.ts';
import { createEnemyModel, type EnemyModel } from './models.ts';
import { whenGlbLoaded } from './glbModels.ts';
import { WALL_TOP } from './environment.ts';
import { toon } from './toon.ts';
import { PALETTE } from './palette.ts';

type Particles = { burst(at: THREE.Vector3, color: number, count: number, speed?: number, up?: number, lifetime?: number): void };
type Refs = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  particles: Particles;
  /** The castle pieces that fall on a defeat (wall, towers) and the hero on top. */
  wall: THREE.Object3D;
  towers: THREE.Object3D[];
  hero: THREE.Object3D;
  heroCast: (color: number) => void;
  shake: (amount: number) => void;
};

const FIREWORK_COLORS = [0xffd86a, 0xff5a2e, 0x3fa9ff, 0x6fe05a, 0xff7ad8, 0xffffff];

export function createEnding(refs: Refs) {
  let mode: 'win' | 'lose' | null = null;
  let t = 0;
  let fireworkT = 0;
  let castT = 0;
  // Saved transforms, restored when the next round starts.
  const saved = [refs.wall, ...refs.towers, refs.hero].map((o) => ({ o, pos: o.position.clone(), rot: o.rotation.clone() }));
  const extras = new THREE.Group(); // banners, rubble, cinematic boss
  refs.scene.add(extras);
  const rubble: Array<{ m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }> = [];
  let boss: { model: EnemyModel; enemy: Enemy } | null = null;
  const banners: THREE.Object3D[] = [];
  const camFrom = new THREE.Vector3();
  const lookFrom = new THREE.Vector3();
  // Where the camera ends up: out on the field, looking back at the castle.
  const camTo = new THREE.Vector3(7, 8.5, CONFIG.FIELD.wallZ - 24);
  const lookTo = new THREE.Vector3(0, 4.2, CONFIG.FIELD.wallZ);
  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const arcTop = new THREE.Vector3();

  // Each hero's portrait for the victory banners, rendered once from his 3D model.
  let hero: Hero = 'wizard';
  const portraits: Partial<Record<Hero, THREE.Texture>> = {};
  for (const key of ['wizard', 'warden'] as const) whenGlbLoaded(key, (model) => (portraits[key] = renderPortrait(refs.renderer, model)));

  function start(next: 'win' | 'lose', world: World, camPos: THREE.Vector3, camLook: THREE.Vector3) {
    mode = next;
    t = 0;
    fireworkT = 0;
    castT = 0;
    camFrom.copy(camPos);
    lookFrom.copy(camLook);
    if (next === 'win') hangBanners();
    else if (!world.enemies.some((e) => e.type === 'boss')) {
      // No boss on the field: one rides up to the gate for the final blow.
      const enemy = {
        id: 999, type: 'boss', element: 'fire', hp: 8, maxHp: 8, pos: { x: 0, y: 0, z: CONFIG.FIELD.wallZ - 3.5 }, speed: 0, radius: 1.6,
        state: 'smash', stateT: 0, stunT: 0, hint: false, nextElement: null, swapT: 0, age: 0,
      } as Enemy;
      const model = createEnemyModel('boss', 'fire');
      model.group.position.set(enemy.pos.x, 0, enemy.pos.z);
      extras.add(model.group);
      boss = { model, enemy };
    }
  }

  function reset() {
    mode = null;
    for (const s of saved) {
      s.o.position.copy(s.pos);
      s.o.rotation.copy(s.rot);
    }
    for (const r of rubble) r.m.geometry.dispose();
    rubble.length = 0;
    banners.length = 0;
    boss?.model.dispose();
    boss = null;
    extras.clear();
  }

  /** Banners with the hero's face hanging down the castle wall (they unroll from the top). */
  function hangBanners() {
    const fabric = bannerTexture();
    const faceMask = circleTexture();
    for (const [x, w] of [[-5.5, 2.6], [0, 3.4], [5.5, 2.6]] as const) {
      const h = WALL_TOP - 0.6;
      const pivot = new THREE.Group(); // top edge: the banner unrolls downward from here
      pivot.position.set(x, WALL_TOP + 0.2, CONFIG.FIELD.wallZ - 0.06);
      pivot.rotation.y = Math.PI; // face the field (where the camera is)
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), new THREE.MeshBasicMaterial({ map: fabric, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
      pivot.add(cloth);
      const portrait = portraits[hero];
      if (portrait) {
        const face = new THREE.Mesh(
          new THREE.CircleGeometry(w * 0.36, 32),
          new THREE.MeshBasicMaterial({ map: portrait, alphaMap: faceMask, transparent: true, side: THREE.DoubleSide }),
        );
        face.position.set(0, -h * 0.42, 0.02);
        pivot.add(face);
      }
      pivot.scale.y = 0.001;
      extras.add(pivot);
      banners.push(pivot);
    }
  }

  /** Big stone chunks flying off the collapsing castle. */
  function throwRubble(n: number) {
    const mat = toon({ color: PALETTE.stone });
    for (let i = 0; i < n; i++) {
      const s = 0.3 + Math.random() * 0.7;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), mat);
      m.position.set((Math.random() - 0.5) * 24, WALL_TOP * (0.4 + Math.random() * 0.7), CONFIG.FIELD.wallZ - 0.5);
      extras.add(m);
      rubble.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 6, -2 - Math.random() * 6), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) });
    }
  }

  return {
    get active() {
      return mode !== null;
    },
    /** Whose face goes on the victory banners. */
    setHero(next: Hero) {
      hero = next;
    },

    /** Call every frame. Returns where the camera should be (and look), or null = normal camera. */
    update(world: World, dt: number, camPos: THREE.Vector3, camLook: THREE.Vector3): { pos: THREE.Vector3; look: THREE.Vector3 } | null {
      const want = world.phase === 'WIN' ? 'win' : world.phase === 'LOSE' ? 'lose' : null;
      if (want !== mode) {
        if (mode) reset();
        if (want) start(want, world, camPos, camLook);
      }
      if (!mode) return null;
      t += dt;

      // Camera: arcs up and out over the field (a curve through a high point, so it never skims
      // the walls), turning early to face the castle; then drifts slowly.
      const k = THREE.MathUtils.smoothstep(t, 0, CONFIG.ENDING.cameraS);
      const high = arcTop.set((camFrom.x + camTo.x) / 2, Math.max(camFrom.y, camTo.y) + 9, (camFrom.z + camTo.z) / 2);
      tmpPos.copy(camFrom).multiplyScalar((1 - k) * (1 - k)).addScaledVector(high, 2 * k * (1 - k)).addScaledVector(camTo, k * k);
      tmpPos.x += Math.sin(t * 0.3) * 0.6 * k;
      tmpLook.copy(lookFrom).lerp(lookTo, THREE.MathUtils.smoothstep(t, 0, CONFIG.ENDING.cameraS * 0.45));

      if (mode === 'win') {
        // Banners unroll one after another, fireworks over the castle, the hero casts gold.
        banners.forEach((b, i) => (b.scale.y = Math.max(0.001, THREE.MathUtils.smoothstep(t, 1.4 + i * 0.25, 2.2 + i * 0.25))));
        fireworkT -= dt;
        if (t > 1.2 && fireworkT <= 0) {
          fireworkT = 0.22 + Math.random() * 0.25;
          const at = new THREE.Vector3((Math.random() - 0.5) * 28, WALL_TOP + 7 + Math.random() * 8, CONFIG.FIELD.wallZ - 2 + Math.random() * 4);
          const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
          refs.particles.burst(at, color, 45, 7, 0.5, 1.3);
          refs.particles.burst(at, 0xffffff, 10, 3, 0.5, 0.5);
        }
        castT -= dt;
        if (castT <= 0) {
          castT = 1.1;
          refs.heroCast(0xffd86a);
        }
      } else {
        // The boss rears up and smashes the gate...
        if (boss) {
          boss.enemy.stateT = (t * 1.4) % CONFIG.BOSS.smashS;
          boss.model.animate(boss.enemy, t, dt);
        }
        if (t > 1.3 && t - dt <= 1.3) {
          refs.shake(1.2);
          throwRubble(14);
        }
        // ...then the castle comes down: towers topple outward, the wall sinks, the hero with it.
        const fall = THREE.MathUtils.smoothstep(t, 1.6, 4.6);
        if (fall > 0) {
          refs.towers.forEach((tw, i) => {
            const side = i === 0 ? -1 : 1;
            tw.rotation.z = saved[1 + i].rot.z - side * fall * 0.9;
            tw.position.y = saved[1 + i].pos.y - fall * fall * 6;
          });
          const jitter = fall < 1 ? (Math.random() - 0.5) * 0.15 : 0;
          refs.wall.position.y = saved[0].pos.y - fall * WALL_TOP * 0.85;
          refs.wall.position.x = saved[0].pos.x + jitter;
          refs.hero.position.y = saved[saved.length - 1].pos.y - fall * WALL_TOP * 0.85;
          if (fall < 1 && Math.random() < dt * 12) {
            const at = new THREE.Vector3((Math.random() - 0.5) * 26, 0.6, CONFIG.FIELD.wallZ - 0.8);
            refs.particles.burst(at, 0x9a8a7a, 18, 3, 3, 1.4); // dust
            if (Math.random() < 0.4) throwRubble(2);
          }
          if (fall < 1) refs.shake(0.35);
        }
      }

      // Rubble physics: flies, spins, lands.
      for (const r of rubble) {
        r.v.y -= 18 * dt;
        r.m.position.addScaledVector(r.v, dt);
        if (r.m.position.y < 0.2) {
          r.m.position.y = 0.2;
          r.v.multiplyScalar(0.4);
          r.v.y = Math.abs(r.v.y) * 0.3;
        }
        r.m.rotation.x += r.spin.x * dt;
        r.m.rotation.y += r.spin.y * dt;
      }
      return { pos: tmpPos, look: tmpLook };
    },
  };
}

/** Render the hero's head into a texture (for the victory banners). */
function renderPortrait(renderer: THREE.WebGLRenderer, model: THREE.Object3D): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2470);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 2.2));
  const light = new THREE.DirectionalLight(0xffe0b0, 2);
  light.position.set(1, 2, -3);
  scene.add(light);
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  const headY = box.min.y + h * 0.84;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  // The model faces -z (toward the field), so the camera looks at it from -z.
  cam.position.set(0, headY, -h * 0.85);
  cam.lookAt(0, headY, 0);
  const rt = new THREE.WebGLRenderTarget(256, 256);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  return rt.texture;
}

/** Royal navy banner cloth with a gold border and a laurel ring where the portrait sits. */
function bannerTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#1d2560';
  ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 236);
  ctx.beginPath();
  ctx.arc(64, 108, 50, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.stroke();
  // Laurel leaves around the ring.
  ctx.fillStyle = '#f2c14e';
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * 0.65 + (k / 13) * Math.PI * 1.7;
    ctx.save();
    ctx.translate(64 + Math.cos(a) * 58, 108 + Math.sin(a) * 58);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'center';
  ctx.fillText('VICTORY', 64, 205);
  // Swallow-tail cut at the bottom.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, 256);
  ctx.lineTo(64, 228);
  ctx.lineTo(128, 256);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** White disc on black: alpha mask that makes the portrait round. */
function circleTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(cv);
}
