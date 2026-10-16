// Dev-only page (http://localhost:<port>/showcase.html): all four monster models side by side,
// animating, so models can be checked without playing until the boss arrives.
// Press 1 / 2 / 3 to switch every model to fire / water / nature; C toggles the archer's charge.
import * as THREE from 'three';
import type { Element, Enemy, EnemyType } from '../game/types.ts';
import { createEnemyModel, type EnemyModel } from './models.ts';

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
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x2a2438 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 4.5, 16);
camera.lookAt(0, 2.2, 0);

const types: EnemyType[] = ['imp', 'bird', 'warlock', 'boss'];
let element: Element = 'fire';
let charging = false;
const shown: Array<{ model: EnemyModel; enemy: Enemy }> = types.map((type, i) => {
  const model = createEnemyModel(type, element);
  model.group.position.set(-7.5 + i * 5, 0, 0);
  model.group.rotation.y = 0.45; // front three-quarter view
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
});

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
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
  }
  renderer.render(scene, camera);
});
