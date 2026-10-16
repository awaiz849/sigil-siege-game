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
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CONFIG.BLOOM.strength, CONFIG.BLOOM.radius, CONFIG.BLOOM.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

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

  /** Enemy position in overlay pixels. heightFactor 0 = feet, 0.5 = middle, 1 = top of head. */
  function project(enemy: Enemy, heightFactor = 0.5): { x: number; y: number } {
    tmp.set(enemy.pos.x, enemy.pos.y + enemies.heightOf(enemy.id) * heightFactor, enemy.pos.z);
    tmp.project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * width, y: (-tmp.y * 0.5 + 0.5) * height };
  }

  return {
    renderer,
    scene,
    camera,
    resize,
    render,
    project,
    /** Kick the camera (0..1). */
    shake(amount: number) {
      shakeAmount = Math.min(1, shakeAmount + amount);
    },
    /** Spray particles at an enemy (spell hits). */
    burstAt(enemy: Enemy, color: number, count = 20) {
      tmp.set(enemy.pos.x, enemy.pos.y + enemies.heightOf(enemy.id) * 0.5, enemy.pos.z);
      particles.burst(tmp.clone(), color, count, 4, 2, 0.6);
    },
  };
}
