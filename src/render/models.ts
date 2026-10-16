// Enemy models built from three.js primitives, with simple procedural animation.
//   imp     = flame wisp: chibi creature with a fire head, big glowing eyes, red cape, belt + buckle
//   bird    = ghost horse: grey nightmare steed with a burning mane and tail, gallops through the air
//   warlock = skeleton archer: hooded skeleton that draws its bow (charge) and fires at the castle
//   boss    = armoured horse rider: plate armour, crowned pointed helm, shield with emblem, lance
// The element shows in the glowing parts (flame, mane, eye sockets, emblem). Bloom makes them glow.
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
  /** Change the element colours (boss element swaps). */
  setElement(element: Element): void;
  /** World position of the arrow tip (archers only). */
  arrowTip?: (out: THREE.Vector3) => THREE.Vector3;
  dispose(): void;
};

/** Flame colours per element: [outer, inner core]. */
const FLAME: Record<Element, [number, number]> = {
  fire: [0xff6a14, 0xffd65c],
  water: [0x2f8cff, 0xbfe8ff],
  nature: [0x46cc40, 0xd8ffa8],
};

/** Glowing materials that follow the element (flames, eyes, emblems). */
function glowMaterials(element: Element) {
  const outer = new THREE.MeshStandardMaterial({ color: FLAME[element][0], emissive: FLAME[element][0], emissiveIntensity: 1.8, flatShading: true });
  const inner = new THREE.MeshStandardMaterial({ color: FLAME[element][1], emissive: FLAME[element][1], emissiveIntensity: 2.4, flatShading: true });
  const eye = new THREE.MeshStandardMaterial({ color: ELEMENT_COLOR[element], emissive: ELEMENT_COLOR[element], emissiveIntensity: 3 });
  return {
    outer,
    inner,
    eye,
    set(e: Element) {
      outer.color.set(FLAME[e][0]);
      outer.emissive.set(FLAME[e][0]);
      inner.color.set(FLAME[e][1]);
      inner.emissive.set(FLAME[e][1]);
      eye.color.set(ELEMENT_COLOR[e]);
      eye.emissive.set(ELEMENT_COLOR[e]);
    },
  };
}

const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...opts });

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}

/** A limb that swings from its top end: returns the pivot group. */
function limb(geo: THREE.BufferGeometry, length: number, m: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -length / 2;
  pivot.add(mesh);
  return pivot;
}

export function createEnemyModel(type: EnemyType, element: Element): EnemyModel {
  switch (type) {
    case 'imp':
      return flameWisp(element);
    case 'bird':
      return ghostHorse(element);
    case 'warlock':
      return skeletonArcher(element);
    case 'boss':
      return horseRider(element);
  }
}

// ---------------------------------------------------------------- flame wisp (imp)

