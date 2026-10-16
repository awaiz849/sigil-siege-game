// The static world around the battlefield: sky, stars, moon, mountains, field, road, forest,
// rocks, the castle wall we stand on, torches, and drifting fireflies.
// Everything is built from three.js primitives (no downloaded assets).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './toon.ts';
import { CONFIG } from '../config.ts';
import { PALETTE } from './palette.ts';
import { createLandmarks } from './landmarks.ts';

/** Small seeded random so the scenery looks the same every time. */
function makeRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const rand = makeRandom(7);
const range = (a: number, b: number) => a + rand() * (b - a);

/** Smooth-ish value noise for hills and colour variation. */
function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 +
    Math.sin(z * 0.13 + x * 0.05) * 0.35 +
    Math.sin((x + z) * 0.31) * 0.15
  );
}

export function createEnvironment(scene: THREE.Scene) {
  const updaters: Array<(t: number, dt: number) => void> = [];

  scene.add(createSky());
  const stars = createStars();
  scene.add(stars);
  scene.add(createMoon());
  createMountains().forEach((m) => scene.add(m));
  scene.add(createGround());
  scene.add(createForest());
  scene.add(createRocks());
  const wall = createWall();
  scene.add(wall.group);
  updaters.push(wall.update);
  const mist = createMist();
  mist.sprites.forEach((m) => scene.add(m));
  updaters.push(mist.update);
  const landmarks = createLandmarks(scene);
  updaters.push(landmarks.update);
  const fireflies = createFireflies();
  scene.add(fireflies.points);
  updaters.push(fireflies.update);

  // Stars twinkle slowly.
  const starMat = stars.material as THREE.PointsMaterial;
  updaters.push((t) => (starMat.opacity = 0.75 + Math.sin(t * 0.7) * 0.15));

  return {
    update(t: number, dt: number) {
      for (const u of updaters) u(t, dt);
    },
  };
}

// ---------------------------------------------------------------- sky

function createSky(): THREE.Mesh {
  // Big inverted sphere with a vertical gradient + a warm glow low on the horizon.
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      mid: { value: new THREE.Color(PALETTE.skyMid) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      glow: { value: new THREE.Color(PALETTE.horizonGlow) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, mid, horizon, glow;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, top, smoothstep(0.15, 0.6, h));
        // Warm sunset glow, strongest straight ahead (the field direction is -z).
        float ahead = max(0.0, -vDir.z);
        c += glow * pow(1.0 - clamp(abs(h) * 5.0, 0.0, 1.0), 3.0) * (0.25 + 0.45 * ahead);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  return sky;
}

function createStars(): THREE.Points {
  const count = 900;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Upper hemisphere only, denser higher up.
    const theta = range(0, Math.PI * 2);
    const y = Math.pow(rand(), 0.6) * 0.95 + 0.05;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(theta) * r * 380, y * 380, Math.sin(theta) * r * 380], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    fog: false,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function createMoon(): THREE.Group {
  const g = new THREE.Group();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 32, 16),
    new THREE.MeshBasicMaterial({ color: PALETTE.moon, fog: false }),
  );
  // Soft halo: a camera-facing sprite with a radial gradient texture.
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,236,200,0.35)', 'rgba(255,236,200,0)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  halo.scale.set(80, 80, 1);
  g.add(halo, moon);
  g.position.set(-55, 62, -280);
  return g;
}

function createMountains(): THREE.Mesh[] {
  // Three jagged silhouette layers, further = lighter (aerial perspective).
  const layers = [
    { z: -140, height: 34, color: 0x3a2b5e, jag: 10 },
    { z: -110, height: 24, color: 0x2a2048, jag: 8 },
    { z: -85, height: 15, color: 0x1c1735, jag: 6 },
  ];
  return layers.map((l) => {
    const shape = new THREE.Shape();
    const width = 420;
    shape.moveTo(-width / 2, -10);
    for (let x = -width / 2; x <= width / 2; x += range(8, 18)) {
      const peak = l.height * (0.45 + 0.55 * Math.abs(Math.sin(x * 0.013 + l.z))) + range(-l.jag, l.jag) * 0.5;
      shape.lineTo(x, Math.max(2, peak));
    }
    shape.lineTo(width / 2, -10);
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: l.color, fog: false }),
    );
    mesh.position.z = l.z;
    return mesh;
  });
}

