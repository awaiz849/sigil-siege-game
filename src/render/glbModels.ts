// Real 3D models (GLB files, e.g. AI-generated from our concept art) for the enemies.
// Drop a file in public/models/ (names in CONFIG.GLB_MODELS) and it replaces the code-built model.
// Missing file = we keep the code-built model from models.ts, so the game never breaks.
//
// Each GLB is: loaded once at startup, cloned per enemy (SkeletonUtils keeps rigs working),
// scaled to the height in config, turned to face the wall, given toon shading to match the
// comic look, and plays its walk/idle animation if it has one.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.ts';
import type { Element, EnemyType } from '../game/types.ts';
import type { EnemyModel } from './models.ts';
import { ELEMENT_COLOR } from './palette.ts';
import { toon } from './toon.ts';

type Loaded = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; baseHeight: number };
const cache = new Map<string, Loaded>();

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
      })
      .catch(() => {
        // No file yet: the code-built model is used instead.
      }),
  );
  return Promise.all(jobs).then(() => undefined);
}

/** A GLB-based enemy model, or null if no file is loaded for this type. */
export function createGlbEnemyModel(type: EnemyType, element: Element): EnemyModel | null {
  const loaded = cache.get(type);
  const cfg = CONFIG.GLB_MODELS[type];
  if (!loaded || !cfg) return null;

  const group = new THREE.Group();
  const model = cloneSkinned(loaded.scene);
  // Own copy of the materials, so a hit flash on one enemy doesn't flash every enemy of its type.
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
  });
  // Scale to the configured height, stand on y = 0, face the wall (+z).
  const scale = cfg.height / loaded.baseHeight;
  model.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y = -box.min.y;
  model.rotation.y = cfg.rotationY;
  group.add(model);

  // Element glow ring at the feet (the badge shows it too; the model keeps its own colours).
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.95, 40),
    new THREE.MeshBasicMaterial({ color: ELEMENT_COLOR[element], transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.scale.setScalar(cfg.height / 3);
  group.add(ring);
  const ringMat = ring.material as THREE.MeshBasicMaterial;

  // Animation: prefer a clip whose name looks like walking/running, else the first one.
  const mixer = new THREE.AnimationMixer(model);
  const clip = loaded.clips.find((c) => /walk|run|gallop|move/i.test(c.name)) ?? loaded.clips[0];
  const action = clip ? mixer.clipAction(clip) : null;
  action?.play();

  const tmp = new THREE.Vector3();
  return {
    group,
    height: cfg.height,
    animate(enemy, t, dt) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      if (action) action.timeScale = moving ? 1 : 0.25; // slow to a near-stop when not walking
      mixer.update(dt);
      ringMat.opacity = 0.45 + Math.sin(t * 3 + enemy.id) * 0.15;
    },
    setElement(e) {
      ringMat.color.set(ELEMENT_COLOR[e]);
    },
    // Archers: arrows leave from roughly the chest, in front of the model.
    arrowTip: (out) => group.localToWorld(out.copy(tmp.set(0, cfg.height * 0.6, 0.5))),
    dispose() {
      mixer.stopAllAction();
      ring.geometry.dispose();
      ringMat.dispose();
      // Geometry and textures are shared with the cached original, so only our material copies go.
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
    },
  };
}

/** Swap PBR materials for toon ones with the same colour and texture (matches our comic look). */
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
        transparent: std.transparent,
        opacity: std.opacity,
        side: std.side,
        alphaTest: std.alphaTest,
      });
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
