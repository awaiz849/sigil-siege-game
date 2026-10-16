// Enemy models built from three.js primitives, with simple procedural animation.
//   imp     = stone golem, walks (arms and legs swing)
//   bird    = fast imp, flaps its wings
//   warlock = hooded mage with a staff; the orb glows and a rune circle spins while charging
//   boss    = giant golem with a gold crown and a glowing core
// Each model glows in its element colour (eyes, runes, orb). Bloom makes the glow pop.
import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { Element, Enemy, EnemyType } from '../game/types.ts';
import { ELEMENT_COLOR, PALETTE } from './palette.ts';

export type EnemyModel = {
  group: THREE.Group;
  /** Height of the head above the model's feet (for badges and aim rings). */
  height: number;
  /** Per-frame animation. t = time in seconds. */
  animate(enemy: Enemy, t: number, dt: number): void;
  /** Change glow + tint colour (boss element swaps). */
  setElement(element: Element): void;
  dispose(): void;
};

/** Materials that follow the element colour. */
function elementMaterials(element: Element) {
  const color = new THREE.Color(ELEMENT_COLOR[element]);
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 });
  // Body stone gets a slight tint of the element so the silhouette already hints at it.
  const stone = new THREE.MeshStandardMaterial({ color: tintedStone(element), flatShading: true, roughness: 0.9 });
  return {
    glow,
    stone,
    set(e: Element) {
      const c = new THREE.Color(ELEMENT_COLOR[e]);
      glow.color.copy(c);
      glow.emissive.copy(c);
      stone.color.copy(tintedStone(e));
    },
  };
}

function tintedStone(element: Element): THREE.Color {
  return new THREE.Color(0x8a8780).lerp(new THREE.Color(ELEMENT_COLOR[element]), 0.45).multiplyScalar(0.8);
}

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/** A limb that swings from its top end: returns the pivot group. */
function limb(w: number, h: number, d: number, mat: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  const m = box(w, h, d, mat);
  m.position.y = -h / 2;
  pivot.add(m);
  return pivot;
}

export function createEnemyModel(type: EnemyType, element: Element): EnemyModel {
  switch (type) {
    case 'imp':
      return golem(element, 1, false);
    case 'boss':
      return golem(element, 2.3, true);
    case 'bird':
      return bird(element);
    case 'warlock':
      return warlock(element);
  }
}

// ---------------------------------------------------------------- golem (imp + boss)

function golem(element: Element, scale: number, isBoss: boolean): EnemyModel {
  const mats = elementMaterials(element);
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.stoneDark, flatShading: true, roughness: 1 });
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs while walking
  root.add(body);

  // Chunky torso, slightly hunched forward (toward the wall = +z).
  const torso = box(1.3, 1.2, 0.9, mats.stone);
  torso.position.y = 1.55;
  torso.rotation.x = 0.12;
  body.add(torso);
  const belly = box(1.0, 0.5, 0.8, dark);
  belly.position.y = 0.95;
  body.add(belly);

  // Glowing rune / core in the chest.
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), mats.glow);
  core.position.set(0, 1.6, 0.47);
  body.add(core);

  // Head with two glowing eyes.
  const head = box(0.7, 0.6, 0.65, mats.stone);
  head.position.set(0, 2.4, 0.12);
  body.add(head);
  for (const x of [-0.17, 0.17]) {
    const eye = box(0.13, 0.08, 0.05, mats.glow);
    eye.position.set(x, 2.43, 0.46);
    body.add(eye);
  }

  // Shoulder rocks.
  for (const x of [-0.78, 0.78]) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), mats.stone);
    s.position.set(x, 2.05, 0);
    body.add(s);
  }

  // Long arms (golems drag their knuckles) and short legs.
  const armL = limb(0.38, 1.25, 0.4, mats.stone);
  const armR = limb(0.38, 1.25, 0.4, mats.stone);
  armL.position.set(-0.85, 2.0, 0.05);
  armR.position.set(0.85, 2.0, 0.05);
  const fistL = box(0.48, 0.42, 0.48, dark);
  const fistR = box(0.48, 0.42, 0.48, dark);
  fistL.position.y = fistR.position.y = -1.35;
  armL.add(fistL);
  armR.add(fistR);
  body.add(armL, armR);

  const legL = limb(0.45, 0.75, 0.5, dark);
  const legR = limb(0.45, 0.75, 0.5, dark);
  legL.position.set(-0.32, 0.75, 0);
  legR.position.set(0.32, 0.75, 0);
  root.add(legL, legR);

  if (isBoss) {
    // Gold crown with spikes and gems, plus shoulder spikes.
    const gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.8, roughness: 0.3, emissive: PALETTE.gold, emissiveIntensity: 0.25 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 10, 1, true), gold);
    band.position.set(0, 2.78, 0.12);
    body.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 4), gold);
      spike.position.set(Math.sin(a) * 0.4, 3.0, 0.12 + Math.cos(a) * 0.4);
      body.add(spike);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), mats.glow);
    gem.position.set(0, 2.82, 0.55);
    body.add(gem);
    for (const x of [-0.78, 0.78]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 5), dark);
      spike.position.set(x, 2.4, 0);
      body.add(spike);
    }
  }

  root.scale.setScalar(scale);
  const stride = isBoss ? 3.2 : 6;

  return {
    group: root,
    height: 3.0 * scale,
    animate(enemy, t) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      const phase = (t + enemy.id * 0.37) * stride;
      const swing = moving ? Math.sin(phase) * 0.6 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.08 : 0;
      body.rotation.z = moving ? Math.sin(phase) * 0.04 : 0;
      core.rotation.y = t * 2;
      mats.glow.emissiveIntensity = 2 + Math.sin(t * 4 + enemy.id) * 0.5;
    },
    setElement: mats.set,
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- bird (fast imp)