// ---------------------------------------------------------------- ground

function createGround(): THREE.Mesh {
  // One big subdivided plane: flat dirt road down the middle (where enemies walk),
  // rolling grass hills on the sides. Colours vary per vertex for a hand-painted look.
  const geo = new THREE.PlaneGeometry(220, 160, 110, 80);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -60);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(PALETTE.grass);
  const grassDark = new THREE.Color(PALETTE.grassDark);
  const road = new THREE.Color(PALETTE.road);
  const roadDark = new THREE.Color(PALETTE.roadDark);
  const c = new THREE.Color();
  const roadHalf = CONFIG.FIELD.halfWidth + 1.5;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Road edge wobbles a little so it doesn't look ruler-straight.
    const edge = roadHalf + Math.sin(z * 0.2) * 0.8;
    const roadAmount = 1 - THREE.MathUtils.smoothstep(Math.abs(x), edge - 1.5, edge + 1.5);
    const n = noise2(x, z);
    // Hills rise away from the road.
    const hill = Math.max(0, Math.abs(x) - edge) * 0.08 * (1.5 + n);
    pos.setY(i, hill * (1 - roadAmount) + n * 0.15);

    c.copy(grassDark).lerp(grass, 0.5 + n * 0.5);
    const r = c.clone().copy(roadDark).lerp(road, 0.5 + noise2(x * 3, z * 3) * 0.5);
    c.lerp(r, roadAmount);
    // A little random speckle.
    const s = 0.92 + rand() * 0.12;
    colors.set([c.r * s, c.g * s, c.b * s], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    toon({ vertexColors: true, roughness: 1, flatShading: true }),
  );
  mesh.receiveShadow = CONFIG.SHADOWS;
  return mesh;
}

function createForest(): THREE.Group {
  // Low-poly pines on both sides of the road, instanced (one draw call per part).
  const g = new THREE.Group();
  const count = 260;
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.2, 5);
  const crownGeo = new THREE.ConeGeometry(1.2, 3.2, 6);
  const trunk = new THREE.InstancedMesh(trunkGeo, toon({ color: PALETTE.wood, flatShading: true }), count);
  const crownA = new THREE.InstancedMesh(crownGeo, toon({ color: 0xffffff, flatShading: true }), count);
  const crownB = new THREE.InstancedMesh(crownGeo, toon({ color: 0xffffff, flatShading: true }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const minX = CONFIG.FIELD.halfWidth + 4;

  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * range(minX, minX + 45);
    const z = range(-95, -2);
    const s = range(0.8, 1.9);
    const n = noise2(x, z);
    const y = Math.max(0, Math.abs(x) - (CONFIG.FIELD.halfWidth + 1.5)) * 0.08 * (1.5 + n) + n * 0.15;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), range(0, Math.PI * 2));
    m.compose(new THREE.Vector3(x, y + 0.6 * s, z), q, new THREE.Vector3(s, s, s));
    trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, y + 2.4 * s, z), q, new THREE.Vector3(s, s, s));
    crownA.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, y + 3.6 * s, z), q, new THREE.Vector3(s * 0.75, s * 0.8, s * 0.75));
    crownB.setMatrixAt(i, m);
    col.set(PALETTE.pine).lerp(new THREE.Color(PALETTE.pineDark), rand());
    crownA.setColorAt(i, col);
    crownB.setColorAt(i, col.multiplyScalar(1.15));
  }
  g.add(trunk, crownA, crownB);
  return g;
}

function createRocks(): THREE.InstancedMesh {
  const count = 70;
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.6, 1),
    toon({ color: PALETTE.stoneDark, flatShading: true, roughness: 1 }),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    // Mostly along the road edges; a few big boulders further out.
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * range(CONFIG.FIELD.halfWidth + 1, CONFIG.FIELD.halfWidth + 12);
    const z = range(-70, -6);
    const s = range(0.4, 1.6);
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new THREE.Vector3(x, 0.15 * s, z), q, new THREE.Vector3(s, s * 0.7, s));
    rocks.setMatrixAt(i, m);
  }
  return rocks;
}

// ---------------------------------------------------------------- castle wall

