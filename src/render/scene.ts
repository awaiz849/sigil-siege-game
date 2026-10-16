// three.js world: renderer + bloom, first-person camera on the castle wall, environment, enemies.
// render(world) only READS the World. project() turns an enemy into overlay pixels
// (used for targeting and for badges drawn on the 2D overlay).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../config.ts';
import type { Enemy, World } from '../game/types.ts';
import { createEnvironment, WALL_TOP } from './environment.ts';
import { createEnemyView } from './enemyView.ts';
import { createParticles } from './particles.ts';
import { PALETTE } from './palette.ts';
import { radialTexture } from './environment.ts';

/** A spell orb flying from where the sigil was drawn to its target. */
type Shot = { sprite: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; t: number; color: number; onArrive: () => void };

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = CONFIG.SHADOWS;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.navy);
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.016);

  // First-person camera: standing on the walkway, leaning slightly over the edge.
  const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.fov, 1, 0.1, 1000);
  const camBase = new THREE.Vector3(0, WALL_TOP + CONFIG.CAMERA.eyeHeight, CONFIG.FIELD.wallZ + CONFIG.CAMERA.back);
  const lookAt = new THREE.Vector3(0, CONFIG.CAMERA.lookAtY, CONFIG.CAMERA.lookAtZ);
  camera.position.copy(camBase);
  camera.lookAt(lookAt);

  // Lighting: cool moonlight + dim sky fill; torches add warm light near the wall.
  scene.add(new THREE.HemisphereLight(0x9aa0e8, 0x2a2030, 1.5));
  // Key light comes from behind the player (over the castle) so enemies' faces are lit.
  const moon = new THREE.DirectionalLight(0xc8d4ff, 1.8);
  moon.position.set(25, 40, 40);
  moon.castShadow = CONFIG.SHADOWS;
  scene.add(moon);
  // Warm rim light from the sunset glow behind the enemies, so their silhouettes read.
  const rim = new THREE.DirectionalLight(0xff9a6a, 1.4);
  rim.position.set(-20, 10, -100);
  scene.add(rim);

  const environment = createEnvironment(scene);
  const particles = createParticles(scene);
  const enemies = createEnemyView(scene, particles);

  // Bloom makes emissive things (eyes, orbs, torches, moon) glow.
  // Multisampled render target: without it the post-processing path loses anti-aliasing (jagged edges).
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: CONFIG.MSAA_SAMPLES });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CONFIG.BLOOM.strength, CONFIG.BLOOM.radius, CONFIG.BLOOM.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const shots: Shot[] = [];
  const orbTexture = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  function updateShots(dt: number) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t = Math.min(1, s.t + dt / CONFIG.PROJECTILE_S);
      // Straight line plus a small upward arc.
      s.sprite.position.lerpVectors(s.from, s.to, s.t);
      s.sprite.position.y += Math.sin(s.t * Math.PI) * 0.8;
      particles.burst(s.sprite.position.clone(), s.color, 3, 0.8, 0.2, 0.35); // spark trail
      if (s.t >= 1) {
        scene.remove(s.sprite);
        s.sprite.material.dispose();
        shots.splice(i, 1);
        s.onArrive();
      }
    }
  }

  let width = 1;
  let height = 1;
  let shakeAmount = 0;
  let time = 0;
  const tmp = new THREE.Vector3();

  function resize(w: number, h: number) {
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /** Draw one frame. dt in seconds. */
  function render(world: World, dt: number) {
    time += dt;
    environment.update(time, dt);
    enemies.update(world, time, dt);
    updateShots(dt);
    particles.update(dt);

    // Camera shake (castle hits) + a very slow idle sway so the view feels alive.
    shakeAmount = Math.max(0, shakeAmount - dt * 2.5);
    const s = shakeAmount * shakeAmount;
    camera.position.set(
      camBase.x + Math.sin(time * 0.4) * 0.05 + (Math.random() - 0.5) * s,
      camBase.y + Math.sin(time * 0.6) * 0.03 + (Math.random() - 0.5) * s,
      camBase.z,
    );
    camera.lookAt(lookAt);

    if (CONFIG.BLOOM.enabled) composer.render(dt);
    else renderer.render(scene, camera);
  }

  /** World point -> overlay pixels, or null if it is behind the camera. */
  function projectPoint(x: number, y: number, z: number): { x: number; y: number } | null {
    tmp.set(x, y, z).project(camera);
    if (tmp.z > 1) return null;
    return { x: (tmp.x * 0.5 + 0.5) * width, y: (-tmp.y * 0.5 + 0.5) * height };
  }

  /** Enemy position in overlay pixels. heightFactor 0 = feet, 0.5 = middle, 1 = top of head. */
  function project(enemy: Enemy, heightFactor = 0.5): { x: number; y: number } | null {
    return projectPoint(enemy.pos.x, enemy.pos.y + enemies.heightOf(enemy.id) * heightFactor, enemy.pos.z);
  }

  return {
    renderer,
    scene,
    camera,
    resize,
    render,
    project,
    projectPoint,
    /** Model height of an enemy (world units). */
    heightOf: (id: number) => enemies.heightOf(id),
    /** Fire a glowing orb from a screen point (where the sigil was drawn) to a world position at an enemy. */
    castProjectile(screen: { x: number; y: number }, pos: { x: number; y: number; z: number }, enemyId: number, color: number, onArrive: () => void) {
      // Start a few metres in front of the camera, along the ray through the sigil's centre.
      const ndc = new THREE.Vector3((screen.x / width) * 2 - 1, -(screen.y / height) * 2 + 1, 0.5).unproject(camera);
      const dir = ndc.sub(camera.position).normalize();
      const from = camera.position.clone().addScaledVector(dir, 3);
      const to = new THREE.Vector3(pos.x, pos.y + enemies.heightOf(enemyId) * 0.5, pos.z);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: orbTexture, color, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      sprite.scale.setScalar(1.3);
      sprite.position.copy(from);
      scene.add(sprite);
      shots.push({ sprite, from, to, t: 0, color, onArrive });
    },
    /** Kick the camera (0..1). */
    shake(amount: number) {
      shakeAmount = Math.min(1, shakeAmount + amount);
    },
    /** Spray particles at a world position, raised to the middle of an enemy of that id (spell hits). */
    burstAt(pos: { x: number; y: number; z: number }, enemyId: number, color: number, count = 24) {
      const p = new THREE.Vector3(pos.x, pos.y + enemies.heightOf(enemyId) * 0.5, pos.z);
      particles.burst(p, color, count, 5, 2, 0.6);
    },
  };
}