function flameWisp(element: Element): EnemyModel {
  const g = glowMaterials(element);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Round brown body + stubby feet.
  const leather = mat(0x6a3f22);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), leather);
  torso.scale.set(1, 0.95, 0.9);
  torso.position.y = 0.55;
  body.add(torso);
  const feet = [-1, 1].map((side) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(0x4a2a16));
    foot.scale.set(1, 0.7, 1.3);
    foot.position.set(side * 0.18, 0.1, 0.04);
    root.add(foot);
    return foot;
  });

  // Belt with a gold buckle.
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.12, 14), mat(0x3a2414));
  belt.position.y = 0.42;
  const buckle = box(0.16, 0.12, 0.05, mat(PALETTE.gold, { metalness: 0.7, roughness: 0.3 }));
  buckle.position.set(0, 0.42, 0.4);
  body.add(belt, buckle);

  // Red cape: open at the front, with a collar and a gold brooch.
  const red = mat(0xa8281e, { side: THREE.DoubleSide });
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.62, 0.72, 14, 1, true, Math.PI * 0.62, Math.PI * 1.76), red);
  cape.position.y = 0.55;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 14), red);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.9;
  const brooch = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(PALETTE.gold, { metalness: 0.8, roughness: 0.25, emissive: PALETTE.gold, emissiveIntensity: 0.3 }));
  brooch.position.set(0, 0.88, 0.32);
  body.add(cape, collar, brooch);

  // Fire head: a glowing ball with tongues of flame licking upward, and two big pale eyes.
  const head = new THREE.Group();
  head.position.y = 1.32;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), g.outer);
  ball.scale.set(1, 0.95, 0.9);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), g.inner);
  core.position.set(0, 0.05, 0.12);
  head.add(ball, core);
  // Tongues of flame: one tall one curling up, smaller ones around it (like the reference art).
  const tongues = [
    { x: 0.05, y: 0.6, z: -0.05, s: 1.5, r: -0.15 },
    { x: -0.3, y: 0.45, z: -0.05, s: 1.0, r: 0.55 },
    { x: 0.35, y: 0.45, z: -0.05, s: 1.05, r: -0.6 },
    { x: -0.15, y: 0.5, z: -0.25, s: 1.1, r: 0.25 },
    { x: 0.2, y: 0.52, z: -0.22, s: 0.9, r: -0.3 },
    { x: -0.42, y: 0.15, z: -0.05, s: 0.65, r: 1.0 },
    { x: 0.45, y: 0.12, z: -0.05, s: 0.6, r: -1.0 },
  ].map((f, i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24 * f.s, 0.62 * f.s, 7), i === 0 ? g.inner : g.outer);
    cone.position.set(f.x, f.y, f.z);
    cone.rotation.z = f.r;
    head.add(cone);
    return { cone, base: f };
  });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xfff0b0, emissiveIntensity: 1.6 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), eyeMat);
    eye.scale.set(0.85, 1.15, 0.4);
    eye.position.set(side * 0.18, 0.02, 0.44);
    head.add(eye);
  }
  body.add(head);
  root.scale.setScalar(1.5);

  return {
    group: root,
    height: 2.9,
    animate(enemy, t) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      const p = (t + enemy.id * 0.41) * 9;
      // Waddle: rock side to side, bounce, alternate feet.
      body.rotation.z = moving ? Math.sin(p) * 0.12 : 0;
      body.position.y = moving ? Math.abs(Math.sin(p)) * 0.06 : 0;
      feet[0].position.z = 0.04 + (moving ? Math.sin(p) * 0.12 : 0);
      feet[1].position.z = 0.04 - (moving ? Math.sin(p) * 0.12 : 0);
      // Flickering flames.
      for (const [i, f] of tongues.entries()) {
        const k = 1 + Math.sin(t * (9 + i * 2) + enemy.id + i) * 0.18;
        f.cone.scale.set(1, k, 1);
        f.cone.rotation.z = f.base.r + Math.sin(t * 5 + i) * 0.12;
      }
      g.outer.emissiveIntensity = 1.7 + Math.sin(t * 13 + enemy.id) * 0.25;
    },
    setElement: g.set,
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- horse (ghost horse + boss mount)

type Horse = {
  group: THREE.Group;
  /** Gallop (or walk) cycle. speed = strides per second. */
  animate(t: number, speed: number, moving: boolean): void;
};