function createWall() {
  // We stand on top of this wall. Its front face is at FIELD.wallZ.
  // Visible parts: the low parapet at the bottom of the screen, merlons framing the
  // left and right edges, and two flickering braziers.
  const g = new THREE.Group();
  const wallZ = CONFIG.FIELD.wallZ;
  const top = WALL_TOP;
  const bricks = brickTexture();
  /** Brick material whose texture repeats `rx` x `ry` times over a box. */
  const brickMat = (rx: number, ry: number, tint = 1) => {
    const map = bricks.clone();
    map.repeat.set(rx, ry);
    map.needsUpdate = true;
    return toon({ map, color: new THREE.Color(PALETTE.stone).multiplyScalar(tint), roughness: 0.95 });
  };

  // Wall body: long, runs left-right; its top is the walkway.
  const body = new THREE.Mesh(new THREE.BoxGeometry(120, top, 4), brickMat(45, 3, 0.7));
  body.position.set(0, top / 2, wallZ + 2);
  g.add(body);

  // Low parapet along the front edge: a thin band at the bottom of the screen.
  const parapetH = 0.55;
  const gap = CONFIG.CAMERA.crenelHalfWidth; // we look out through the crenel between two merlons
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(60, parapetH, 0.8), brickMat(30, 0.8));
  parapet.position.set(0, top + parapetH / 2, wallZ + 0.4);
  g.add(parapet);
  // Cap stones on top of the parapet, slightly uneven.
  const capGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.12);
  const caps = new THREE.InstancedMesh(capGeo, toon({ color: 0xffffff, flatShading: true, roughness: 0.9 }), 100);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < 100; i++) {
    const x = -25 + i * 0.5;
    m.compose(
      new THREE.Vector3(x + 0.25, top + parapetH + 0.06 + range(-0.012, 0.012), wallZ + 0.4),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), range(-0.04, 0.04)),
      new THREE.Vector3(0.47, 0.12, 0.92),
    );
    caps.setMatrixAt(i, m);
    caps.setColorAt(i, col.set(PALETTE.stone).multiplyScalar(0.75 + rand() * 0.3));
  }
  g.add(caps);

  // Merlons (the tall teeth) at the screen edges: they frame the view without hiding the road.
  for (const x of [-(gap + 0.65), gap + 0.65, -(gap + 2.95), gap + 2.95, -(gap + 5.25), gap + 5.25]) {
    const merlon = new THREE.Mesh(new RoundedBoxGeometry(1.3, 1.15, 0.8, 3, 0.08), brickMat(1.2, 1.3, 0.95));
    merlon.position.set(x, top + parapetH + 0.575, wallZ + 0.4);
    merlon.rotation.y = range(-0.02, 0.02);
    g.add(merlon);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.16, 0.92, 3, 0.06), toon({ color: PALETTE.stone, flatShading: true }));
    cap.position.set(x, top + parapetH + 1.15 + 0.07, wallZ + 0.4);
    g.add(cap);
  }

  // Braziers on the parapet, with real (cheap) point lights that flicker.
  const torches = [-(gap - 0.2), gap - 0.2].map((x) => createTorch(x, top + parapetH + 0.25, wallZ + 0.55));
  torches.forEach((t) => g.add(t.group));

  return {
    group: g,
    update(t: number) {
      torches.forEach((torch, k) => torch.update(t + k * 1.7));
    },
  };
}

