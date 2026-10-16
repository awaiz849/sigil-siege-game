// The static world around the battlefield: field, road, forest, rocks, the castle wall we stand on,
// torches, mist and drifting embers. The sunset sky and mountains are in sky.ts, the river, bridge,
// far castle, siege towers and fences in valley.ts, the ground shape in terrain.ts.
// Everything is built from three.js primitives (no downloaded assets).
// setTheme() follows the wave's scenery (themes.ts): wave 1 the green sunset valley, wave 2 snow
// (white hills, snow-capped pines, falling snow), wave 3 ash and lava (black hills, charred pines,
// rising embers). Fireflies only fly in the valley.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './toon.ts';
import { CONFIG } from '../config.ts';
import { PALETTE } from './palette.ts';
import { createLandmarks } from './landmarks.ts';
import { createSky } from './sky.ts';
import { createValley } from './valley.ts';
import { groundHeight, nearestRiver, noise2, roadAmount } from './terrain.ts';
import { mixArray, themedColor, themedTint, type PerTheme, type Themed, type ThemeWeights } from './themes.ts';

/** Small seeded random so the scenery looks the same every time. */
function makeRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const rand = makeRandom(7);
const range = (a: number, b: number) => a + rand() * (b - a);

export function createEnvironment(scene: THREE.Scene) {
  const updaters: Array<(t: number, dt: number) => void> = [];
  const themed: Themed[] = [];

  const sky = createSky(scene);
  updaters.push(sky.update);
  themed.push(sky.setTheme);
  const ground = createGround();
  scene.add(ground.mesh);
  themed.push(ground.setTheme);
  const valley = createValley(scene);
  updaters.push(valley.update);
  themed.push(valley.setTheme);
  const forest = createForest();
  scene.add(forest.group);
  themed.push(forest.setTheme);
  const rocks = createRocks();
  scene.add(rocks);
  themed.push(themedTint((rocks.material as THREE.MeshToonMaterial).color, 0.6, 0.6));
  const wall = createWall();
  scene.add(wall.group);
  updaters.push(wall.update);
  const mist = createMist();
  mist.sprites.forEach((m) => scene.add(m));
  updaters.push(mist.update);
  // Field mist per theme [valley, frost, inferno]: pink sunset haze / white snow haze / dark smoke.
  themed.push(...mist.sprites.map((m) => themedColor(m.material.color, [0xffffff, 0xe8f2ff, 0x6a3428])));
  const landmarks = createLandmarks(scene);
  updaters.push(landmarks.update);
  const fireflies = createFireflies();
  scene.add(fireflies.points);
  updaters.push(fireflies.update);
  themed.push(fireflies.setTheme);
  // Weather: snow falls in frost, embers rise in inferno.
  for (const weather of [createSnow(), createEmbers()]) {
    scene.add(weather.points);
    updaters.push(weather.update);
    themed.push(weather.setTheme);
  }

  return {
    update(t: number, dt: number) {
      for (const u of updaters) u(t, dt);
    },
    /** The castle we stand on (the defeat cinematic knocks it down). */
    castle: { wall: wall.group, towers: landmarks.towers },
    /** Blend the scenery between the wave themes (themes.ts). */
    setTheme(w: ThemeWeights) {
      for (const f of themed) f(w);
    },
  };
}

// ---------------------------------------------------------------- ground