/** A horse facing +z, standing on y = 0. Flame mane/tail if `flame` is given; armour if armored. */
function horse(
  coat: THREE.Material,
  legMat: THREE.Material,
  headMat: THREE.Material,
  eyeMat: THREE.Material,
  flame: { outer: THREE.Material; inner: THREE.Material } | null,
  armored: boolean,
): Horse {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 4, 10), coat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.y = 1.35;
  body.add(barrel);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), coat);
  chest.position.set(0, 1.4, 0.55);
  body.add(chest);

  // Neck and head (head angled down).
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.95, 8), coat);
  neck.position.set(0, 1.95, 0.85);
  neck.rotation.x = 0.55;
  body.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 2.3, 1.2);
  head.rotation.x = 2.2; // muzzle (+y) points forward and down, ears (-y) up and back
  const skull = box(0.3, 0.75, 0.38, headMat);
  skull.position.y = 0.05;
  const muzzle = box(0.26, 0.28, 0.34, headMat);
  muzzle.position.set(0, 0.42, 0.02);
  head.add(skull, muzzle);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), headMat);
    ear.position.set(side * 0.1, -0.38, -0.08);
    ear.rotation.x = Math.PI;
    head.add(ear);
    const eye = box(0.05, 0.1, 0.06, eyeMat);
    eye.position.set(side * 0.155, -0.12, 0.08);
    head.add(eye);
  }
  if (armored) {
    const faceplate = box(0.32, 0.6, 0.12, mat(0x5a5c66, { metalness: 0.2, roughness: 0.5 }));
    faceplate.position.set(0, 0.15, 0.2);
    head.add(faceplate);
  }
  body.add(head);

  // Legs: thigh + shin, pivoting at the hip; dark hooves.
  const hoofMat = mat(0x222026);
  const legs = [
    [-0.24, 0.65],
    [0.24, 0.65],
    [-0.24, -0.6],
    [0.24, -0.6],
  ].map(([x, z]) => {
    const hip = limb(new THREE.CylinderGeometry(0.11, 0.14, 0.7, 6), 0.7, coat);
    hip.position.set(x, 1.25, z);
    const knee = limb(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 6), 0.62, legMat);
    knee.position.y = -0.7;
    const hoof = box(0.16, 0.12, 0.18, hoofMat);
    hoof.position.y = -0.65;
    knee.add(hoof);
    hip.add(knee);
    body.add(hip);
    return { hip, knee, front: z > 0 };
  });

  // Mane and tail: flames for the ghost horse, pale hair for the boss's mount.
  const hair = mat(0xd8d2c0);
  const mane: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = flame ? (i % 2 ? flame.inner : flame.outer) : hair;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, flame ? 0.6 : 0.35, 6), m);
    cone.position.set(0, 1.95 + i * 0.12, 0.62 + i * 0.12);
    cone.rotation.x = -0.6;
    body.add(cone);
    mane.push(cone);
  }
  const tail: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = flame ? (i % 2 ? flame.inner : flame.outer) : hair;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12 - i * 0.02, flame ? 0.8 : 0.7, 6), m);
    cone.position.set(0, 1.45 - i * 0.12, -0.95 - i * 0.18);
    cone.rotation.x = -2.2;
    body.add(cone);
    tail.push(cone);
  }

  // Saddle (ghost horse) or tattered barding (boss mount).
  if (armored) {
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.7, 10, 1, true), mat(0x5a4636, { side: THREE.DoubleSide }));
    cloth.rotation.x = Math.PI / 2;
    cloth.scale.set(1, 1.6, 1);
    cloth.position.y = 1.2;
    body.add(cloth);
  } else {
    const saddle = box(0.5, 0.12, 0.55, mat(0x6a4426));
    saddle.position.set(0, 1.8, 0.05);
    body.add(saddle);
  }

  return {
    group: g,
    animate(t, speed, moving) {
      const p = t * speed * Math.PI * 2;
      legs.forEach((l, i) => {
        // Gallop: front and back pairs out of phase, a small offset within each pair.
        const phase = p + (l.front ? 0 : Math.PI) + (i % 2) * 0.5;
        l.hip.rotation.x = moving ? Math.sin(phase) * 0.6 : 0;
        l.knee.rotation.x = moving ? Math.max(0, -Math.sin(phase + 0.8)) * 0.9 : 0;
      });
      body.position.y = moving ? Math.abs(Math.sin(p)) * 0.08 : 0;
      body.rotation.x = moving ? Math.sin(p) * 0.04 : 0;
      head.rotation.x = 2.2 + (moving ? Math.sin(p) * 0.08 : 0);
      mane.forEach((m, i) => (m.scale.y = 1 + Math.sin(t * 11 + i) * 0.2));
      tail.forEach((c, i) => (c.rotation.z = Math.sin(t * 4 + i) * 0.25));
    },
  };
}