/** Procedural brick texture: offset rows, dark mortar, per-brick shade, a few cracks. */
export function brickTexture(): THREE.CanvasTexture {
  // Hand-drawn castle stonework (comic style): rows of irregular rounded stones with a dark ink
  // outline and a soft highlight, instead of a uniform brick grid. Tiles seamlessly left-right.
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1e1b28'; // mortar / ink
  ctx.fillRect(0, 0, w, h);
  const rows = 4;
  const rowH = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 60;
    const y = r * rowH;
    while (x < w) {
      const sw = 70 + rand() * 80; // stone width varies
      const shade = 140 + Math.floor(rand() * 55);
      // Draw each stone twice when it crosses the right edge, so the texture tiles.
      for (const dx of x + sw > w ? [0, -w] : [0]) {
        const sx = x + dx + 4;
        const sy = y + 4 + rand() * 3;
        const ww = sw - 8;
        const hh = rowH - 9;
        ctx.beginPath();
        ctx.roundRect(sx, sy, ww, hh, 12);
        ctx.fillStyle = `rgb(${shade}, ${shade - 6}, ${shade + 14})`;
        ctx.fill();
        // Highlight on the upper half, shadow on the lower edge: rounded, chunky stones.
        const grad = ctx.createLinearGradient(0, sy, 0, sy + hh);
        grad.addColorStop(0, 'rgba(255,255,255,0.18)');
        grad.addColorStop(0.45, 'rgba(255,255,255,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#141120';
        ctx.stroke();
      }
      x += sw;
    }
  }
  // A few cracks and chips.
  ctx.strokeStyle = 'rgba(20,17,32,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    let cx = rand() * w;
    let cy = rand() * h;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let k = 0; k < 3; k++) {
      cx += (rand() - 0.5) * 24;
      cy += rand() * 14;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Height of the walkway we stand on. */
export const WALL_TOP = 5.2;

function createTorch(x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(0.42);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6),
    toon({ color: PALETTE.wood }),
  );
  pole.position.y = -0.2;
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.12, 0.22, 8),
    toon({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 }),
  );
  bowl.position.y = 0.3;
  // No real light here (point lights are expensive on laptop GPUs): the flame sprites + bloom sell it.
  g.add(pole, bowl);

  // Flame: a few additive sprites that bob and flicker (bloom makes them glow).
  const flameTex = radialTexture('rgba(255,220,140,1)', 'rgba(255,90,20,0)');
  const flames = [0, 1, 2].map((k) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, color: k === 0 ? 0xffd27a : 0xff7a2a, opacity: 0.8 }),
    );
    g.add(s);
    return s;
  });

  return {
    group: g,
    update(t: number) {
      const flicker = 0.85 + Math.sin(t * 17) * 0.06 + Math.sin(t * 7.3) * 0.08;
      flames.forEach((f, k) => {
        const phase = t * (5 + k) + k * 2;
        f.position.set(Math.sin(phase) * 0.04, 0.55 + k * 0.16 + Math.sin(phase * 1.3) * 0.03, 0);
        const s = (0.75 - k * 0.18) * flicker;
        f.scale.set(s * 0.8, s * 1.2, 1);
      });
    },
  };
}

// ---------------------------------------------------------------- mist

function createMist() {
  // Big soft sprites hugging the ground, drifting sideways: cheap "volumetric" mist.
  const tex = radialTexture('rgba(190,180,255,0.55)', 'rgba(190,180,255,0)');
  const sprites: THREE.Sprite[] = [];
  const base: Array<{ x: number; z: number; speed: number; phase: number }> = [];
  for (let i = 0; i < CONFIG.MIST_SPRITES; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.16, depthWrite: false }));
    const z = range(-75, -9);
    s.scale.set(range(18, 30), range(4, 7), 1);
    s.position.set(range(-25, 25), range(0.6, 1.6), z);
    sprites.push(s);
    base.push({ x: s.position.x, z, speed: range(0.2, 0.6), phase: range(0, 6) });
  }
  return {
    sprites,
    update(t: number) {
      sprites.forEach((s, i) => {
        const b = base[i];
        // Drift right and wrap around, with a slow breathing opacity.
        s.position.x = ((b.x + t * b.speed + 30) % 60) - 30;
        (s.material as THREE.SpriteMaterial).opacity = 0.12 + Math.sin(t * 0.3 + b.phase) * 0.05;
      });
    },
  };
}

// ---------------------------------------------------------------- fireflies

function createFireflies() {
  const count = 70;
  const base = new Float32Array(count * 3);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    base.set([side * range(4, 22), range(0.5, 4), range(-45, -8)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: radialTexture('rgba(255,240,170,1)', 'rgba(255,200,80,0)'),
    color: PALETTE.gold,
    size: 0.5,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  return {
    points,
    update(t: number) {
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        pos[k] = base[k] + Math.sin(t * 0.3 + i) * 1.2;
        pos[k + 1] = base[k + 1] + Math.sin(t * 0.5 + i * 1.7) * 0.6;
        pos[k + 2] = base[k + 2] + Math.cos(t * 0.25 + i * 0.9) * 1.2;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.7 + Math.sin(t * 2) * 0.2;
    },
  };
}

// ---------------------------------------------------------------- helpers

/** Soft round glow texture drawn on a small canvas (used for halos, flames, particles). */
export function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
