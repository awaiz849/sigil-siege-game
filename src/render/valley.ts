// The sunset valley around the battlefield (concept art: "Sunset Siege Over the Enchanted Valley"):
//   river          flows from the waterfalls by the far castle down the right side of the valley
//   bridge         a long stone arch bridge across the valley, behind the monster rift
//   cliff castle   a castle with spires on a rocky cliff far away on the right, waterfalls below it
//   siege towers   the enemy's wooden towers along the field, red banners, a fire on top
//   fences         wooden fences along the road
// Positions live in CONFIG.SCENERY; everything stands on the shared terrain (terrain.ts).
// setTheme() follows the wave's scenery (themes.ts): in wave 2 (frost) the river and waterfalls
// freeze and snow covers the stone and wood; in wave 3 (inferno) they turn to flowing lava and
// everything is charred black.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.ts';
import { toon } from './toon.ts';
import { brickTexture, radialTexture } from './environment.ts';
import { groundHeight, riverPoints, waterHeight } from './terrain.ts';
import { mixNum, themedColor, themedTint, type Themed, type ThemeWeights } from './themes.ts';

let seed = 777;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const range = (a: number, b: number) => a + rand() * (b - a);

/** themed = colours that follow the wave's scenery. */
type Piece = { object: THREE.Object3D; update?: (t: number) => void; themed?: Themed[] };

export function createValley(scene: THREE.Scene) {
  const pieces: Piece[] = [createRiver(), createBridge(), createCliffCastle(), createSiegeTowers(), createFences()];
  for (const p of pieces) scene.add(p.object);
  const themed = pieces.flatMap((p) => p.themed ?? []);
  return {
    update(t: number) {
      for (const p of pieces) p.update?.(t);
    },
    setTheme(w: ThemeWeights) {
      for (const f of themed) f(w);
    },
  };
}

// ---------------------------------------------------------------- river

/** Soft flowing streaks for the water surface (scrolls along the river). */
function waterTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 256;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,214,170' : '120,130,200'},${range(0.15, 0.4)})`;
    ctx.fillRect(range(0, 64), range(0, 256), range(4, 18), range(1, 3));
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createRiver(): Piece {
  const pts = riverPoints();
  const w = CONFIG.SCENERY.riverWidth;
  const pos: number[] = [];
  const uv: number[] = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    // Sideways direction; the river is a little wider downstream.
    const half = (w / 2) * (0.75 + 0.35 * (i / pts.length));
    const nx = (-tz / len) * half;
    const nz = (tx / len) * half;
    const y = waterHeight(p.x, p.z);
    if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz);
    uv.push(0, along / 12, 1, along / 12);
  }
  const index: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const k = i * 2;
    index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  const map = waterTexture();
  // The water mirrors the sunset sky: lavender-blue with warm streaks.
  const water = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, color: 0xb9bff0, side: THREE.DoubleSide }));

  // A few sun glints dancing on the water.
  const group = new THREE.Group();
  group.add(water);
  const glintTex = radialTexture('rgba(255,236,190,1)', 'rgba(255,200,140,0)');
  const glints = Array.from({ length: 10 }, (_, k) => {
    const p = pts[Math.floor(((k + 0.5) / 10) * pts.length)];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p.x + range(-1, 1), waterHeight(p.x, p.z) + 0.15, p.z);
    s.scale.set(1.6, 0.35, 1);
    group.add(s);
    return s;
  });
  // Per theme [valley, frost, inferno]: lavender water / white-blue ice (still) / slow glowing lava.
  const flowSpeeds = [0.25, 0, 0.08] as const;
  let flow = 0.25;
  let glintAmount = 1;
  let lastT = 0;
  return {
    object: group,
    update(t) {
      map.offset.y -= (t - lastT) * flow; // flows downstream
      lastT = t;
      glints.forEach((g, k) => ((g.material as THREE.SpriteMaterial).opacity = (0.35 + 0.35 * Math.sin(t * 2.5 + k * 1.9)) * glintAmount));
    },
    themed: [
      themedColor((water.material as THREE.MeshBasicMaterial).color, [0xb9bff0, 0xdcefff, 0xff5a14]),
      ...glints.map((g) => themedColor(g.material.color, [0xffffff, 0xffffff, 0xffc060])),
      (w) => {
        flow = mixNum(flowSpeeds, w);
        glintAmount = mixNum([1, 1, 0.6], w);
      },
    ],
  };
}

// ---------------------------------------------------------------- bridge

