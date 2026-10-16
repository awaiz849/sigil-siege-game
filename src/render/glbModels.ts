// Real 3D models (GLB files, AI-generated from our concept art) for the enemies and the wizard.
// Drop a file in public/models/ (names in CONFIG.GLB_MODELS) and it replaces the code-built model.
// Missing file = we keep the code-built model from models.ts / wizard.ts, so the game never breaks.
//
// Each GLB is: loaded once at startup, cloned per enemy (SkeletonUtils keeps rigs working),
// scaled to the height in config, turned to face the wall, given toon shading to match the
// comic look, and shows its element (recoloured texture or a glow, CONFIG.GLB_MODELS.tint).
// Our models are static meshes (no skeleton), so the walk is a bob/sway done in code, and the
// horses' legs gallop in the vertex shader (gallopLegs below); a file with its own walk/idle
// animation plays that instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG, type GlbModelConfig } from '../config.ts';
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
  const gallop = cfg.legs ? gallopLegs(mats, cfg.legs) : null;

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
      gallop?.update(dt, moving);
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

/** Horses: swing the four legs at the hips in a gallop. The model has no skeleton, so the vertex
 *  shader rotates every vertex below the hip around its leg's hip point (front pair and back pair
 *  half a stride apart, left legs a little behind the right ones). Body, rider and lance stay put. */
function gallopLegs(mats: THREE.Material[], legs: NonNullable<GlbModelConfig['legs']>) {
  const uniforms = {
    uStride: { value: Math.random() * Math.PI * 2 },
    uSwing: { value: 0 },
    uLegs: { value: new THREE.Vector4(legs.hip, legs.frontZ, legs.backZ, legs.legR) },
    uLegX: { value: legs.legX },
  };
  for (const m of mats) {
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uStride, uSwing, uLegX;
          uniform vec4 uLegs; // hip y, front z, back z, leg radius`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float hip = uLegs.x;
            bool front = transformed.z > (uLegs.y + uLegs.z) * 0.5;
            float zc = front ? uLegs.y : uLegs.z;
            // 1 on the leg (below the hip, near its z, not too far sideways), 0 on the body.
            float w = (1.0 - smoothstep(hip - 0.07, hip, transformed.y))
                    * (1.0 - smoothstep(uLegs.w, uLegs.w * 1.7, abs(transformed.z - zc)))
                    * (1.0 - smoothstep(uLegX, uLegX + 0.03, abs(transformed.x)));
            float phase = uStride + (front ? 0.0 : 3.14159) + (transformed.x > 0.0 ? 0.0 : 0.7);
            float a = uSwing * sin(phase) * w;
            vec2 d = vec2(transformed.y - hip, transformed.z - zc);
            float c = cos(a), s = sin(a);
            transformed.y = hip + d.x * c - d.y * s;
            transformed.z = zc + d.x * s + d.y * c;
          }`);
    };
    m.customProgramCacheKey = () => 'gallop-legs';
  }
  return {
    /** Advance the stride; the legs ease to a stop when the horse stands still. */
    update(dt: number, moving: boolean) {
      uniforms.uStride.value += dt * legs.strides * Math.PI * 2 * (moving ? 1 : 0.15);
      const want = moving ? legs.swing : 0;
      uniforms.uSwing.value += (want - uniforms.uSwing.value) * Math.min(1, dt * 6);
    },
  };
}

/** A hero's staff that can swing (the model has no skeleton): the vertex shader rotates the staff's
 *  vertices around the hand (forward = toward the field). Returns set(angle) in radians. */
export function staffSwing(model: THREE.Object3D, staff: NonNullable<GlbModelConfig['staff']>) {
  const uniforms = {
    uSwing: { value: 0 },
    uPivot: { value: new THREE.Vector3(...staff.pivot) },
    uStaff: { value: new THREE.Vector3(staff.maxX, staff.minZ, staff.topY) },
  };
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of [mesh.material].flat()) {
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
            uniform float uSwing;
            uniform vec3 uPivot, uStaff; // staff: max x, min z, ornament height`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            {
              // On the staff: far enough out to the side, and in front of the cape (or the top ornament).
              float side = 1.0 - smoothstep(uStaff.x - 0.02, uStaff.x + 0.01, transformed.x);
              float front = max(smoothstep(uStaff.y - 0.02, uStaff.y, transformed.z), step(uStaff.z, transformed.y));
              float a = uSwing * side * front;
              vec2 d = vec2(transformed.y - uPivot.y, transformed.z - uPivot.z);
              float c = cos(a), s = sin(a);
              transformed.y = uPivot.y + d.x * c - d.y * s;
              transformed.z = uPivot.z + d.x * s + d.y * c;
            }`);
      };
      m.customProgramCacheKey = () => 'staff-swing';
      m.needsUpdate = true;
    }
  });
  return {
    set(angle: number) {
      uniforms.uSwing.value = angle;
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
