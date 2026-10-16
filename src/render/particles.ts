// One pooled particle system for bursts (kills, spawns, wall crashes). Additive glowing dots.
import * as THREE from 'three';
import { radialTexture } from './environment.ts';

const MAX = 600;

export function createParticles(scene: THREE.Scene) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX); // seconds left (0 = dead)
  const maxLife = new Float32Array(MAX);
  const base = new Float32Array(MAX * 3); // original colour (fades to black = invisible when additive)
  let next = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.45,
    map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const c = new THREE.Color();

  return {
    /** Spray `count` particles from a point. up = extra upward speed. */
    burst(at: THREE.Vector3, color: number, count: number, speed = 4, up = 2, lifetime = 0.8) {
      c.set(color);
      for (let n = 0; n < count; n++) {
        const i = next;
        next = (next + 1) % MAX;
        const k = i * 3;
        pos[k] = at.x;
        pos[k + 1] = at.y;
        pos[k + 2] = at.z;
        // Random direction on a sphere.
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const s = speed * (0.4 + Math.random() * 0.6);
        vel[k] = Math.sin(phi) * Math.cos(theta) * s;
        vel[k + 1] = Math.abs(Math.cos(phi)) * s * 0.6 + up;
        vel[k + 2] = Math.sin(phi) * Math.sin(theta) * s;
        base[k] = c.r;
        base[k + 1] = c.g;
        base[k + 2] = c.b;
        life[i] = maxLife[i] = lifetime * (0.6 + Math.random() * 0.4);
      }
    },

    update(dt: number) {
      for (let i = 0; i < MAX; i++) {
        const k = i * 3;
        if (life[i] <= 0) {
          col[k] = col[k + 1] = col[k + 2] = 0;
          continue;
        }
        life[i] -= dt;
        vel[k + 1] -= 6 * dt; // gravity
        pos[k] += vel[k] * dt;
        pos[k + 1] = Math.max(0.05, pos[k + 1] + vel[k + 1] * dt);
        pos[k + 2] += vel[k + 2] * dt;
        const f = Math.max(0, life[i] / maxLife[i]);
        col[k] = base[k] * f * 1.5;
        col[k + 1] = base[k + 1] * f * 1.5;
        col[k + 2] = base[k + 2] * f * 1.5;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

export type Particles = ReturnType<typeof createParticles>;