function ghostHorse(element: Element): EnemyModel {
  const g = glowMaterials(element);
  const coat = mat(0x7a7d74, { emissive: 0x1a1d18 });
  const h = horse(coat, mat(0x5d5f58), coat, g.eye, { outer: g.outer, inner: g.inner }, false);
  const root = new THREE.Group();
  root.add(h.group);
  root.scale.setScalar(1.05);
  return {
    group: root,
    height: 2.8,
    animate(enemy, t) {
      h.animate(t + enemy.id, 2.4, enemy.stunT <= 0);
      // Nose-down while diving at the wall.
      root.rotation.x = enemy.pos.y < 3 ? 0.3 : 0;
    },
    setElement: g.set,
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- skeleton archer (warlock)

function skeletonArcher(element: Element): EnemyModel {
  const g = glowMaterials(element);
  const bone = mat(0xe6dcc0);
  const cloth = mat(0x4a5844, { side: THREE.DoubleSide });
  const dark = mat(0x2a2a2e);
  const leather = mat(0x6a4a30);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Legs: thin bones and big boots.
  const legs = [-1, 1].map((side) => {
    const hip = limb(new THREE.CylinderGeometry(0.07, 0.06, 0.9, 6), 0.9, bone);
    hip.position.set(side * 0.16, 1.05, 0);
    const boot = box(0.2, 0.3, 0.3, dark);
    boot.position.set(0, -0.88, 0.04);
    hip.add(boot);
    root.add(hip);
    return hip;
  });
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.55, 8, 1, true), cloth);
  skirt.position.y = 0.95;
  body.add(skirt);

  // Spine, pelvis, belt, rib cage.
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), bone);
  spine.position.y = 1.55;
  const pelvis = box(0.4, 0.14, 0.2, bone);
  pelvis.position.y = 1.15;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 4, 12), leather);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.18;
  body.add(spine, pelvis, belt);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.02, 0.025, 4, 12, Math.PI * 1.4), bone);
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
    rib.position.set(0, 1.85 - i * 0.12, 0.02);
    body.add(rib);
  }

  // Hooded skull with glowing eye sockets.
  const head = new THREE.Group();
  head.position.y = 2.25;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bone);
  skull.scale.set(1, 1.1, 1);
  const jaw = box(0.2, 0.08, 0.14, bone);
  jaw.position.set(0, -0.17, 0.07);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 8, 1, true), cloth);
  hood.position.set(0, 0.12, -0.05);
  hood.rotation.x = -0.15;
  head.add(skull, jaw, hood);
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), g.eye);
    socket.position.set(side * 0.08, 0.02, 0.17);
    head.add(socket);
  }
  body.add(head);
  // Tattered cape hanging from the shoulders.
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), cloth);
  cape.position.set(0, 1.5, -0.2);
  body.add(cape);

  // Arms: left holds the bow out front, right draws the string.
  const armL = limb(new THREE.CylinderGeometry(0.045, 0.04, 0.6, 6), 0.6, bone);
  armL.position.set(-0.25, 1.95, 0);
  armL.rotation.set(1.45, 0, 0.15); // pointing forward (+z)
  const armR = limb(new THREE.CylinderGeometry(0.045, 0.04, 0.6, 6), 0.6, bone);
  armR.position.set(0.25, 1.95, 0);
  body.add(armL, armR);
  for (const arm of [armL, armR]) {
    const glove = box(0.11, 0.14, 0.11, leather);
    glove.position.y = -0.62;
    arm.add(glove);
  }

  // Bow: an arc of dark wood in the left hand, with a string and an arrow.
  const bow = new THREE.Group();
  bow.position.set(-0.22, 1.95, 0.62);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 5, 18, Math.PI * 0.85), mat(0x3a3a34));
  arc.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.075);
  bow.add(arc);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.6, -0.12), new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(0, -0.6, -0.12)]);
  const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xcfc8b0 }));
  bow.add(string);
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 4), mat(0x6a4a30));
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), g.eye);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.45;
  arrow.add(shaft, tip);
  bow.add(arrow);
  body.add(bow);
  const stringPos = stringGeo.attributes.position as THREE.BufferAttribute;

  // Rune circle on the ground while charging (easy to read as "danger").
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
    height: 2.6,
    animate(enemy, t) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      const p = (t + enemy.id * 0.3) * 6;
      legs[0].rotation.x = moving ? Math.sin(p) * 0.45 : 0;
      legs[1].rotation.x = moving ? -Math.sin(p) * 0.45 : 0;
      body.position.y = moving ? Math.abs(Math.cos(p)) * 0.04 : 0;
      head.rotation.y = moving ? Math.sin(p * 0.5) * 0.1 : 0;

      // Charging = drawing the bow: right arm pulls back, string and arrow follow, tip glows.
      const charging = enemy.state === 'charge' && enemy.stunT <= 0;
      const pull = charging ? Math.min(1, enemy.stateT / CONFIG.WARLOCK.chargeS) : 0;
      armR.rotation.set(1.45, 0, -0.15 - pull * 0.1);
      armR.position.z = -pull * 0.25;
      const back = -0.2 - pull * 0.45;
      stringPos.setZ(1, back);
      stringPos.needsUpdate = true;
      arrow.visible = enemy.state !== 'recharge';
      arrow.position.z = back + 0.4;
      g.eye.emissiveIntensity = 3 + pull * 5 + (charging ? Math.sin(t * 20) * 0.5 : 0);
      bow.rotation.x = charging ? -0.12 : 0; // aim up at the wall
      ringMat.opacity = charging ? 0.35 + pull * 0.5 : 0;
      ring.rotation.z = t * 1.5;
    },
    setElement(e) {
      g.set(e);
      ringMat.color.set(ELEMENT_COLOR[e]);
    },
    arrowTip: (out) => tip.getWorldPosition(out),
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- horse rider (boss)

