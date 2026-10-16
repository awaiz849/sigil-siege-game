// The player's wizard (third-person view), built from primitives in a Clash-of-Clans-like style:
// purple hooded robe with gold trim, a cape, and a glowing orb of magic between his hands.
// He reacts to the hand pose: idle sway, right arm raised while drawing, both arms thrust
// forward when a spell is cast, arms spread with a cyan glow for the shield.
import * as THREE from 'three';
import { onCursor, type Pose } from '../events.ts';
import { PALETTE } from './palette.ts';
import { radialTexture } from './environment.ts';

const ROBE = 0x8a45d0;
const ROBE_DARK = 0x55288a;
const SKIN = 0xf0c8a0;

export function createWizard() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // sways while idle
  root.add(body);

  const robe = new THREE.MeshStandardMaterial({ color: ROBE, flatShading: true, roughness: 0.8 });
  const robeDark = new THREE.MeshStandardMaterial({ color: ROBE_DARK, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.7, roughness: 0.35, emissive: PALETTE.gold, emissiveIntensity: 0.15 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, flatShading: true });
  const orbMat = new THREE.MeshStandardMaterial({ color: PALETTE.gold, emissive: PALETTE.gold, emissiveIntensity: 3 });

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
  body.add(skirt, hem, torso, belt, buckle);

  // Shoulder pads (gold) and a cape down the back (the side the camera sees).
  for (const x of [-0.36, 0.36]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), gold);
    pad.scale.set(1.2, 0.6, 1.1);
    pad.position.set(x, 1.6, 0);
    body.add(pad);
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
  body.add(cape, capeTrim);

  // Head: face, white beard, and a big pointed hood.
  const head = new THREE.Group();
  head.position.y = 1.85;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xeeeeee, flatShading: true }));
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
  body.add(head);

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
    body.add(pivot);
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

  let pose: Pose = 'other';
  onCursor((_x, _y, p) => (pose = p));
  let castT = 0; // 1 right after a cast, fades to 0
  const orbColor = new THREE.Color(PALETTE.gold);
  const target = new THREE.Color(PALETTE.gold);
  const tmp = new THREE.Vector3();

  return {
    group: root,

    /** Animate. t = seconds. */
    update(t: number, dt: number) {
      castT = Math.max(0, castT - dt * 3);
      body.position.y = Math.sin(t * 2) * 0.03;
      body.rotation.z = Math.sin(t * 1.3) * 0.02;
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

      // Orb: rides on the right hand while drawing, floats in front otherwise; flares on cast.
      if (pose === 'point') {
        right.hand.getWorldPosition(tmp);
        body.worldToLocal(tmp);
        orbGroup.position.lerp(tmp.add(new THREE.Vector3(0, 0.15, 0)), k);
      } else {
        orbGroup.position.lerp(new THREE.Vector3(0, 1.15 + Math.sin(t * 3) * 0.05, -0.6), k);
      }
      target.set(pose === 'palm' ? 0x9fe6ff : PALETTE.gold);
      orbColor.lerp(target, k);
      if (castT <= 0) {
        orbMat.color.copy(orbColor);
        orbMat.emissive.copy(orbColor);
        (orbGlow.material as THREE.SpriteMaterial).color.copy(orbColor);
        light.color.copy(orbColor);
      }
      const s = 1 + castT * 1.5 + Math.sin(t * 6) * 0.05;
      orb.scale.setScalar(s);
      orbGlow.scale.setScalar(0.9 * s + (pose === 'palm' ? 0.8 : 0));
      orb.rotation.y = t * 2;
      light.intensity = 1.5 + castT * 4 + (pose === 'palm' ? 1.5 : 0);
    },

    /** A spell was cast: arms thrust, orb flashes in the spell colour. */
    cast(color: number) {
      castT = 1;
      orbMat.color.set(color);
      orbMat.emissive.set(color);
      (orbGlow.material as THREE.SpriteMaterial).color.set(color);
      light.color.set(color);
    },

    /** World position spells fly from (the orb). */
    orbWorldPosition(out: THREE.Vector3) {
      return orbGroup.getWorldPosition(out);
    },
  };
}

export type Wizard = ReturnType<typeof createWizard>;
