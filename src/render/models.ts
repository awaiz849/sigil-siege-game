// Enemy models, built from three.js primitives in the style of our concept art (cel shading + ink
// outlines come from toon.ts). Smooth shapes: lathed profiles, extruded 2D outlines, tubes.
//   imp     = flame wisp: cartoon flame head with big outlined eyes, red cape, round body, belt + buckle
//   bird    = ghost horse: slender grey steed, arched neck, flaming mane and tail, saddle, feathered hooves
//   warlock = skeleton archer: hooded skull, ribs, bracers, recurve bow it draws while charging
//   boss    = horse rider: angular plate armour, faceted crowned helm, hex shield, leaf-bladed lance
// The element shows in the glowing parts (flame, mane, eye sockets, visor). Bloom makes them glow.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './toon.ts';
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

// ---------------------------------------------------------------- shared materials + shapes

/** Flame colours per element: [outer, inner core]. */
const FLAME: Record<Element, [number, number]> = {
  fire: [0xff7a18, 0xffd85e],
  water: [0x2f8cff, 0xbfe8ff],
  nature: [0x46cc40, 0xd8ffa8],
};

/** Glowing materials that follow the element (flames, eyes, visor). */
function glowMaterials(element: Element) {
  const outer = toon({ color: FLAME[element][0], emissive: FLAME[element][0], emissiveIntensity: 1.5 });
  const inner = toon({ color: FLAME[element][1], emissive: FLAME[element][1], emissiveIntensity: 2.2 });
  const eye = toon({ color: ELEMENT_COLOR[element], emissive: ELEMENT_COLOR[element], emissiveIntensity: 3 });
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

const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) => toon({ color, ...opts });

/** Mesh helper. */
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  return me;
}

/** Rounded box: angular but with soft edges (armour, buckles, boots). */
const rbox = (w: number, h: number, d: number, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, r);

/** Solid of revolution from [radius, height] pairs (bodies, hoods, capes).
 *  frontGap = width (radians) of an opening facing forward (+z), e.g. an open cape or hood. */
function lathe(profile: Array<[number, number]>, segments = 24, frontGap = 0) {
  // Lathe angle 0 points along +z, so the gap is centred there.
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments, frontGap / 2, Math.PI * 2 - frontGap);
}

/** Extruded 2D outline with soft bevelled edges, centred on z. */
function extrude(shape: THREE.Shape, depth: number, bevel = 0.04) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 18 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Cartoon flame outline (about 1.2 wide, 1.7 tall): round bottom, a big curling tongue, two small ones. */
function flameShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.6);
  s.bezierCurveTo(0.45, -0.6, 0.64, -0.3, 0.6, 0.05);
  s.quadraticCurveTo(0.62, 0.38, 0.74, 0.6); // right tongue tip
  s.quadraticCurveTo(0.48, 0.48, 0.38, 0.4);
  s.quadraticCurveTo(0.42, 0.8, 0.12, 1.12); // main tongue tip, curling left
  s.quadraticCurveTo(0.12, 0.72, -0.05, 0.62);
  s.quadraticCurveTo(-0.2, 0.86, -0.44, 0.92); // left tongue tip
  s.quadraticCurveTo(-0.3, 0.6, -0.5, 0.36);
  s.bezierCurveTo(-0.7, 0.05, -0.48, -0.6, 0, -0.6);
  return s;
}

/** Leaf-shaped blade (spear tips, arrow heads), pointing +y. */
function leafShape(len: number, width: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(width, len * 0.35, 0, len);
  s.quadraticCurveTo(-width, len * 0.35, 0, 0);
  return s;
}