function createBridge(): Piece {
  // One extruded shape: a long wall with a row of round arches cut out, plus a parapet on top.
  const [x0, x1] = CONFIG.SCENERY.bridgeX;
  const deck = 9;
  const bottom = -4;
  const arches = 9;
  const span = (x1 - x0) / arches;
  const pier = span * 0.24;
  const r = (span - pier) / 2;
  const spring = deck - 1.6 - r; // where each arch's curve starts

  // Outline: down the left end, along the bottom with an arch over every gap between piers,
  // up the right end, back along the deck.
  const shape = new THREE.Shape();
  shape.moveTo(x0, deck);
  shape.lineTo(x0, bottom);
  for (let i = 0; i < arches; i++) {
    const cx = x0 + span * (i + 0.5);
    shape.lineTo(cx - r, bottom);
    shape.lineTo(cx - r, spring);
    shape.absarc(cx, spring, r, Math.PI, 0, true);
    shape.lineTo(cx + r, bottom);
  }
  shape.lineTo(x1, bottom);
  shape.lineTo(x1, deck);
  shape.lineTo(x0, deck);
  const depth = 3.2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  const map = brickTexture().clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(0.16, 0.22);
  map.needsUpdate = true;
  const stone = toon({ map, color: 0xd2bca8 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, stone));
  // Parapets with little merlons along both edges of the deck.
  const parapetGeo = new THREE.BoxGeometry(x1 - x0, 0.9, 0.5);
  for (const z of [-depth / 2 + 0.25, depth / 2 - 0.25]) {
    const p = new THREE.Mesh(parapetGeo, stone);
    p.position.set((x0 + x1) / 2, deck + 0.45, z);
    g.add(p);
  }
  g.position.z = CONFIG.SCENERY.bridgeZ;
  return { object: g, themed: [themedTint(stone.color, 0.5, 0.7)] };
}

// ---------------------------------------------------------------- cliff castle + waterfalls