function createGround() {
  // One big subdivided plane: flat dirt road down the middle (where enemies walk),
  // rolling grass hills on the sides, the river bed on the right (terrain.ts).
  // Colours vary per vertex for a hand-painted look; one set per theme [valley, frost, inferno]:
  // green grass and a dirt road / snow and a trampled grey track / black ash, dark rock and lava banks.
  const geo = new THREE.PlaneGeometry(300, 230, 150, 115);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -90);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const looks = [
    { grass: PALETTE.grass, grassDark: PALETTE.grassDark, road: PALETTE.road, roadDark: PALETTE.roadDark, bank: 0x6b6a4a },
    { grass: 0xe8f0fa, grassDark: 0xa6b8d4, road: 0x958e98, roadDark: 0x6a6472, bank: 0x9cc0e0 },
    { grass: 0x4a3a36, grassDark: 0x1c1414, road: 0x5c463a, roadDark: 0x3a2a24, bank: 0xc8401a },
  ].map((l) => ({
    grass: new THREE.Color(l.grass),
    grassDark: new THREE.Color(l.grassDark),
    road: new THREE.Color(l.road),
    roadDark: new THREE.Color(l.roadDark),
    bank: new THREE.Color(l.bank), // river banks: mud / ice / glowing lava edge
  }));
  const perTheme = looks.map(() => new Float32Array(pos.count * 3)) as unknown as PerTheme<Float32Array>;
  const c = new THREE.Color();
  const r = new THREE.Color();
  const w = CONFIG.SCENERY.riverWidth;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    const n = noise2(x, z);
    const roadMix = 0.5 + noise2(x * 3, z * 3) * 0.5;
    const onRoad = roadAmount(x, z);
    const onBank = 1 - THREE.MathUtils.smoothstep(nearestRiver(x, z).dist, w * 0.6, w * 1.6);
    // A little random speckle.
    const s = 0.92 + rand() * 0.12;
    looks.forEach((l, t) => {
      c.copy(l.grassDark).lerp(l.grass, 0.5 + n * 0.5);
      r.copy(l.roadDark).lerp(l.road, roadMix);
      c.lerp(r, onRoad);
      c.lerp(l.bank, onBank);
      perTheme[t].set([c.r * s, c.g * s, c.b * s], i * 3);
    });
  }
  const colors = new THREE.BufferAttribute(perTheme[0].slice(), 3);
  geo.setAttribute('color', colors);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    toon({ vertexColors: true, roughness: 1, flatShading: true }),
  );
  mesh.receiveShadow = CONFIG.SHADOWS;
  return {
    mesh,
    setTheme(wt: ThemeWeights) {
      mixArray(colors.array as Float32Array, perTheme, wt);
      colors.needsUpdate = true;
    },
  };
}

function createForest() {
  // Low-poly pines on both sides of the road, instanced (one draw call per part).
  // Crowns per theme [valley, frost, inferno]: green pines / snow-capped pines / charred black.
  const g = new THREE.Group();
  const count = 380;
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.2, 5);
  const crownGeo = new THREE.ConeGeometry(1.2, 3.2, 6);
  const trunk = new THREE.InstancedMesh(trunkGeo, toon({ color: PALETTE.wood, flatShading: true }), count);
  const crownA = new THREE.InstancedMesh(crownGeo, toon({ color: 0xffffff, flatShading: true }), count);
  const crownB = new THREE.InstancedMesh(crownGeo, toon({ color: 0xffffff, flatShading: true }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const minX = CONFIG.FIELD.halfWidth + 4;
  const shades: number[] = []; // per tree: 0 = light green, 1 = dark

  const clear = (x: number, z: number) =>
    nearestRiver(x, z).dist > CONFIG.SCENERY.riverWidth * 1.4 + 1.2 &&
    CONFIG.SCENERY.siegeTowers.every(([tx, tz]) => Math.hypot(x - tx, z - tz) > 4.5) &&
    Math.abs(z - CONFIG.SCENERY.bridgeZ) > 3;
  let placed = 0;
  for (let i = 0; placed < count && i < count * 4; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * range(minX, minX + 55);
    const z = range(-150, -2);
    const s = range(0.8, 1.9);
    if (!clear(x, z)) continue;
    const y = groundHeight(x, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), range(0, Math.PI * 2));
    m.compose(new THREE.Vector3(x, y + 0.6 * s, z), q, new THREE.Vector3(s, s, s));
    trunk.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, y + 2.4 * s, z), q, new THREE.Vector3(s, s, s));
    crownA.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, y + 3.6 * s, z), q, new THREE.Vector3(s * 0.75, s * 0.8, s * 0.75));
    crownB.setMatrixAt(placed, m);
    const shade = rand();
    shades.push(shade);
    col.set(PALETTE.pine).lerp(new THREE.Color(PALETTE.pineDark), shade);
    crownA.setColorAt(placed, col);
    crownB.setColorAt(placed, col.multiplyScalar(1.15));
    placed++;
  }
  trunk.count = crownA.count = crownB.count = placed;
  g.add(trunk, crownA, crownB);

  // Crown colours per theme, from a light tree to a dark one: lower crown (a), top crown (b).
  // The valley's top crown is 15% brighter, as above.
  const looks = [
    { a: [PALETTE.pine, PALETTE.pineDark], b: [PALETTE.pine, PALETTE.pineDark], bBoost: 1.15 },
    { a: [0x4e7a74, 0x2c5054], b: [0xf4f8ff, 0xc6d6ea], bBoost: 1 }, // dark green under snow caps
    { a: [0x2a1a16, 0x120a0a], b: [0x3a1a12, 0x5a1c0e], bBoost: 1 }, // charcoal, smouldering tips
  ];
  const build = (part: 'a' | 'b') =>
    looks.map((l) => {
      const arr = new Float32Array(count * 3);
      const light = new THREE.Color(l[part][0]);
      const dark = new THREE.Color(l[part][1]);
      const boost = part === 'b' ? l.bBoost : 1;
      shades.forEach((sh, i) => {
        col.copy(light).lerp(dark, sh).multiplyScalar(boost);
        arr.set([col.r, col.g, col.b], i * 3);
      });
      return arr;
    }) as unknown as PerTheme<Float32Array>;
  const perA = build('a');
  const perB = build('b');
  const colorsA = crownA.instanceColor!;
  const colorsB = crownB.instanceColor!;
  const trunkTint = themedTint((trunk.material as THREE.MeshToonMaterial).color, 0.2, 0.7);
  return {
    group: g,
    setTheme(w: ThemeWeights) {
      mixArray(colorsA.array as Float32Array, perA, w);
      mixArray(colorsB.array as Float32Array, perB, w);
      colorsA.needsUpdate = colorsB.needsUpdate = true;
      trunkTint(w);
    },
  };
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
    m.compose(new THREE.Vector3(x, groundHeight(x, z) + 0.15 * s, z), q, new THREE.Vector3(s, s * 0.7, s));
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
  const tex = radialTexture('rgba(255,200,190,0.45)', 'rgba(255,200,190,0)');
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
  let shown = 1;
  return {
    points,
    update(t: number) {
      if (!points.visible) return;
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        pos[k] = base[k] + Math.sin(t * 0.3 + i) * 1.2;
        pos[k + 1] = base[k + 1] + Math.sin(t * 0.5 + i * 1.7) * 0.6;
        pos[k + 2] = base[k + 2] + Math.cos(t * 0.25 + i * 0.9) * 1.2;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = (0.7 + Math.sin(t * 2) * 0.2) * shown;
    },
    /** Fireflies only fly in the valley theme. */
    setTheme(w: ThemeWeights) {
      shown = w[0];
      points.visible = shown > 0.01;
    },
  };
}