/** A pivot group with a mesh hanging below it (limbs that swing from the top). */
function limb(geo: THREE.BufferGeometry, length: number, m: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(mesh(geo, m, 0, -length / 2, 0));
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

  // Round, slightly pear-shaped brown body.
  const leather = mat(0x7a4626);
  body.add(mesh(lathe([[0, 0.12], [0.3, 0.18], [0.42, 0.36], [0.42, 0.56], [0.34, 0.78], [0.22, 0.9], [0, 0.94]], 28), leather));
  const feet = [-1, 1].map((side) => {
    const foot = mesh(new THREE.SphereGeometry(0.13, 16, 12), mat(0x4e2c16), side * 0.17, 0.1, 0.05);
    foot.scale.set(1, 0.7, 1.35);
    root.add(foot);
    return foot;
  });

  // Belt with a square gold buckle (with a dark hole, like the art).
  body.add(mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.11, 28), mat(0x3e2412), 0, 0.42, 0));
  const buckle = mesh(rbox(0.2, 0.15, 0.05, 0.02), mat(PALETTE.gold, { emissive: PALETTE.gold, emissiveIntensity: 0.15 }), 0, 0.42, 0.42);
  buckle.add(mesh(rbox(0.1, 0.06, 0.03, 0.01), mat(0x3e2412), 0, 0, 0.02));
  body.add(buckle);

  // Red cape draped over the shoulders, open at the front, with a thick collar and a round brooch.
  const red = mat(0xb02a1e, { side: THREE.DoubleSide });
  const cape = mesh(lathe([[0.3, 0.92], [0.42, 0.82], [0.56, 0.55], [0.66, 0.24], [0.64, 0.2]], 28, Math.PI * 0.24), red);
  body.add(cape);
  const collar = mesh(new THREE.TorusGeometry(0.29, 0.085, 12, 28), mat(0x8a1e16), 0, 0.92, 0);
  collar.rotation.x = Math.PI / 2;
  body.add(collar);
  const brooch = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 20), mat(PALETTE.gold, { emissive: PALETTE.gold, emissiveIntensity: 0.25 }), 0, 0.9, 0.36);
  brooch.rotation.x = Math.PI / 2;
  brooch.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), mat(0xffd96a, { emissive: 0xffc040, emissiveIntensity: 0.4 }), 0, 0.01, 0));
  body.add(brooch);

  // Flame head: thick cartoon flame (outer colour) with a lighter inner flame in front, eyes on top.
  const head = new THREE.Group();
  head.position.y = 1.5;
  const outerFlame = mesh(extrude(flameShape(), 0.42, 0.12), g.outer);
  const innerFlame = mesh(extrude(flameShape(), 0.1, 0.05), g.inner, 0.03, -0.12, 0.3);
  innerFlame.scale.setScalar(0.56);
  head.add(outerFlame, innerFlame);
  // Big pale oval eyes, each with a dark-orange ring (the outline in the art).
  const eyeMat = toon({ color: 0xfff3c4, emissive: 0xfff0b8, emissiveIntensity: 1.4 });
  const ringMat = mat(0xa8400e);
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 28), eyeMat, side * 0.2, 0.0, 0.4);
    eye.rotation.x = Math.PI / 2;
    eye.scale.set(1, 1, 1.3);
    const ring = mesh(new THREE.TorusGeometry(0.135, 0.022, 8, 28), ringMat, side * 0.2, 0.0, 0.41);
    ring.scale.set(1, 1.3, 1);
    head.add(eye, ring);
  }
  body.add(head);
  root.scale.setScalar(1.45);

  return {
    group: root,
    height: 3.6,
    animate(enemy, t) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      const p = (t + enemy.id * 0.41) * 9;
      // Waddle: rock side to side, bounce, alternate feet.
      body.rotation.z = moving ? Math.sin(p) * 0.1 : 0;
      body.position.y = moving ? Math.abs(Math.sin(p)) * 0.05 : 0;
      feet[0].position.z = 0.05 + (moving ? Math.sin(p) * 0.12 : 0);
      feet[1].position.z = 0.05 - (moving ? Math.sin(p) * 0.12 : 0);
      // The flame dances: stretches, sways, flickers.
      const f = Math.sin(t * 7 + enemy.id) * 0.06 + Math.sin(t * 13 + enemy.id * 2) * 0.03;
      head.scale.set(1 - f * 0.5, 1 + f, 1);
      head.rotation.z = Math.sin(t * 3 + enemy.id) * 0.06;
      g.outer.emissiveIntensity = 1.4 + Math.sin(t * 11 + enemy.id) * 0.2;
    },
    setElement: g.set,
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- horse (ghost horse + boss mount)

type HorseOpts = {
  coat: THREE.Material;
  lowerLeg: THREE.Material; // feathered fetlocks / dark socks
  head: THREE.Material;
  eye: THREE.Material;
  flame: { outer: THREE.Material; inner: THREE.Material } | null; // flaming mane + tail, or pale hair
  armored: boolean; // face plate + tattered barding instead of a saddle
};

