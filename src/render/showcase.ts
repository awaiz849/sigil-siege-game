// Dev-only page (http://localhost:<port>/showcase.html): all four monster models side by side,
// animating, so models can be checked without playing until the boss arrives.
// Press 1 / 2 / 3 to switch every model to fire / water / nature; C toggles the archer's charge;
// S toggles the turntable spin.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { InkOutlinePass, toon } from './toon.ts';
import type { Element, Enemy, EnemyType } from '../game/types.ts';
import { createEnemyModel, type EnemyModel } from './models.ts';
import { preloadGlbModels } from './glbModels.ts';

// Load any GLB model files first, so the showcase shows them instead of the code-built ones.
await preloadGlbModels();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b24);
scene.add(new THREE.HemisphereLight(0x9aa0e8, 0x2a2030, 1.4));
const key = new THREE.DirectionalLight(0xc8d4ff, 2);
key.position.set(5, 10, 10);
scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), toon({ color: 0x2a2438 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 4.5, 16);
camera.lookAt(0, 2.2, 0);

const types: EnemyType[] = ['imp', 'bird', 'warlock', 'boss'];
let element: Element = 'fire';
let charging = false;
let spin = true; // S toggles the turntable
const shown: Array<{ model: EnemyModel; enemy: Enemy }> = types.map((type, i) => {
  const model = createEnemyModel(type, element);
  model.group.position.set(-7.5 + i * 5, 0, 0);
  model.group.rotation.y = 0.3; // front three-quarter view
  scene.add(model.group);
  const enemy = { id: i, type, element, hp: 2, maxHp: 2, pos: { x: 0, y: type === 'bird' ? 4 : 0, z: 0 }, speed: 1, radius: 1, state: 'walk', stateT: 0, stunT: 0, hint: false, nextElement: null, swapT: 0, age: 0 } as Enemy;
  return { model, enemy };
});

window.addEventListener('keydown', (e) => {
  const map: Record<string, Element> = { '1': 'fire', '2': 'water', '3': 'nature' };
  if (map[e.key]) {
    element = map[e.key];
    shown.forEach((s) => s.model.setElement(element));
  }
  if (e.key === 'c' || e.key === 'C') charging = !charging;
  if (e.key === 's' || e.key === 'S') spin = !spin;
});

// Same look as the game: render -> ink outlines -> output.
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
target.depthTexture = new THREE.DepthTexture(1, 1);
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new InkOutlinePass(camera));
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  const t = now / 1000;
  for (const s of shown) {
    if (s.enemy.type === 'warlock') {
      s.enemy.state = charging ? 'charge' : 'walk';
      s.enemy.stateT = charging ? (s.enemy.stateT + dt) % 3 : 0;
    }
    s.model.animate(s.enemy, t, dt);
    if (spin) s.model.group.rotation.y = t * 0.5; // turntable
  }
  composer.render(dt);
});
