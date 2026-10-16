// Set pieces that tell the story: two castle towers with glowing windows and waving banners,
// the red rift at the end of the road the monsters pour out of, a roadside graveyard with
// dead trees, and clouds drifting past the moon. Primitives only.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './toon.ts';
import { CONFIG } from '../config.ts';
import { brickTexture, radialTexture, WALL_TOP } from './environment.ts';
import { PALETTE } from './palette.ts';

let seed = 99;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const range = (a: number, b: number) => a + rand() * (b - a);

type Piece = { object: THREE.Object3D; update?: (t: number, dt: number) => void };

export function createLandmarks(scene: THREE.Scene) {
  const pieces: Piece[] = [createTower(-1), createTower(1), createRift(), createGraveyard(), createClouds()];
  for (const p of pieces) scene.add(p.object);
  return {
    update(t: number, dt: number) {
      for (const p of pieces) p.update?.(t, dt);
    },
  };
}

// ---------------------------------------------------------------- towers

function createTower(side: number): Piece {
  const g = new THREE.Group();
  const x = side * CONFIG.LANDMARKS.towerX;
  const z = CONFIG.FIELD.wallZ - CONFIG.LANDMARKS.towerForward;
  g.position.set(x, 0, z);

  const map = brickTexture().clone();
  map.repeat.set(4, 3);
  map.needsUpdate = true;
  const stone = toon({ map, color: 0x9a96aa, roughness: 0.95 });
  const height = WALL_TOP + 2.2;
  const radius = 1.9;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, height, 14), stone);
  body.position.y = height / 2;
  g.add(body);

  // Crenellated ring on top.
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.25, radius + 0.25, 0.5, 14), stone);
  ring.position.y = height + 0.25;
  g.add(ring);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.6, 0.45, 3, 0.07), stone);
    m.position.set(Math.cos(a) * (radius + 0.1), height + 0.8, Math.sin(a) * (radius + 0.1));
    m.rotation.y = -a;
    g.add(m);
  }

  // Conical roof (navy slate) with a gold finial.
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(radius + 0.5, 3.4, 14),
    toon({ color: 0x2a2458, flatShading: true, roughness: 0.7 }),
  );
  roof.position.y = height + 0.5 + 1.7;
  g.add(roof);
  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    toon({ color: PALETTE.gold, metalness: 0.8, roughness: 0.3, emissive: PALETTE.gold, emissiveIntensity: 0.4 }),
  );
  finial.position.y = height + 3.9;
  g.add(finial);

  // Warm glowing windows facing the camera side and the field.
  const windowMat = toon({ color: 0xffb35c, emissive: 0xff9a3c, emissiveIntensity: 1.2 });
  const windows: THREE.Mesh[] = [];
  for (const [wy, wa] of [
    [2.6, Math.PI * 0.5],
    [5.2, Math.PI * 0.5 - side * 0.6],
    [5.2, -Math.PI * 0.5],
    [5.4, Math.PI * 0.5 + side * 0.7],
  ] as const) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.1), windowMat);
    w.position.set(Math.cos(wa) * radius, wy, Math.sin(wa) * radius);
    w.lookAt(Math.cos(wa) * 10, wy, Math.sin(wa) * 10);
    g.add(w);
    windows.push(w);
  }

  // Banner hanging from the top, waving (vertices move every frame).
  const bannerGeo = new THREE.PlaneGeometry(0.9, 2.3, 1, 10);
  bannerGeo.translate(0, -1.15, 0);
  const banner = new THREE.Mesh(
    bannerGeo,
    toon({ color: 0x7a35c0, side: THREE.DoubleSide, flatShading: true, emissive: 0x2a0a50, emissiveIntensity: 0.5 }),
  );
  // Facing the field-and-camera diagonal, on the inner side of the tower.
  banner.position.set(-side * (radius + 0.05), height - 0.3, 0.6);
  banner.rotation.y = -side * 0.9;
  g.add(banner);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.14), toon({ color: PALETTE.gold, side: THREE.DoubleSide, emissive: PALETTE.gold, emissiveIntensity: 0.3 }));
  stripe.position.set(0, -0.35, 0.01);
  banner.add(stripe);
  const pos = bannerGeo.attributes.position as THREE.BufferAttribute;
  const baseY = Float32Array.from({ length: pos.count }, (_, i) => pos.getY(i));

  return {
    object: g,
    update(t: number) {
      // Wave grows toward the bottom of the banner.
      for (let i = 0; i < pos.count; i++) {
        const y = baseY[i];
        const depth = -y / 2.3; // 0 at top, 1 at bottom
        pos.setZ(i, Math.sin(t * 2.4 + y * 1.8 + side) * 0.18 * depth);
      }
      pos.needsUpdate = true;
      // Candle-like flicker in the windows.
      windowMat.emissiveIntensity = 1.1 + Math.sin(t * 9 + side) * 0.1 + Math.sin(t * 23) * 0.06;
    },
  };
}