function createCliffCastle(): Piece {
  // Far away: no fog on these materials; the pale, hazy colours do the aerial perspective instead.
  const { x, z } = CONFIG.SCENERY.castle;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const rockMat = toon({ color: 0x9a8a9c, fog: false });
  const stoneMat = toon({ color: 0xe6d6c6, fog: false });
  const roofMat = toon({ color: 0x4a4c94, fog: false });
  const windowMat = toon({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 1.4, fog: false });

  // The cliff: big faceted rock chunks piled up, flat on top.
  const top = 26;
  const chunks: Array<[number, number, number, number, number, number]> = [
    [0, 10, 0, 22, 16, 14],
    [-12, 6, 4, 14, 12, 12],
    [12, 7, -2, 16, 13, 13],
    [-4, 18, 2, 18, 10, 12],
    [6, 19, -1, 17, 10, 12],
  ];
  for (const [cx, cy, cz, sx, sy, sz] of chunks) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    m.position.set(cx, cy, cz);
    m.scale.set(sx, sy, sz);
    m.rotation.set(range(-0.2, 0.2), range(0, 3), range(-0.2, 0.2));
    g.add(m);
  }
  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(15, 18, 4, 9), rockMat);
  plateau.position.y = top - 2;
  g.add(plateau);

  // Castle: curtain wall, a tall keep, and towers with pointed blue roofs and spires.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(22, 5, 12), stoneMat);
  wall.position.y = top + 2.5;
  g.add(wall);
  const keep = new THREE.Mesh(new THREE.BoxGeometry(7, 15, 7), stoneMat);
  keep.position.set(-1, top + 7.5, -1);
  g.add(keep);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 7, 4), roofMat);
  keepRoof.position.set(-1, top + 18.5, -1);
  keepRoof.rotation.y = Math.PI / 4;
  g.add(keepRoof);
  const towers: Array<[number, number, number, number]> = [
    [-11, -6, 1.8, 12],
    [11, -6, 1.8, 11],
    [-11, 6, 1.8, 9],
    [11, 6, 1.8, 10],
    [5, 1, 1.4, 19],
    [-6, 3, 1.2, 15],
  ];
  for (const [tx, tz, r, h] of towers) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 10), stoneMat);
    t.position.set(tx, top + h / 2, tz);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, r * 3.6, 10), roofMat);
    roof.position.set(tx, top + h + r * 1.8, tz);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.5, 4), roofMat);
    spire.position.set(tx, top + h + r * 3.6 + 1, tz);
    g.add(t, roof, spire);
    // A couple of lit windows facing the camera.
    for (let k = 0; k < 2; k++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.1), windowMat);
      w.position.set(tx - 0.3 + k * 0.6, top + h * (0.45 + k * 0.25), tz + r + 0.02);
      g.add(w);
    }
  }

  // Waterfalls pouring off the cliff into the river (scrolling streak texture).
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${range(0.35, 0.9)})`;
    ctx.fillRect(range(0, 64), range(0, 128), range(1, 4), range(10, 40));
  }
  const fallTex = new THREE.CanvasTexture(cv);
  fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, color: 0xf2eaff, transparent: true, opacity: 0.85, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const mists: THREE.SpriteMaterial[] = [];
  const mistTex = radialTexture('rgba(255,250,255,0.9)', 'rgba(255,250,255,0)');
  const [riverX, riverZ] = CONFIG.SCENERY.river[0];
  const foot = waterHeight(riverX, riverZ);
  for (const [fx, w] of [[-16, 3.2], [-10, 2.2], [-20, 1.6]] as const) {
    const h = top - 4 - foot;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fallMat);
    fall.position.set(fx, foot + h / 2, 9);
    fall.rotation.y = -0.4;
    g.add(fall);
    const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    mist.position.set(fx, foot + 1.5, 10);
    mist.scale.set(w * 4, 4, 1);
    g.add(mist);
    mists.push(mist.material);
  }
  // Per theme [valley, frost, inferno]: waterfalls / frozen falls (barely moving) / lava falls.
  let fallSpeed = 0.6;
  let lastT = 0;
  return {
    object: g,
    update(t) {
      fallTex.offset.y += (t - lastT) * fallSpeed;
      lastT = t;
    },
    themed: [
      themedTint(rockMat.color, 0.6, 0.75),
      themedTint(stoneMat.color, 0.35, 0.7),
      themedTint(roofMat.color, 0.75, 0.5),
      themedColor(fallMat.color, [0xf2eaff, 0xcfe6ff, 0xff6a1a]),
      ...mists.map((m) => themedColor(m.color, [0xffffff, 0xffffff, 0xff7a3a])),
      (w) => (fallSpeed = mixNum([0.6, 0.03, 0.3], w)),
    ],
  };
}

// ---------------------------------------------------------------- siege towers

/** Red war banner with a white claw emblem (the invaders' colours). */
function warBannerTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#a3262a';
  ctx.fillRect(0, 0, 64, 128);
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 56, 112);
  // Claw: three curved slashes.
  ctx.strokeStyle = '#fff2e0';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    ctx.moveTo(32 + k * 12, 34);
    ctx.quadraticCurveTo(32 + k * 16, 62, 32 + k * 8, 90);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One wooden siege tower's frame as a single merged geometry (legs, braces, platform, posts). */
function towerFrameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    parts.push(geo);
  };
  const h = 8.5;
  const bottom = 1.8; // half-width at the ground
  const topW = 1.2; // half-width at the platform
  const lean = Math.atan((bottom - topW) / h);
  const legLen = Math.hypot(h, (bottom - topW) * Math.SQRT2);
  // Four legs leaning in.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = (bottom + topW) / 2;
      add(new THREE.BoxGeometry(0.35, legLen, 0.35), sx * m, h / 2, sz * m, -sz * lean, 0, sx * lean);
    }
  }
  // X braces on each side, at two levels.
  for (let level = 0; level < 2; level++) {
    const y0 = level * (h / 2);
    const y1 = y0 + h / 2;
    const wMid = bottom - ((bottom - topW) * (y0 + y1)) / 2 / h;
    const len = Math.hypot(h / 2, wMid * 2);
    const ang = Math.atan2(h / 2, wMid * 2);
    for (const d of [1, -1]) {
      add(new THREE.BoxGeometry(len, 0.18, 0.18), 0, (y0 + y1) / 2, wMid + 0.1, 0, 0, d * ang);
      add(new THREE.BoxGeometry(len, 0.18, 0.18), 0, (y0 + y1) / 2, -wMid - 0.1, 0, 0, d * ang);
      add(new THREE.BoxGeometry(0.18, 0.18, len), wMid + 0.1, (y0 + y1) / 2, 0, d * ang, 0, 0);
      add(new THREE.BoxGeometry(0.18, 0.18, len), -wMid - 0.1, (y0 + y1) / 2, 0, d * ang, 0, 0);
    }
    // Horizontal ring beam at the top of each level.
    for (const s of [-1, 1]) {
      const wy = bottom - ((bottom - topW) * y1) / h;
      add(new THREE.BoxGeometry(wy * 2 + 0.4, 0.22, 0.22), 0, y1, s * wy);
      add(new THREE.BoxGeometry(0.22, 0.22, wy * 2 + 0.4), s * wy, y1, 0);
    }
  }
  // Platform, roof posts and a railing.
  add(new THREE.BoxGeometry(topW * 2 + 1, 0.3, topW * 2 + 1), 0, h + 0.15, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.2, 2, 0.2), sx * topW, h + 1.15, sz * topW);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(topW * 2, 0.12, 0.12), 0, h + 0.85, s * topW);
    add(new THREE.BoxGeometry(0.12, 0.12, topW * 2), s * topW, h + 0.85, 0);
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

function createSiegeTowers(): Piece {
  const frame = towerFrameGeometry();
  const wood = toon({ color: 0x7c5034 });
  const roofGeo = new THREE.ConeGeometry(2.3, 1.9, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roofMat = toon({ color: 0x6a2a22 });
  const bannerTex = warBannerTexture();
  const flameTex = radialTexture('rgba(255,220,140,1)', 'rgba(255,90,20,0)');
  const camX = CONFIG.CAMERA.x;
  const camZ = CONFIG.FIELD.wallZ + CONFIG.CAMERA.back;

  const group = new THREE.Group();
  const flames: THREE.Sprite[] = [];
  const banners: Array<{ pos: THREE.BufferAttribute; base: Float32Array; phase: number }> = [];
  CONFIG.SCENERY.siegeTowers.forEach(([x, z], i) => {
    const t = new THREE.Group();
    t.position.set(x, groundHeight(x, z) - 0.1, z);
    t.rotation.y = Math.atan2(camX - x, camZ - z); // banner side faces the castle
    t.add(new THREE.Mesh(frame, wood));
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 8.5 + 3.1;
    t.add(roof);

    // Waving banner hanging from the platform's front edge.
    const bGeo = new THREE.PlaneGeometry(1.4, 3, 1, 8);
    bGeo.translate(0, -1.5, 0);
    const banner = new THREE.Mesh(bGeo, toon({ map: bannerTex, side: THREE.DoubleSide }));
    banner.position.set(0, 8.4, 1.75);
    t.add(banner);
    const pos = bGeo.attributes.position as THREE.BufferAttribute;
    banners.push({ pos, base: Float32Array.from({ length: pos.count }, (_, k) => pos.getY(k)), phase: i * 1.3 });

    // Fire in a brazier on the platform (sprites + bloom, no light).
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, color: k === 0 ? 0xffd27a : 0xff7a2a }),
      );
      f.position.set(0.7, 9.3 + k * 0.35, 0.7);
      f.userData.k = k;
      f.userData.phase = i * 2.1;
      t.add(f);
      flames.push(f);
    }
    group.add(t);
  });

  return {
    object: group,
    themed: [themedTint(wood.color, 0.35, 0.6), themedTint(roofMat.color, 0.75, 0.5)],
    update(t) {
      for (const b of banners) {
        for (let k = 0; k < b.pos.count; k++) {
          const y = b.base[k];
          b.pos.setZ(k, Math.sin(t * 2.2 + y * 1.6 + b.phase) * 0.2 * (-y / 3));
        }
        b.pos.needsUpdate = true;
      }
      for (const f of flames) {
        const k = f.userData.k as number;
        const flicker = 0.85 + Math.sin(t * 15 + f.userData.phase) * 0.08 + Math.sin(t * 6.1 + k) * 0.08;
        const s = (1.5 - k * 0.35) * flicker;
        f.scale.set(s * 0.8, s * 1.25, 1);
      }
    },
  };
}

// ---------------------------------------------------------------- fences

function createFences(): Piece {
  // Wooden post-and-rail fences along both road edges, with a few gaps.
  const [z0, z1] = CONFIG.SCENERY.fenceZ;
  const xEdge = CONFIG.FIELD.halfWidth + 2.3;
  const stepZ = 2.4;
  const segs = Math.floor((z0 - z1) / stepZ);
  const wood = toon({ color: 0x6e4a2e });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), wood, (segs + 1) * 2);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.12, 1), wood, segs * 4);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let p = 0;
  let r = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= segs; i++) {
      const z = z0 - i * stepZ;
      const x = side * (xEdge + Math.sin(z * 0.2) * 0.8);
      const y = groundHeight(x, z);
      q.setFromAxisAngle(up, range(-0.08, 0.08));
      m.compose(new THREE.Vector3(x, y + 0.5, z), q, new THREE.Vector3(1, 1, 1));
      posts.setMatrixAt(p++, m);
      if (i === segs || rand() < 0.12) continue; // a gap: missing rails
      const zn = z - stepZ;
      const xn = side * (xEdge + Math.sin(zn * 0.2) * 0.8);
      const yn = groundHeight(xn, zn);
      const from = new THREE.Vector3(x, y, z);
      const to = new THREE.Vector3(xn, yn, zn);
      const dir = to.clone().sub(from);
      const len = dir.length();
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      for (const h of [0.45, 0.85]) {
        m.compose(from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, h, 0)), q, new THREE.Vector3(1, 1, len));
        rails.setMatrixAt(r++, m);
      }
    }
  }
  posts.count = p;
  rails.count = r;
  const g = new THREE.Group();
  g.add(posts, rails);
  return { object: g, themed: [themedTint(wood.color, 0.45, 0.6)] };
}
