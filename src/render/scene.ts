// three.js world: renderer, camera on the castle wall, and a placeholder ground.
// Later: models, enemy meshes, and projecting enemies to screen positions.
import * as THREE from 'three';
import { CONFIG } from '../config.ts';

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = CONFIG.SHADOWS;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2033);
  scene.fog = new THREE.Fog(0x1a2033, 20, 60);

  // First-person camera standing on the wall, looking out over the field.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 6, 0);
  camera.lookAt(0, 0, -20);

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2a1a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(10, 20, 5);
  scene.add(sun);

  // Placeholder ground so we can see the 3D layer works.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x3b5a2e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -30;
  scene.add(ground);

  function resize(width: number, height: number) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, resize, render };
}