type Horse = { group: THREE.Group; animate(t: number, speed: number, moving: boolean): void };

/** A slender horse facing +z, hooves on y = 0. */
function horse(o: HorseOpts): Horse {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  // Body: barrel + deep chest + rounded hindquarters (overlapping smooth shapes).
  const barrel = mesh(new THREE.SphereGeometry(1, 28, 20), o.coat, 0, 1.45, 0);
  barrel.scale.set(0.38, 0.42, 0.85);
  const chest = mesh(new THREE.SphereGeometry(0.4, 24, 18), o.coat, 0, 1.5, 0.62);
  chest.scale.set(0.95, 1.05, 0.9);
  const rump = mesh(new THREE.SphereGeometry(0.4, 24, 18), o.coat, 0, 1.55, -0.62);
  body.add(barrel, chest, rump);

  // Arched neck: two tapered segments, then a long narrow head angled down.
  const neck = new THREE.Group();
  neck.position.set(0, 1.75, 0.78);
  neck.rotation.x = 0.55;
  neck.add(mesh(new THREE.CylinderGeometry(0.17, 0.29, 0.95, 20), o.coat, 0, 0.42, 0));
  const crest = mesh(new THREE.SphereGeometry(0.2, 16, 12), o.coat, 0, 0.62, -0.06);
  crest.scale.set(0.8, 1.6, 0.9);
  neck.add(crest);
  body.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 2.42, 1.22);
  head.rotation.x = 2.05; // +y (muzzle) points forward and down
  head.add(mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.72, 20), o.head, 0, 0.18, 0)); // face
  const jaw = mesh(new THREE.SphereGeometry(0.17, 18, 14), o.head, 0, -0.12, -0.04);
  jaw.scale.set(0.9, 1, 1.1);
  const muzzle = mesh(new THREE.SphereGeometry(0.12, 18, 14), o.head, 0, 0.55, 0.02);
  muzzle.scale.set(1, 0.9, 1.1);
  head.add(jaw, muzzle);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.05, 0.2, 12), o.head, side * 0.08, -0.32, -0.06);
    ear.rotation.set(Math.PI, 0, side * 0.2);
    head.add(ear);
    head.add(mesh(new THREE.SphereGeometry(0.04, 12, 10), o.eye, side * 0.13, -0.05, 0.08));
  }
  if (o.armored) {
    // Dark face mask (the boss's mount in the art).
    head.add(mesh(rbox(0.26, 0.5, 0.1, 0.03), mat(0x3e3c46), 0, 0.18, 0.13));
  } else {
    // Pale blaze down the face.
    head.add(mesh(rbox(0.06, 0.5, 0.04, 0.02), mat(0xe8e2c8), 0, 0.2, 0.15));
  }
  body.add(head);

  // Legs: tapered thigh + thin cannon, a tuft of feathered fur at the fetlock, dark hoof.
  const hoofMat = mat(0x2a2628);
  const legs = [
    [-0.2, 0.62],
    [0.2, 0.62],
    [-0.21, -0.62],
    [0.21, -0.62],
  ].map(([x, z]) => {
    const hip = limb(new THREE.CylinderGeometry(0.08, 0.15, 0.72, 16), 0.72, o.coat);
    hip.position.set(x, 1.32, z);
    const knee = limb(new THREE.CylinderGeometry(0.05, 0.065, 0.55, 14), 0.55, o.lowerLeg);
    knee.position.y = -0.72;
    knee.add(mesh(new THREE.ConeGeometry(0.1, 0.18, 14, 1, true), o.lowerLeg, 0, -0.52, 0)); // feathering
    knee.add(mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.1, 16), hoofMat, 0, -0.62, 0.01));
    hip.add(knee);
    body.add(hip);
    return { hip, knee, front: z > 0 };
  });

  // Mane and tail: extruded cartoon flames, or pale hair for the boss's mount.
  const hair = mat(0xd8d2c0);
  const mane: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = o.flame ? (i % 2 ? o.flame.inner : o.flame.outer) : hair;
    const tuft = mesh(extrude(flameShape(), 0.06, 0.03), m, 0, 1.95 + i * 0.16, 0.6 + i * 0.13);
    tuft.rotation.set(-0.3, Math.PI / 2, 0);
    tuft.scale.setScalar(o.flame ? 0.42 - i * 0.03 : 0.28);
    body.add(tuft);
    mane.push(tuft);
  }
  const tail = mesh(extrude(flameShape(), 0.08, 0.04), o.flame ? o.flame.outer : hair, 0, 1.5, -1.02);
  tail.rotation.set(-0.6, Math.PI / 2, 0);
  tail.scale.setScalar(o.flame ? 0.75 : 0.5);
  body.add(tail);

  if (o.armored) {
    // Tattered barding: a cloth skirt round the body with a ragged hem.
    const cloth = mesh(lathe([[0.5, 0.3], [0.52, 0.0], [0.56, -0.25]], 24), mat(0x5e4838, { side: THREE.DoubleSide }), 0, 1.45, 0);
    cloth.scale.set(1, 1, 2);
    body.add(cloth);
  } else {
    // Saddle with a girth strap.
    const saddle = mesh(rbox(0.46, 0.14, 0.6, 0.06), mat(0x6e4626), 0, 1.86, 0.02);
    const girth = mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 28), mat(0x4a2e18), 0, 1.45, 0.05);
    girth.rotation.y = Math.PI / 2;
    girth.scale.set(1, 1.05, 0.95);
    body.add(saddle, girth);
  }

  return {
    group: g,
    animate(t, speed, moving) {
      const p = t * speed * Math.PI * 2;
      legs.forEach((l, i) => {
        // Gallop: front and back pairs out of phase, a small offset within each pair.
        const phase = p + (l.front ? 0 : Math.PI) + (i % 2) * 0.5;
        l.hip.rotation.x = moving ? Math.sin(phase) * 0.55 : 0;
        l.knee.rotation.x = moving ? Math.max(0, -Math.sin(phase + 0.8)) * 0.9 : 0;
      });
      body.position.y = moving ? Math.abs(Math.sin(p)) * 0.08 : 0;
      body.rotation.x = moving ? Math.sin(p) * 0.04 : 0;
      head.rotation.x = 2.05 + (moving ? Math.sin(p) * 0.06 : 0);
      mane.forEach((m, i) => (m.scale.y = m.scale.x * (1 + Math.sin(t * 9 + i) * 0.15)));
      tail.rotation.x = -0.6 + Math.sin(t * 4) * 0.12;
    },
  };
}