function bird(element: Element): EnemyModel {
  const mats = elementMaterials(element);
  const feather = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ELEMENT_COLOR[element]).multiplyScalar(0.55),
    flatShading: true,
  });
  const gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, flatShading: true });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), feather);
  torso.scale.set(0.9, 0.8, 1.4);
  body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), feather);
  head.position.set(0, 0.25, 0.6);
  body.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), gold);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.2, 0.95);
  body.add(beak);
  for (const x of [-0.13, 0.13]) {
    const eye = box(0.08, 0.06, 0.04, mats.glow);
    eye.position.set(x, 0.32, 0.85);
    body.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 4), mats.glow);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0.05, -0.85);
  body.add(tail);

  // Wings: flat triangles pivoting at the body; glowing tips.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.35);
  wingShape.lineTo(1.6, 0);
  wingShape.lineTo(0, -0.35);
  const wingGeo = new THREE.ShapeGeometry(wingShape);
  wingGeo.rotateX(-Math.PI / 2);
  const wingMat = feather.clone();
  wingMat.side = THREE.DoubleSide;
  const wingL = new THREE.Group();
  const wingR = new THREE.Group();
  const wl = new THREE.Mesh(wingGeo, wingMat);
  wl.scale.x = -1;
  wingL.add(wl);
  wingR.add(new THREE.Mesh(wingGeo, wingMat));
  wingL.position.set(-0.3, 0.1, 0);
  wingR.position.set(0.3, 0.1, 0);
  body.add(wingL, wingR);

  return {
    group: root,
    height: 1.1,
    animate(enemy, t) {
      const flap = Math.sin((t + enemy.id) * 14) * 0.7;
      wingL.rotation.z = -flap;
      wingR.rotation.z = flap;
      body.position.y = Math.sin((t + enemy.id) * 14 + 1) * 0.08;
      // Tilt nose-down while diving toward the wall.
      body.rotation.x = enemy.pos.y < 3 ? 0.35 : 0;
    },
    setElement: mats.set,
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- warlock

function warlock(element: Element): EnemyModel {
  const mats = elementMaterials(element);
  const robe = new THREE.MeshStandardMaterial({ color: PALETTE.robe, flatShading: true, roughness: 0.9 });
  const shadow = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const wood = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const gown = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 8, 1, true), robe);
  gown.position.y = 1.1;
  body.add(gown);
  // Element-coloured trim at the hem.
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 4, 16), mats.glow);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.08;
  body.add(trim);

  // Hood: cone tip over a dark face with glowing eyes.
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 8), robe);
  hood.position.set(0, 2.55, -0.05);
  hood.rotation.x = -0.25;
  body.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), shadow);
  face.position.set(0, 2.3, 0.08);
  body.add(face);
  for (const x of [-0.1, 0.1]) {
    const eye = box(0.07, 0.05, 0.03, mats.glow);
    eye.position.set(x, 2.33, 0.36);
    body.add(eye);
  }

  // Staff with a glowing orb, held to the right.
  const staff = new THREE.Group();
  staff.position.set(0.7, 0, 0.2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3, 6), wood);
  pole.position.y = 1.5;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), mats.glow);
  orb.position.y = 3.15;
  const prongs = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 4, 8, Math.PI), wood);
  prongs.position.y = 3.05;
  staff.add(pole, orb, prongs);
  body.add(staff);

  // Rune circle on the ground, visible only while charging.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.3, 32),
    new THREE.MeshBasicMaterial({ color: ELEMENT_COLOR[element], transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);
  const ringMat = ring.material as THREE.MeshBasicMaterial;

  return {
    group: root,
    height: 3.0,
    animate(enemy, t) {
      // Hover-glide: mages don't walk, they drift.
      body.position.y = 0.1 + Math.sin(t * 2 + enemy.id) * 0.06;
      const charging = enemy.state === 'charge' && enemy.stunT <= 0;
      // Charge progress 0..1 over the charge time.
      const p = charging ? Math.min(1, enemy.stateT / CONFIG.WARLOCK.chargeS) : 0;
      orb.scale.setScalar(1 + p * 1.6 + (charging ? Math.sin(t * 20) * 0.1 : 0));
      mats.glow.emissiveIntensity = 2 + p * 5;
      staff.rotation.z = charging ? -0.35 : 0; // raise the staff toward the castle
      staff.rotation.x = charging ? -0.3 : 0;
      ringMat.opacity = charging ? 0.35 + p * 0.5 : 0;
      ring.rotation.z = t * 1.5;
      ring.scale.setScalar(1 + p * 0.4);
    },
    setElement(e) {
      mats.set(e);
      ringMat.color.set(ELEMENT_COLOR[e]);
    },
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- helpers

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
