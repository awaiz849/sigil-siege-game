// The player's wizard (third-person view), built from primitives in a Clash-of-Clans-like style:
// purple hooded robe with gold trim, a cape, and a glowing orb of magic between his hands.
// He reacts to the hand pose: idle sway, right arm raised while drawing, both arms thrust
// forward when a spell is cast, arms spread with a cyan glow for the shield.
// When public/models/wizard.glb is loaded it replaces the primitive figure (orb, light and
// rune circle stay); the model then leans into each cast instead of moving its arms.
// He follows your real hand: the body turns toward where the cursor points, and the magic orb
// floats toward the cursor (raised while drawing), glowing in the element being drawn / last cast.
import * as THREE from 'three';
import { toon } from './toon.ts';
import { onCursor, type Pose } from '../events.ts';
import { PALETTE } from './palette.ts';
import { radialTexture } from './environment.ts';
import { staffSwing, whenGlbLoaded } from './glbModels.ts';
import { CONFIG } from '../config.ts';
import type { Hero } from '../game/types.ts';

const ROBE = 0x8a45d0;
const ROBE_DARK = 0x55288a;
const SKIN = 0xf0c8a0;

export function createWizard() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // sways while idle
  root.add(body);
  const figure = new THREE.Group(); // the primitive wizard (hidden when the GLB model loads)
  body.add(figure);
  const glbFigure = new THREE.Group(); // the GLB hero (wizard or Grand Warden), leans into casts
  body.add(glbFigure);
  // Both heroes stand on the same rig (orb, light, rune circle); setHero() shows one of them.
  let hero: Hero = 'wizard';
  const models: Partial<Record<Hero, THREE.Object3D>> = {};
  let staff: { set(angle: number): void } | null = null;
  function showHero() {
    for (const [k, m] of Object.entries(models)) m.visible = k === hero;
    figure.visible = !models[hero]; // primitive wizard only while no model is loaded
  }
  for (const key of ['wizard', 'warden'] as const) {
    whenGlbLoaded(key, (model) => {
      models[key] = model;
      glbFigure.add(model);
      const staffCfg = CONFIG.GLB_MODELS[key].staff;
      if (staffCfg) staff = staffSwing(model, staffCfg);
      showHero();
    });
  }
  let swingT = 1; // 0..1 through the staff swing after a cast (1 = at rest)

  const robe = toon({ color: ROBE, flatShading: true, roughness: 0.8 });
  const robeDark = toon({ color: ROBE_DARK, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  const gold = toon({ color: PALETTE.gold, metalness: 0.7, roughness: 0.35, emissive: PALETTE.gold, emissiveIntensity: 0.15 });
  const skin = toon({ color: SKIN, flatShading: true });
  const orbMat = toon({ color: PALETTE.gold, emissive: PALETTE.gold, emissiveIntensity: 3 });

  // Robe: flared skirt + torso, gold hem and belt.
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 1.0, 10), robe);
  skirt.position.y = 0.5;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 20), gold);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.04;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.62, 10), robe);
  torso.position.y = 1.3;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 10), gold);
  belt.position.y = 1.0;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.06), gold);
  buckle.position.set(0, 1.0, -0.35);
  figure.add(skirt, hem, torso, belt, buckle);

  // Shoulder pads (gold) and a cape down the back (the side the camera sees).
  for (const x of [-0.36, 0.36]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), gold);
    pad.scale.set(1.2, 0.6, 1.1);
    pad.position.set(x, 1.6, 0);
    figure.add(pad);
  }
  const capeShape = new THREE.Shape();
  capeShape.moveTo(-0.38, 0);
  capeShape.lineTo(0.38, 0);
  capeShape.lineTo(0.55, -1.45);
  capeShape.lineTo(-0.55, -1.45);
  const cape = new THREE.Mesh(new THREE.ShapeGeometry(capeShape), robeDark);
  cape.position.set(0, 1.62, 0.3);
  cape.rotation.x = 0.12;
  const capeTrim = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.02), gold);
  capeTrim.position.set(0, 0.2, 0.3);
  figure.add(cape, capeTrim);

  // Head: face, white beard, and a big pointed hood.
  const head = new THREE.Group();
  head.position.y = 1.85;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 8), toon({ color: 0xeeeeee, flatShading: true }));
  beard.rotation.x = Math.PI;
  beard.position.set(0, -0.2, -0.12);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), robe);
  hood.position.set(0, 0.03, 0.04);
  const hoodTip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), robe);
  hoodTip.position.set(0, 0.35, 0.12);
  hoodTip.rotation.x = 0.45;
  const hoodTrim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 16), gold);
  hoodTrim.position.set(0, -0.02, -0.12);
  head.add(face, beard, hood, hoodTip, hoodTrim);
  figure.add(head);

  // Arms: sleeve + hand, pivoting at the shoulder.
  function arm(side: number) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.42, 1.55, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.62, 8), robe);
    sleeve.position.y = -0.3;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 12), gold);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.6;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin);
    hand.position.y = -0.7;
    pivot.add(sleeve, cuff, hand);
    figure.add(pivot);
    return { pivot, hand };
  }
  const left = arm(-1);
  const right = arm(1);

  // Magic orb hovering in front of him (forward = -z), with a soft glow sprite.
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), orbMat);
  const orbGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), color: PALETTE.gold, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  orbGlow.scale.setScalar(0.9);
  const orbGroup = new THREE.Group();
  orbGroup.add(orb, orbGlow);
  orbGroup.position.set(0, 1.15, -0.55);
  body.add(orbGroup);

  // A warm-cool light that follows the orb, so he lights the wall around him.
  const light = new THREE.PointLight(PALETTE.gold, 1.5, 6, 2);
  orbGroup.add(light);

  // Rune circle under his feet: appears while drawing, flashes on cast.
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(), color: PALETTE.gold, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), runeMat);
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.03;
  root.add(rune);
  let runeOpacity = 0;

  let pose: Pose = 'other';
  // Cursor position, -0.5..0.5 across / down the screen.
  let cx = 0;
  let cy = 0;
  onCursor((x, y, p) => {
    pose = p;
    cx = x / window.innerWidth - 0.5;
    cy = y / window.innerHeight - 0.5;
  });
  /** The current element's colour (being drawn, or the last spell); null = gold. */
  let element: THREE.Color | null = null;
  let castT = 0; // 1 right after a cast, fades to 0
  const orbColor = new THREE.Color(PALETTE.gold);
  const target = new THREE.Color(PALETTE.gold);
  const tmp = new THREE.Vector3();

  return {
    group: root,

    /** Animate. t = seconds. */
    update(t: number, dt: number) {
      castT = Math.max(0, castT - dt * 3);
      // The Grand Warden waves his staff: wind up back, slash forward, settle (about half a second).
      swingT = Math.min(1, swingT + dt * 2);
      if (staff) staff.set(hero === 'warden' ? staffAngle(swingT) : 0);
      body.position.y = Math.sin(t * 2) * 0.03;
      body.rotation.z = Math.sin(t * 1.3) * 0.02;
      // Turn toward where the hand points (facing -z: a negative turn looks right).
      const yaw = -cx * 0.9;
      cape.rotation.x = 0.12 + Math.sin(t * 2.2) * 0.05;

      // Arm targets per pose (rotation.x > 0 swings the arm forward, toward the field).
      let lx = 0.25, rx = 0.25, lz = 0.15, rz = -0.15;
      if (pose === 'point') {
        rx = 2.5; // right arm raised, drawing in the air
        rz = -0.1;
      } else if (pose === 'palm') {
        lx = rx = 1.6; // arms spread: shield
        lz = 0.9;
        rz = -0.9;
      }
      if (castT > 0) {
        lx = rx = 1.5 + castT * 0.2; // thrust both arms forward
        lz = 0.1;
        rz = -0.1;
      }
      const k = 1 - Math.pow(0.001, dt); // frame-rate independent easing
      left.pivot.rotation.x += (lx - left.pivot.rotation.x) * k;
      right.pivot.rotation.x += (rx - right.pivot.rotation.x) * k;
      left.pivot.rotation.z += (lz - left.pivot.rotation.z) * k;
      right.pivot.rotation.z += (rz - right.pivot.rotation.z) * k;
      // GLB wizard: lean forward (toward the field, -z) on a cast, a little while drawing.
      const lean = -(castT * 0.22 + (pose === 'point' ? 0.06 : 0));
      glbFigure.rotation.x += (lean - glbFigure.rotation.x) * k;
      body.rotation.y += (yaw - body.rotation.y) * k * 0.6;

      // Orb: follows the hand cursor in front of him (higher while drawing); the primitive
      // wizard still holds it in his raised right hand.
      if (pose === 'point' && figure.visible) {
        right.hand.getWorldPosition(tmp);
        body.worldToLocal(tmp);
        orbGroup.position.lerp(tmp.add(new THREE.Vector3(0, 0.15, 0)), k);
      } else {
        const raise = pose === 'point' ? 0.45 : 0;
        orbGroup.position.lerp(tmp.set(cx * 1.6, 1.2 - cy * 0.9 + raise + Math.sin(t * 3) * 0.05, -0.65), k);
      }
      if (pose === 'palm') target.set(0x9fe6ff);
      else if (element) target.copy(element);
      else target.set(PALETTE.gold);
      orbColor.lerp(target, k);
      if (castT <= 0) {
        orbMat.color.copy(orbColor);
        orbMat.emissive.copy(orbColor);
        (orbGlow.material as THREE.SpriteMaterial).color.copy(orbColor);
        light.color.copy(orbColor);
      }
      const s = 1 + castT * 1.5 + Math.sin(t * 6) * 0.05;
      orb.scale.setScalar(s);
      orbGlow.scale.setScalar(0.9 * s + (pose === 'palm' ? 0.8 : 0) + (element ? 0.35 : 0));
      orb.rotation.y = t * 2;
      light.intensity = 1.5 + castT * 4 + (pose === 'palm' ? 1.5 : 0);

      // Rune circle: fades in while drawing, bursts bigger on cast, spins slowly.
      const want = pose === 'point' ? 0.85 : castT > 0 ? castT : 0;
      runeOpacity += (want - runeOpacity) * k;
      runeMat.opacity = runeOpacity;
      rune.rotation.z = t * 0.6;
      rune.scale.setScalar(1 + castT * 0.5);
      if (castT <= 0) runeMat.color.copy(orbColor);
    },

    /** The element being drawn right now (live recognition) or null: the orb glows in its colour. */
    setElement(color: number | null) {
      if (color === null) return; // keep the last element until a new one is recognized
      element = (element ?? new THREE.Color()).set(color);
    },

    /** A spell was cast: arms thrust, orb flashes in the spell colour (and keeps glowing in it). */
    cast(color: number) {
      castT = 1;
      swingT = 0;
      element = (element ?? new THREE.Color()).set(color);
      runeMat.color.set(color);
      orbMat.color.set(color);
      orbMat.emissive.set(color);
      (orbGlow.material as THREE.SpriteMaterial).color.set(color);
      light.color.set(color);
    },

    /** Which hero stands on the wall (level 1 wizard, level 2 Grand Warden). */
    setHero(next: Hero) {
      hero = next;
      showHero();
    },

    /** World position spells fly from (the orb). */
    orbWorldPosition(out: THREE.Vector3) {
      return orbGroup.getWorldPosition(out);
    },
  };
}