function ghostHorse(element: Element): EnemyModel {
  const g = glowMaterials(element);
  const coat = mat(0x8a8c80, { emissive: 0x1a1d18 });
  const h = horse({ coat, lowerLeg: mat(0xcfc3a2), head: coat, eye: g.eye, flame: { outer: g.outer, inner: g.inner }, armored: false });
  const root = new THREE.Group();
  root.add(h.group);
  root.scale.setScalar(1.05);
  return {
    group: root,
    height: 2.9,
    animate(enemy, t) {
      h.animate(t + enemy.id, 2.4, enemy.stunT <= 0);
      root.rotation.x = enemy.pos.y < 3 ? 0.3 : 0; // nose-down while diving at the wall
      // Run at a slight angle so the castle sees a three-quarter view (mane, flank), not a thin front.
      root.rotation.y = enemy.id % 2 ? 0.45 : -0.45;
    },
    setElement: g.set,
    dispose: () => disposeTree(root),
  };
}

// ---------------------------------------------------------------- skeleton archer (warlock)

function skeletonArcher(element: Element): EnemyModel {
  const g = glowMaterials(element);
  const bone = mat(0xebe0c2);
  const cloth = mat(0x55644e, { side: THREE.DoubleSide });
  const darkCloth = mat(0x34363a, { side: THREE.DoubleSide });
  const leather = mat(0x7a5434);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Legs: ragged trouser legs and tall boots with a folded cuff.
  const legs = [-1, 1].map((side) => {
    const hip = limb(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 16), 0.62, darkCloth);
    hip.position.set(side * 0.15, 1.12, 0);
    const boot = mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.42, 16), mat(0x4a4c50), 0, -0.78, 0);
    boot.add(mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.1, 16), mat(0x5e6064), 0, 0.2, 0)); // cuff
    boot.add(mesh(rbox(0.2, 0.1, 0.3, 0.04), mat(0x3a3c40), 0, -0.2, 0.06)); // foot
    hip.add(boot);
    root.add(hip);
    return hip;
  });
  // Ragged skirt over the hips.
  body.add(mesh(lathe([[0.22, 1.22], [0.3, 1.0], [0.36, 0.78]], 20), darkCloth));

  // Belt with pouches.
  const belt = mesh(new THREE.TorusGeometry(0.22, 0.04, 10, 24), leather, 0, 1.2, 0);
  belt.rotation.x = Math.PI / 2;
  body.add(belt);
  body.add(mesh(rbox(0.1, 0.06, 0.04, 0.01), mat(0x707070), 0, 1.2, 0.23)); // buckle
  for (const [x, z] of [[-0.22, 0.08], [0.24, -0.04]]) body.add(mesh(rbox(0.14, 0.16, 0.1, 0.03), leather, x, 1.08, z));

  // Spine of small vertebrae and a rib cage of curved bones.
  for (let i = 0; i < 5; i++) body.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), bone, 0, 1.28 + i * 0.12, -0.04));
  for (let i = 0; i < 4; i++) {
    const rib = mesh(new THREE.TorusGeometry(0.19 - i * 0.015, 0.024, 8, 20, Math.PI * 1.3), bone, 0, 1.86 - i * 0.11, 0.0);
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.85 + Math.PI);
    body.add(rib);
  }
  body.add(mesh(rbox(0.06, 0.4, 0.04, 0.015), bone, 0, 1.68, 0.17)); // sternum

  // Hooded skull: rounded cranium, cheekbones, jaw with teeth, dark sockets with glowing pupils.
  const head = new THREE.Group();
  head.position.y = 2.22;
  const cranium = mesh(new THREE.SphereGeometry(0.19, 20, 16), bone);
  cranium.scale.set(1, 1.05, 1.05);
  const jaw = mesh(rbox(0.2, 0.09, 0.15, 0.03), bone, 0, -0.17, 0.05);
  head.add(cranium, jaw);
  for (let i = 0; i < 5; i++) head.add(mesh(rbox(0.026, 0.03, 0.02, 0.006), mat(0xfff8e4), -0.06 + i * 0.03, -0.11, 0.15));
  const socketMat = mat(0x120a0a);
  for (const side of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.055, 12, 10), socketMat, side * 0.075, 0.0, 0.15));
    head.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), g.eye, side * 0.075, 0.0, 0.19));
  }
  // Hood: a cowl around the skull (open at the front) with a drooping point.
  head.add(mesh(lathe([[0.0, 0.33], [0.18, 0.28], [0.26, 0.12], [0.27, -0.08], [0.23, -0.22]], 24, Math.PI * 0.5), cloth, 0, 0, -0.02));
  const point = mesh(new THREE.ConeGeometry(0.1, 0.3, 14), cloth, 0, 0.3, -0.12);
  point.rotation.x = -0.7;
  head.add(point);
  body.add(head);
  // Mantle over the shoulders.
  body.add(mesh(lathe([[0.16, 2.08], [0.32, 1.98], [0.38, 1.78]], 24, Math.PI * 0.6), cloth));

  // Arms: bone upper arm, leather bracer on the forearm, bony hand.
  function arm(side: number) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27, 1.98, 0);
    shoulder.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.34, 10), bone, 0, -0.17, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    elbow.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.22, 14), leather, 0, -0.14, 0));
    elbow.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), bone, 0, -0.3, 0));
    shoulder.add(elbow);
    body.add(shoulder);
    return { shoulder, elbow };
  }
  const armL = arm(-1);
  const armR = arm(1);
  armL.shoulder.rotation.set(1.5, 0, 0.12); // bow arm points forward (+z)

  // Recurve bow: a dark tube along a curve whose tips flick forward, with a grip wrap.
  const bow = new THREE.Group();
  bow.position.set(-0.22, 1.98, 0.62);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.72, 0.1),
    new THREE.Vector3(0, 0.6, -0.05),
    new THREE.Vector3(0, 0.3, -0.06),
    new THREE.Vector3(0, 0, 0.02),
    new THREE.Vector3(0, -0.3, -0.06),
    new THREE.Vector3(0, -0.6, -0.05),
    new THREE.Vector3(0, -0.72, 0.1),
  ]);
  bow.add(mesh(new THREE.TubeGeometry(curve, 48, 0.03, 10), mat(0x3e3a32)));
  bow.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12), leather, 0, 0, 0.02));
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.72, 0.1), new THREE.Vector3(0, 0, -0.12), new THREE.Vector3(0, -0.72, 0.1)]);
  bow.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xd8d0b8 })));
  const stringPos = stringGeo.attributes.position as THREE.BufferAttribute;
  // Arrow: shaft, glowing leaf head, fletching.
  const arrow = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 8), mat(0x7a5434));
  shaft.rotation.x = Math.PI / 2;
  const tip = mesh(extrude(leafShape(0.18, 0.05), 0.02, 0.008), g.eye, 0, 0, 0.42);
  tip.rotation.x = Math.PI / 2;
  arrow.add(shaft, tip);
  for (const r of [0, Math.PI / 2]) {
    const fin = mesh(new THREE.PlaneGeometry(0.06, 0.14), mat(0xd8d0c0, { side: THREE.DoubleSide }), 0, 0, -0.36);
    fin.rotation.set(Math.PI / 2, r, 0);
    arrow.add(fin);
  }
  bow.add(arrow);
  body.add(bow);

  // Rune circle on the ground while charging (easy to read as "danger").
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.3, 48),
    new THREE.MeshBasicMaterial({ color: ELEMENT_COLOR[element], transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);
  const ringMat = ring.material as THREE.MeshBasicMaterial;
  root.scale.setScalar(1.15);

  return {
    group: root,
    height: 3.0,
    animate(enemy, t, dt) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      const p = (t + enemy.id * 0.3) * 6;
      legs[0].rotation.x = moving ? Math.sin(p) * 0.45 : 0;
      legs[1].rotation.x = moving ? -Math.sin(p) * 0.45 : 0;
      body.position.y = moving ? Math.abs(Math.cos(p)) * 0.04 : 0;
      head.rotation.y = moving ? Math.sin(p * 0.5) * 0.1 : 0;

      // Stopped to shoot: turn side-on (left shoulder to the wall) like a real archer, so the
      // castle sees the bow in profile. Walking: face the wall, bow held forward.
      const shooting = enemy.state !== 'walk';
      const k = 1 - Math.pow(0.002, dt);
      body.rotation.y += ((shooting ? Math.PI / 2 : 0) - body.rotation.y) * k;
      // Charging = drawing the bow: the right hand pulls the string back, the arrow follows.
      const charging = enemy.state === 'charge' && enemy.stunT <= 0;
      const pull = charging ? Math.min(1, enemy.stateT / CONFIG.WARLOCK.chargeS) : 0;
      if (shooting) {
        armL.shoulder.rotation.set(0, 0, -Math.PI / 2); // bow arm straight out toward the wall (local -x)
        armR.shoulder.rotation.set(0, 0, -Math.PI / 2 + 0.4 + pull * 0.5);
        armR.elbow.rotation.set(0, 0, pull * 1.8); // drawing hand comes back to the chin
        bow.position.set(-0.85, 1.98, 0);
        bow.rotation.set(0, -Math.PI / 2, 0);
      } else {
        armL.shoulder.rotation.set(1.5, 0, 0.12);
        armR.shoulder.rotation.set(0.3, 0, -0.15);
        armR.elbow.rotation.set(-0.4, 0, 0);
        bow.position.set(-0.22, 1.98, 0.62);
        bow.rotation.set(0, 0, 0);
      }
      const back = -0.12 - pull * 0.5;
      stringPos.setZ(1, back);
      stringPos.needsUpdate = true;
      arrow.visible = enemy.state !== 'recharge';
      arrow.position.z = back + 0.42;
      g.eye.emissiveIntensity = 3 + pull * 5 + (charging ? Math.sin(t * 20) * 0.5 : 0);
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
  const armor = mat(0x8e9098);
  const armorDark = mat(0x5c5e66);
  const mail = mat(0x4a4c54, { side: THREE.DoubleSide });
  const gold = mat(PALETTE.gold, { emissive: PALETTE.gold, emissiveIntensity: 0.3 });
  const root = new THREE.Group();

  // Mount: dark coat and legs, pale head with a dark mask, tattered barding.
  const mount = horse({ coat: mat(0x4a4552), lowerLeg: mat(0x2a2630), head: mat(0xe0dacb), eye: g.eye, flame: null, armored: true });
  root.add(mount.group);

  // Knight, seated.
  const knight = new THREE.Group();
  knight.position.set(0, 1.85, -0.08);
  root.add(knight);
  knight.add(mesh(lathe([[0.3, 0.32], [0.38, 0.05], [0.44, -0.15]], 20), mail)); // mail skirt
  knight.add(mesh(rbox(0.62, 0.62, 0.42, 0.06), armor, 0, 0.62, 0)); // breastplate
  knight.add(mesh(rbox(0.08, 0.5, 0.06, 0.02), armorDark, 0, 0.64, 0.22)); // centre ridge
  for (const side of [-1, 1]) {
    // Layered pauldrons.
    for (let k = 0; k < 2; k++) {
      const pad = mesh(rbox(0.34, 0.12, 0.42, 0.04), k ? armorDark : armor, side * (0.42 + k * 0.03), 0.92 - k * 0.12, 0);
      pad.rotation.z = side * -(0.35 + k * 0.15);
      knight.add(pad);
    }
    knight.add(mesh(rbox(0.18, 0.18, 0.5, 0.04), armorDark, side * 0.36, 0.12, 0.16)); // thigh
    knight.add(mesh(rbox(0.15, 0.5, 0.16, 0.04), armor, side * 0.46, -0.22, 0.34)); // greave
  }

  // Tall faceted helm (6-sided), glowing visor slit, gold crown.
  const helm = new THREE.Group();
  helm.position.y = 1.18;
  helm.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.42, 6), armor));
  helm.add(mesh(new THREE.ConeGeometry(0.22, 0.62, 6), armor, 0, 0.52, 0));
  helm.add(mesh(rbox(0.28, 0.045, 0.05, 0.015), g.eye, 0, 0.04, 0.22));
  helm.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 24, 1, true), gold, 0, 0.22, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    helm.add(mesh(new THREE.ConeGeometry(0.045, 0.16, 8), gold, Math.sin(a) * 0.27, 0.33, Math.cos(a) * 0.27));
  }
  knight.add(helm);

  // Hexagonal shield with a raised rim and a gold "I" emblem (as in the art).
  const hex = new THREE.Shape();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (i === 0) hex.moveTo(Math.cos(a) * 0.45, Math.sin(a) * 0.45);
    else hex.lineTo(Math.cos(a) * 0.45, Math.sin(a) * 0.45);
  }
  const shield = new THREE.Group();
  shield.position.set(-0.58, 0.6, 0.12);
  shield.rotation.y = -Math.PI / 2 + 0.35;
  shield.add(mesh(extrude(hex, 0.05, 0.03), armorDark));
  const emblem = new THREE.Group();
  emblem.position.z = 0.06;
  emblem.add(mesh(rbox(0.07, 0.34, 0.03, 0.01), gold), mesh(rbox(0.26, 0.07, 0.03, 0.01), gold, 0, 0.16, 0), mesh(rbox(0.26, 0.07, 0.03, 0.01), gold, 0, -0.16, 0));
  shield.add(emblem);
  knight.add(shield);

  // Lance with leaf-shaped blades at both ends and metal bands.
  const lance = new THREE.Group();
  lance.position.set(0.48, 0.7, 0.1);
  lance.rotation.x = 1.05;
  lance.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 10), mat(0x2e2a24)));
  const bladeA = mesh(extrude(leafShape(0.6, 0.16), 0.03, 0.015), armor, 0, 1.58, 0);
  const bladeB = mesh(extrude(leafShape(0.45, 0.12), 0.03, 0.015), armor, 0, -1.58, 0);
  bladeB.rotation.z = Math.PI;
  lance.add(bladeA, bladeB);
  for (const y of [1.5, -1.5, 0.4]) lance.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), armorDark, 0, y, 0));
  knight.add(lance);

  const scale = 1.45;
  root.scale.setScalar(scale);

  return {
    group: root,
    height: 3.9 * scale,
    animate(enemy, t) {
      const moving = enemy.state === 'walk' && enemy.stunT <= 0;
      mount.animate(t + enemy.id, 1.1, moving);
      knight.position.y = 1.85 + (moving ? Math.abs(Math.sin(t * 1.1 * Math.PI * 2)) * 0.06 : 0);
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
    const me = o as THREE.Mesh;
    if (me.geometry) me.geometry.dispose();
    const m = me.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
}