// ---------------------------------------------------------------- rift

function createRift(): Piece {
  // A glowing tear in the air at the end of the road: where the monsters come from.
  const g = new THREE.Group();
  g.position.set(0, 4.2 * CONFIG.LANDMARKS.riftScale + 0.6, CONFIG.FIELD.spawnZ - 6);
  g.scale.setScalar(CONFIG.LANDMARKS.riftScale);

  const ringMat = toon({ color: 0xff3048, emissive: 0xff2040, emissiveIntensity: 3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.18, 8, 48), ringMat);
  ring.scale.set(1, 1.15, 1);
  g.add(ring);

  // Swirling dark-red core.
  const coreTex = radialTexture('rgba(40,0,30,1)', 'rgba(180,20,80,0.0)');
  const core = new THREE.Mesh(new THREE.CircleGeometry(3.5, 40), new THREE.MeshBasicMaterial({ map: coreTex, transparent: true, depthWrite: false, fog: false }));
  core.scale.set(1, 1.15, 1);
  g.add(core);
  const swirl = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 3.4, 40, 1, 0, Math.PI * 1.4),
    new THREE.MeshBasicMaterial({ color: 0xff3a6a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  swirl.position.z = 0.05;
  g.add(swirl);

  // Big soft red glow behind it (bloom picks it up) and a red light on the road.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,40,80,0.6)', 'rgba(255,40,80,0)'), blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.scale.set(14, 14, 1);
  glow.position.z = -0.5;
  g.add(glow);
  // Red glow pooled on the road in front of it (a flat additive decal: far cheaper than a light).
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(7, 32),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,40,80,0.55)', 'rgba(255,40,80,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, -(4.2 * CONFIG.LANDMARKS.riftScale + 0.6) / CONFIG.LANDMARKS.riftScale + 0.05, 4);
  g.add(pool);
  const poolMat = pool.material as THREE.MeshBasicMaterial;

  return {
    object: g,
    update(t: number) {
      swirl.rotation.z = -t * 1.4;
      core.rotation.z = t * 0.3;
      const pulse = 0.85 + Math.sin(t * 2.3) * 0.15;
      ringMat.emissiveIntensity = 3 * pulse;
      poolMat.opacity = pulse;
      glow.scale.setScalar(13 + Math.sin(t * 1.7) * 1.2);
    },
  };
}

// ---------------------------------------------------------------- graveyard

function createGraveyard(): Piece {
  const g = new THREE.Group();
  const stone = toon({ color: 0x6b6880, flatShading: true, roughness: 1 });
  const wood = toon({ color: 0x2c2420, flatShading: true, roughness: 1 });
  const half = CONFIG.FIELD.halfWidth;

  // Gravestones in loose rows on both roadsides, leaning a little.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * range(half + 2, half + 7);
    const z = range(-45, -10);
    const h = range(0.7, 1.2);
    const stoneMesh = new THREE.Mesh(new RoundedBoxGeometry(0.6, h, 0.18, 3, 0.05), stone);
    stoneMesh.position.set(x, h / 2 - 0.05, z);
    stoneMesh.rotation.set(range(-0.15, 0.15), range(-0.4, 0.4), range(-0.15, 0.15));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10, 1, false, 0, Math.PI), stone);
    top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    top.position.y = h / 2;
    stoneMesh.add(top);
    g.add(stoneMesh);
  }

  // Bare, twisted dead trees.
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tree = new THREE.Group();
    tree.position.set(side * range(half + 1.5, half + 6), 0, range(-55, -12));
    const h = range(2.5, 4);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, h, 5), wood);
    trunk.position.y = h / 2;
    trunk.rotation.z = range(-0.15, 0.15);
    tree.add(trunk);
    for (let b = 0; b < 4; b++) {
      const len = range(0.8, 1.6);
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, len, 4), wood);
      const a = range(0, Math.PI * 2);
      branch.position.set(Math.cos(a) * len * 0.35, h * range(0.55, 0.95), Math.sin(a) * len * 0.35);
      branch.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      tree.add(branch);
    }
    g.add(tree);
  }
  return { object: g };
}

// ---------------------------------------------------------------- clouds

function createClouds(): Piece {
  // Dark, soft cloud bands drifting slowly across the sky (they pass in front of the moon).
  const g = new THREE.Group();
  const tex = radialTexture('rgba(70,60,110,0.9)', 'rgba(70,60,110,0)');
  const clouds: Array<{ s: THREE.Sprite; speed: number; x0: number }> = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: range(0.35, 0.6), depthWrite: false, fog: false }));
    s.scale.set(range(90, 160), range(18, 30), 1);
    const x0 = range(-300, 300);
    s.position.set(x0, range(45, 110), -270);
    g.add(s);
    clouds.push({ s, speed: range(1.5, 4), x0 });
  }
  return {
    object: g,
    update(t: number) {
      for (const c of clouds) c.s.position.x = ((c.x0 + t * c.speed + 300) % 600) - 300;
    },
  };
}
