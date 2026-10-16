// Real 3D models (GLB files, AI-generated from our concept art) for the enemies and the wizard.
// Drop a file in public/models/ (names in CONFIG.GLB_MODELS) and it replaces the code-built model.
// Missing file = we keep the code-built model from models.ts / wizard.ts, so the game never breaks.
//
// Each GLB is: loaded once at startup, cloned per enemy (SkeletonUtils keeps rigs working),
// scaled to the height in config, turned to face the wall, given toon shading to match the
// comic look, and shows its element (recoloured texture or a glow, CONFIG.GLB_MODELS.tint).
// Our models are static meshes, so the walk is a simple bob/sway done in code; a file with
// its own walk/idle animation plays that instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.ts';
import type { Element, EnemyType } from '../game/types.ts';
import type { EnemyModel } from './models.ts';
import { ELEMENT_COLOR } from './palette.ts';
import { toon } from './toon.ts';

type ModelKey = keyof typeof CONFIG.GLB_MODELS;
type Loaded = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; baseHeight: number };
const cache = new Map<string, Loaded>();
const waiting = new Map<string, Array<(model: THREE.Object3D) => void>>();

/** Start loading every configured model file. Resolves when all have loaded or failed. */
export function preloadGlbModels(): Promise<void> {
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}`;
  const jobs = Object.entries(CONFIG.GLB_MODELS).map(([key, cfg]) =>
    loader
      .loadAsync(base + cfg.file)
      .then((gltf) => {
        const root = gltf.scene;
        // Some exported files have no surface normals; lighting needs them.
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && !mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
        });
        if (CONFIG.GLB_TOON) toonify(root);
        const box = new THREE.Box3().setFromObject(root);
        cache.set(key, { scene: root, clips: gltf.animations, baseHeight: Math.max(0.01, box.max.y - box.min.y) });
        console.info(`3D model loaded: ${cfg.file}`);
        for (const cb of waiting.get(key) ?? []) cb(placedModel(key as ModelKey));
        waiting.delete(key);
      })
      .catch(() => {
        // No file yet: the code-built model is used instead.
      }),
  );
  return Promise.all(jobs).then(() => undefined);
}

/** Call back with a ready-to-use copy of a model once its file has loaded (right away if it already has).
 *  Used by the wizard, which is built before the files finish loading. */
export function whenGlbLoaded(key: ModelKey, cb: (model: THREE.Object3D) => void): void {
  if (cache.has(key)) cb(placedModel(key));
  else waiting.set(key, [...(waiting.get(key) ?? []), cb]);
}

/** A copy of a loaded model with its own materials, scaled to the configured height,
 *  standing on y = 0 and turned the configured way. */
function placedModel(key: ModelKey): THREE.Object3D {
  const loaded = cache.get(key)!;
  const cfg = CONFIG.GLB_MODELS[key];
  const model = cloneSkinned(loaded.scene);
  // Own copy of the materials, so a hit flash on one enemy doesn't flash every enemy of its type.
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
  });
  model.scale.setScalar(cfg.height / loaded.baseHeight);
  model.rotation.y = cfg.rotationY;
  const box = new THREE.Box3().setFromObject(model);
  model.position.y = -box.min.y;
  return model;
}

/** A GLB-based enemy model, or null if no file is loaded for this type. */
export function createGlbEnemyModel(type: EnemyType, element: Element): EnemyModel | null {
  const loaded = cache.get(type);
  const cfg = CONFIG.GLB_MODELS[type];
  if (!loaded || !cfg) return null;

  const group = new THREE.Group();
  const body = new THREE.Group(); // bobs and sways while walking
  const model = placedModel(type);
  body.add(model);
  group.add(body);

  const mats: THREE.MeshToonMaterial[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) for (const m of [mesh.material].flat()) if (m instanceof THREE.MeshToonMaterial) mats.push(m);
  });
  const originalMaps = mats.map((m) => m.map);

  // Element glow ring at the feet (the badge shows it too).
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.95, 40),
    new THREE.MeshBasicMaterial({ color: ELEMENT_COLOR[element], transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.scale.setScalar(cfg.height / 3);
  group.add(ring);
  const ringMat = ring.material as THREE.MeshBasicMaterial;

  /** Show an element on the model itself: recoloured texture or a coloured glow. */
  function applyElement(e: Element) {
    ringMat.color.set(ELEMENT_COLOR[e]);
    mats.forEach((m, i) => {
      if (cfg.tint === 'hue') {
        const map = originalMaps[i];
        m.map = map ? hueShifted(map, CONFIG.GLB_HUE_SHIFT[e]) : null;
      } else if (cfg.tint === 'glow') {
        m.emissive.set(ELEMENT_COLOR[e]);
        m.emissiveIntensity = CONFIG.GLB_GLOW;
      }
    });
  }
  applyElement(element);

  // Animation from the file if it has one: prefer a walking/running clip, else the first.
  const mixer = new THREE.AnimationMixer(model);
  const clip = loaded.clips.find((c) => /walk|run|gallop|move/i.test(c.name)) ?? loaded.clips[0];
  const action = clip ? mixer.clipAction(clip) : null;
  action?.play();

  const tmp = new THREE.Vector3();
  const h = cfg.height;
  return {
    group,
    height: h,
    animate(enemy, t, dt) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      ringMat.opacity = 0.45 + Math.sin(t * 3 + enemy.id) * 0.15;
      if (action) {
        action.timeScale = moving ? 1 : 0.25; // slow to a near-stop when not walking
        mixer.update(dt);
        return;
      }
      // Static model: the motion is done in code.
      const phase = t * (type === 'bird' || type === 'boss' ? 7 : 9) + enemy.id;
      body.position.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
      if (enemy.stunT > 0) return; // frozen (enemyView tilts it)
      if (moving && (type === 'bird' || type === 'boss')) {
        // Gallop: rock nose-up / nose-down and bounce.
        body.position.y = Math.abs(Math.sin(phase)) * h * 0.05;
        body.rotation.x = Math.sin(phase) * 0.07;
      } else if (moving) {
        // Waddle: hop and sway side to side.
        body.position.y = Math.abs(Math.sin(phase)) * h * 0.04;
        body.rotation.z = Math.sin(phase) * 0.08;
      } else if (enemy.state === 'charge') {
        // Archer drawing its bow: lean back and tremble with effort.
        body.rotation.x = -0.12 - Math.sin(t * 40) * 0.015;
      } else if (enemy.state === 'smash') {
        // Boss at the gate: rear up and slam down every smash.
        const k = Math.max(0, Math.sin((enemy.stateT / CONFIG.BOSS.smashS) * Math.PI));
        body.rotation.x = -k * 0.35;
        body.position.y = k * h * 0.08;
      } else {
        // Idle breathing.
        body.position.y = Math.sin(t * 2 + enemy.id) * h * 0.01;
      }
    },
    setElement: applyElement,
    // Archers: arrows leave from roughly the chest, in front of the model.
    arrowTip: (out) => group.localToWorld(out.copy(tmp.set(0, h * 0.6, 0.5))),
    dispose() {
      mixer.stopAllAction();
      ring.geometry.dispose();
      ringMat.dispose();
      // Geometry and textures are shared with the cached original, so only our material copies go.
      mats.forEach((m) => m.dispose());
    },
  };
}

/** Recoloured copies of a texture (hue turned by `degrees`), made once and shared. */
const hueCache = new Map<THREE.Texture, Map<number, THREE.Texture>>();
function hueShifted(src: THREE.Texture, degrees: number): THREE.Texture {
  if (degrees === 0) return src;
  let byDeg = hueCache.get(src);
  if (!byDeg) hueCache.set(src, (byDeg = new Map()));
  const hit = byDeg.get(degrees);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.filter = `hue-rotate(${degrees}deg)`;
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = src.flipY; // glTF textures are not flipped
  tex.colorSpace = src.colorSpace;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.anisotropy = src.anisotropy;
  byDeg.set(degrees, tex);
  return tex;
}

/** Swap PBR materials for toon ones with the same colour and texture (matches our comic look).
 *  Emissive starts at 0 so the white hit flash in enemyView can use it. */
function toonify(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial;
      return toon({
        color: std.color,
        map: std.map ?? null,
        emissive: std.emissive,
        emissiveMap: std.emissiveMap ?? null,
        emissiveIntensity: std.emissiveMap ? 1 : 0,
        transparent: std.transparent,
        opacity: std.opacity,
        side: std.side,
        alphaTest: std.alphaTest,
      });
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