// ---------------------------------------------------------------- weather: snow + embers

/** The weather has its own seeded random, so the rest of the scenery is laid out as before. */
const weatherRand = makeRandom(31);
const wr = (a: number, b: number) => a + weatherRand() * (b - a);

/** Particles drifting over the field: dir = -1 falls (snow), +1 rises (embers), wrapping around.
 *  Shown only while theme number `theme` (THEMES order) is in the weights; skipped otherwise. */
function createWeather(count: number, theme: number, dir: number, speed: [number, number], height: number, mat: THREE.PointsMaterial) {
  const base = new Float32Array(count * 4); // x, y, z, speed
  for (let i = 0; i < count; i++) base.set([wr(-32, 32), wr(0, height), wr(-70, -6), wr(speed[0], speed[1])], i * 4);
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false; // positions change every frame
  const opacity = mat.opacity;
  let shown = 0;
  return {
    points,
    update(t: number) {
      if (!points.visible) return;
      for (let i = 0; i < count; i++) {
        const b = i * 4;
        pos[i * 3] = base[b] + Math.sin(t * 0.8 + i) * 0.7; // sway sideways
        pos[i * 3 + 1] = (((base[b + 1] + dir * t * base[b + 3]) % height) + height) % height;
        pos[i * 3 + 2] = base[b + 2] + Math.cos(t * 0.6 + i * 1.3) * 0.4;
      }
      geo.attributes.position.needsUpdate = true;
      // Embers flicker; snow stays steady.
      mat.opacity = opacity * shown * (dir > 0 ? 0.75 + Math.sin(t * 7) * 0.25 : 1);
    },
    setTheme(w: ThemeWeights) {
      shown = w[theme];
      points.visible = shown > 0.01;
    },
  };
}

function createSnow() {
  const mat = new THREE.PointsMaterial({
    map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    color: 0xffffff,
    size: 0.16,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  return createWeather(CONFIG.WAVE_SCENERY.snow, 1, -1, [1.2, 2.4], 20, mat);
}

function createEmbers() {
  const mat = new THREE.PointsMaterial({
    map: radialTexture('rgba(255,220,140,1)', 'rgba(255,80,20,0)'),
    color: 0xff8a3a,
    size: 0.28,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return createWeather(CONFIG.WAVE_SCENERY.embers, 2, 1, [0.8, 2.2], 14, mat);
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