function horseRider(element: Element): EnemyModel {
  const g = glowMaterials(element);
  // Low metalness: without an environment map, very metallic surfaces render almost black.
  const armor = mat(0x8a8c96, { metalness: 0.25, roughness: 0.5 });
  const armorDark = mat(0x5a5c66, { metalness: 0.2, roughness: 0.6 });
  const gold = mat(PALETTE.gold, { metalness: 0.3, roughness: 0.4, emissive: PALETTE.gold, emissiveIntensity: 0.35 });
  const root = new THREE.Group();

  // Mount: pale head, dark legs, tattered barding.
  const mount = horse(mat(0x5a5462), mat(0x2e2a34), mat(0xd8d2c0), g.eye, null, true);
  root.add(mount.group);

  // Knight sitting on the horse.
  const knight = new THREE.Group();
  knight.position.set(0, 1.75, -0.05);
  root.add(knight);
  const hips = box(0.6, 0.3, 0.5, armorDark);
  hips.position.y = 0.2;
  const torso = box(0.62, 0.65, 0.42, armor);
  torso.position.y = 0.65;
  torso.rotation.x = 0.08;
  knight.add(hips, torso);
  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), armor);
    pauldron.scale.set(1.2, 0.8, 1);
    pauldron.position.set(side * 0.42, 0.95, 0);
    knight.add(pauldron);
    const thigh = box(0.18, 0.18, 0.5, armorDark);
    thigh.position.set(side * 0.38, 0.15, 0.15);
    const shin = box(0.16, 0.5, 0.16, armorDark);
    shin.position.set(side * 0.48, -0.2, 0.32);
    knight.add(thigh, shin);
  }

  // Pointed helm with a glowing visor slit and a gold crown (it's the boss).
  const helm = new THREE.Group();
  helm.position.y = 1.2;
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.42, 8), armor);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8), armor);
  spire.position.y = 0.48;
  const visor = box(0.3, 0.05, 0.05, g.eye);
  visor.position.set(0, 0.04, 0.24);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 10, 1, true), gold);
  crown.position.y = 0.22;
  helm.add(dome, spire, visor, crown);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), gold);
    point.position.set(Math.sin(a) * 0.27, 0.33, Math.cos(a) * 0.27);
    helm.add(point);
  }
  knight.add(helm);

  // Hexagonal shield on the left arm with a glowing emblem (the boss's element).
  const shield = new THREE.Group();
  shield.position.set(-0.55, 0.6, 0.15);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 6), armorDark);
  plate.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  const emblem = new THREE.Group();
  const emblemV = box(0.03, 0.34, 0.06, g.inner);
  const emblemTop = box(0.03, 0.06, 0.26, g.inner);
  const emblemBot = box(0.03, 0.06, 0.26, g.inner);
  emblemTop.position.y = 0.17;
  emblemBot.position.y = -0.17;
  emblem.add(emblemV, emblemTop, emblemBot);
  emblem.position.x = -0.04;
  shield.add(plate, emblem);
  shield.rotation.y = -0.35;
  knight.add(shield);

  // Lance in the right hand, spear tips at both ends, angled forward.
  const lance = new THREE.Group();
  lance.position.set(0.45, 0.7, 0.1);
  lance.rotation.x = 1.05;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), mat(0x2a2620));
  const tipA = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 4), armor);
  tipA.position.y = 1.8;
  const tipB = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), armor);
  tipB.position.y = -1.75;
  tipB.rotation.x = Math.PI;
  lance.add(pole, tipA, tipB);
  knight.add(lance);

  const scale = 1.45;
  root.scale.setScalar(scale);

  return {
    group: root,
    height: 3.6 * scale,
    animate(enemy, t) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      mount.animate(t + enemy.id, 1.1, moving);
      knight.position.y = 1.75 + (moving ? Math.abs(Math.sin(t * 1.1 * Math.PI * 2)) * 0.06 : 0);
      lance.rotation.x = 1.05 + (moving ? Math.sin(t * 2.2) * 0.04 : 0);
      g.eye.emissiveIntensity = 3 + Math.sin(t * 3) * 0.6;
    },
    setElement: g.set,
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- helpers

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
}