export type Wizard = ReturnType<typeof createWizard>;

/** Staff swing over one cast (s = 0..1): wind up back, slash forward toward the field, settle. */
function staffAngle(s: number): number {
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  if (s < 0.3) return -0.7 * ease(s / 0.3);
  if (s < 0.6) return -0.7 + 1.6 * ease((s - 0.3) / 0.3);
  return 0.9 * (1 - ease((s - 0.6) / 0.4));
}

/** Magic circle drawn on a canvas: two rings, tick marks, small rune glyphs and a star. */
function runeTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const m = size / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(m, m, 120, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(m, m, 96, 0, Math.PI * 2);
  ctx.stroke();
  // Tick marks between the rings.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = i % 4 === 0 ? 98 : 106;
    ctx.beginPath();
    ctx.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0);
    ctx.lineTo(m + Math.cos(a) * 118, m + Math.sin(a) * 118);
    ctx.stroke();
  }
  // Six-pointed star made of two triangles.
  ctx.lineWidth = 3;
  for (const off of [0, Math.PI / 3]) {
    ctx.beginPath();
    for (let k = 0; k <= 3; k++) {
      const a = off + (k / 3) * Math.PI * 2 - Math.PI / 2;
      const x = m + Math.cos(a) * 92;
      const y = m + Math.sin(a) * 92;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(m, m, 40, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
