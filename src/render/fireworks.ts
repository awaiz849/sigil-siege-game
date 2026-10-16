// Victory fireworks: rockets climb from the castle wall with a sparkling trail, then burst.
// Burst kinds: peony (a full sphere of one colour), ring (a flat circle), willow (golden trails
// that droop and linger), double (a sphere with a ring of a second colour inside).
// One THREE.Points cloud for every spark (one draw call); additive glow, so faded = darker colour.
import * as THREE from 'three';
import { radialTexture } from './environment.ts';

const MAX = 5000;
const COLORS = [0xff5a6e, 0xffd25a, 0x5ab8ff, 0x7aff7a, 0xff7ad8, 0xffffff, 0xff9a3a, 0xb07aff];
type Kind = 'peony' | 'ring' | 'willow' | 'double';
type Rocket = { pos: THREE.Vector3; vel: THREE.Vector3; fuse: number; kind: Kind; color: number; trailT: number };

export function createFireworks(scene: THREE.Scene, sounds: { launch?: () => void; burst?: () => void } = {}) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const base = new Float32Array(MAX * 3); // full-brightness colour
  const life = new Float32Array(MAX); // seconds left
  const maxLife = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  let count = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.45,
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);
  const rockets: Rocket[] = [];
  const c = new THREE.Color();

  function spark(p: THREE.Vector3, v: THREE.Vector3, color: number, seconds: number, g: number, d: number) {
    if (count >= MAX) return;
    const i = count++;
    pos.set([p.x, p.y, p.z], i * 3);
    vel.set([v.x, v.y, v.z], i * 3);
    c.set(color);
    base.set([c.r, c.g, c.b], i * 3);
    life[i] = maxLife[i] = seconds;
    gravity[i] = g;
    drag[i] = d;
  }

  /** A random direction on a sphere. */
  const dir = () => {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return new THREE.Vector3(Math.cos(a) * r, u, Math.sin(a) * r);
  };

  function burst(at: THREE.Vector3, kind: Kind, color: number) {
    sounds.burst?.();
    if (kind === 'peony' || kind === 'double') {
      for (let k = 0; k < 130; k++) spark(at, dir().multiplyScalar(8 + Math.random() * 2.5), color, 1.3 + Math.random() * 0.4, 3, 1.4);
    }
    if (kind === 'ring' || kind === 'double') {
      // A flat circle, tilted a little toward the camera.
      const other = kind === 'double' ? COLORS[(COLORS.indexOf(color) + 3) % COLORS.length] : color;
      const tilt = (Math.random() - 0.5) * 0.8;
      const speed = kind === 'double' ? 5 : 10;
      for (let k = 0; k < 90; k++) {
        const a = (k / 90) * Math.PI * 2;
        const v = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt).multiplyScalar(speed);
        spark(at, v, other, 1.4, 2.5, 1.2);
      }
    }
    if (kind === 'willow') {
      for (let k = 0; k < 160; k++) spark(at, dir().multiplyScalar(5 + Math.random() * 3), 0xffc860, 2.6 + Math.random() * 0.8, 4.5, 0.7);
    }
    // Bright white core flash.
    for (let k = 0; k < 20; k++) spark(at, dir().multiplyScalar(3), 0xffffff, 0.35, 0, 2);
  }

  return {
    /** Launch one rocket from this spot (it climbs, then bursts). */
    launch(from: THREE.Vector3) {
      const kinds: Kind[] = ['peony', 'ring', 'willow', 'double'];
      rockets.push({
        pos: from.clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 12.5 + Math.random() * 2, (Math.random() - 0.5) * 2),
        fuse: 0.85 + Math.random() * 0.3,
        kind: kinds[Math.floor(Math.random() * kinds.length)],
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        trailT: 0,
      });
      sounds.launch?.();
    },

    update(dt: number) {
      // Rockets: climb under gravity, sparkle, burst when the fuse runs out.
      for (let r = rockets.length - 1; r >= 0; r--) {
        const k = rockets[r];
        k.vel.y -= 9 * dt;
        k.pos.addScaledVector(k.vel, dt);
        k.trailT -= dt;
        if (k.trailT <= 0) {
          k.trailT = 0.015;
          spark(k.pos, new THREE.Vector3((Math.random() - 0.5) * 0.8, -1 - Math.random(), (Math.random() - 0.5) * 0.8), 0xffe0a0, 0.45, 2, 1);
        }
        k.fuse -= dt;
        if (k.fuse <= 0) {
          burst(k.pos, k.kind, k.color);
          rockets.splice(r, 1);
        }
      }
      // Sparks: move, slow down, fall, fade; dead ones are swapped out of the list.
      for (let i = count - 1; i >= 0; i--) {
        life[i] -= dt;
        if (life[i] <= 0) {
          const last = --count;
          if (i !== last) {
            pos.copyWithin(i * 3, last * 3, last * 3 + 3);
            vel.copyWithin(i * 3, last * 3, last * 3 + 3);
            base.copyWithin(i * 3, last * 3, last * 3 + 3);
            life[i] = life[last];
            maxLife[i] = maxLife[last];
            gravity[i] = gravity[last];
            drag[i] = drag[last];
          }
          continue;
        }
        const j = i * 3;
        const slow = Math.max(0, 1 - drag[i] * dt);
        vel[j] *= slow;
        vel[j + 1] = vel[j + 1] * slow - gravity[i] * dt;
        vel[j + 2] *= slow;
        pos[j] += vel[j] * dt;
        pos[j + 1] += vel[j + 1] * dt;
        pos[j + 2] += vel[j + 2] * dt;
        // Fade out over the last part of the life, with a little twinkle.
        const f = Math.min(1, (life[i] / maxLife[i]) * 1.6) * (0.75 + Math.random() * 0.25);
        col[j] = base[j] * f;
        col[j + 1] = base[j + 1] * f;
        col[j + 2] = base[j + 2] * f;
      }
      geo.setDrawRange(0, count);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },

    /** Remove everything (a new round). */
    clear() {
      rockets.length = 0;
      count = 0;
      geo.setDrawRange(0, 0);
    },
  };
}
