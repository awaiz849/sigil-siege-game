// The sky behind the valley (wave 1: concept art "Sunset Siege Over the Enchanted Valley"):
//   sky dome   lavender above, peach at the horizon, a warm glow around the sun
//   sun        a big low disc sitting in a gap between the mountains
//   mountains  three layers of jagged peaks, snow on top, warm where the sun hits, hazy at the base
//   mist       soft white bands in the valleys between the layers
//   clouds     puffy clouds lit orange from below, drifting slowly
// setTheme() follows the wave's scenery (themes.ts): wave 2 (frost) turns it into a clear winter sky
// over snow-covered peaks; wave 3 (inferno) into a black night sky with a blood moon, basalt peaks
// lit red, ash clouds and a smoking volcano rising in the gap where the sun was.
// Far things ignore the fog and fake their own haze with colour, so they stay readable.
import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { PALETTE } from './palette.ts';
import { radialTexture, WALL_TOP } from './environment.ts';
import { mixArray, mixColor, themedColor, type PerTheme, type Themed, type ThemeWeights } from './themes.ts';

let seed = 4242;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const range = (a: number, b: number) => a + rand() * (b - a);
const smooth = THREE.MathUtils.smoothstep;

/** Camera height and position: mountains and clouds are placed by the angle they appear at. */
const camY = () => WALL_TOP + CONFIG.CAMERA.height;
const camZ = () => CONFIG.FIELD.wallZ + CONFIG.CAMERA.back;
/** Height that appears `deg` degrees above the horizon at depth z. */
const heightAt = (z: number, deg: number) => camY() + (camZ() - z) * Math.tan(THREE.MathUtils.degToRad(deg));
/** Direction from the camera to the sun (x/z slope), for the gap in the mountains. */
const sunSlope = () => CONFIG.SCENERY.sun.x / (camZ() - CONFIG.SCENERY.sun.z);

export function createSky(scene: THREE.Scene) {
  const dome = skyDome();
  const sunGroup = sun();
  const moonGroup = moon();
  const stars = createStars();
  const mountains = mountainLayers();
  const mist = valleyMist();
  const clouds = createClouds();
  const volcano = createVolcano();
  scene.add(dome, sunGroup, moonGroup, stars, volcano.group);
  mountains.forEach((m) => scene.add(m.mesh));
  mist.forEach((m) => scene.add(m));
  scene.add(clouds.group);

  // Everything here follows the wave's theme (themes.ts). Per theme: [valley, frost, inferno].
  const u = (dome.material as THREE.ShaderMaterial).uniforms;
  const sunY = sunGroup.position.y;
  const starMat = stars.material as THREE.PointsMaterial;
  const moonMats: THREE.Material[] = [];
  moonGroup.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) moonMats.push(m);
  });
  const sunDisc = (sunGroup.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
  const sunHalo = (sunGroup.children[0] as THREE.Sprite).material;
  const themed: Themed[] = [
    // Sky dome: sunset lavender-peach / clear winter blue / black sky over a red volcanic glow.
    themedColor(u.top.value, [PALETTE.skyTop, 0x3a6cb8, 0x050103]),
    themedColor(u.mid.value, [PALETTE.skyMid, 0x7aa6dc, 0x26080a]),
    themedColor(u.horizon.value, [PALETTE.skyHorizon, 0xc2d6ee, 0x6e1c0e]),
    themedColor(u.glow.value, [PALETTE.horizonGlow, 0xfff2dc, 0xff4210]),
    // Pale white winter sun.
    themedColor(sunDisc.color, [0xffffff, 0xf4f8ff, 0xffffff]),
    themedColor(sunHalo.color, [0xffffff, 0xdce8ff, 0xffffff]),
    // Valley mist: sunset pink / snow white / red-brown smoke.
    ...mist.map((s) => themedColor(s.material.color, [0xffffff, 0xf2f6ff, 0x7a2a20])),
    (w) => {
      // The sun climbs a little in the winter sky and sinks behind the mountains at night;
      // the blood moon and a few stars come out in inferno.
      sunGroup.position.y = sunY + w[1] * 10 - w[2] * 40;
      sunGroup.visible = w[2] < 0.95;
      for (const m of moonMats) {
        m.transparent = true;
        m.opacity = THREE.MathUtils.smoothstep(w[2], 0.4, 1);
      }
      moonGroup.visible = w[2] > 0.4;
      starMat.opacity = 0.6 * THREE.MathUtils.smoothstep(w[2], 0.5, 1);
      stars.visible = w[2] > 0.5;
      for (const m of mountains) m.setTheme(w);
    },
    clouds.setTheme,
    volcano.setTheme,
  ];

  return {
    update(t: number) {
      clouds.update(t);
      volcano.update(t);
    },
    setTheme(w: ThemeWeights) {
      for (const f of themed) f(w);
    },
  };
}

// ---------------------------------------------------------------- sky dome

function skyDome(): THREE.Mesh {
  const s = CONFIG.SCENERY.sun;
  const sunDir = new THREE.Vector3(s.x, s.y - camY(), s.z - camZ()).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      mid: { value: new THREE.Color(PALETTE.skyMid) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      glow: { value: new THREE.Color(PALETTE.horizonGlow) },
      sunDir: { value: sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, mid, horizon, glow, sunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.14, h));
        c = mix(c, top, smoothstep(0.12, 0.5, h));
        // Warm glow around the sun (wide soft part + bright core) and along the whole horizon.
        float sd = max(dot(normalize(vDir), sunDir), 0.0);
        c += glow * (pow(sd, 6.0) * 0.3 + pow(sd, 80.0) * 0.45);
        c += glow * 0.06 * (1.0 - smoothstep(0.0, 0.12, abs(h)));
        // Kept a little below white so the bloom pass doesn't haze the whole sky.
        gl_FragColor = vec4(c * 0.82, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat);
  dome.renderOrder = -2;
  return dome;
}

// ---------------------------------------------------------------- sun

function sun(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(13, 32, 16), new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }));
  const halo = (inner: string, size: number) => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: radialTexture(inner, 'rgba(255,170,110,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    sp.scale.set(size, size, 1);
    return sp;
  };
  g.add(halo(PALETTE.sunHalo, 85), disc);
  const s = CONFIG.SCENERY.sun;
  g.position.set(s.x, s.y, s.z);
  g.renderOrder = -1;
  return g;
}

// ---------------------------------------------------------------- inferno: blood moon + stars

function moon(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16), new THREE.MeshBasicMaterial({ color: PALETTE.bloodMoon, fog: false }));
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,120,80,0.4)', 'rgba(255,120,80,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  halo.scale.set(80, 80, 1);
  g.add(halo, disc);
  // High on the left, where the sun was: in the sky band the camera sees.
  g.position.set(-70, heightAt(-300, 9.5), -300);
  g.visible = false;
  return g;
}

function createStars(): THREE.Points {
  const count = 700;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = range(0, Math.PI * 2);
    const y = Math.pow(rand(), 0.7) * 0.9 + 0.04;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(theta) * r * 380, y * 380, Math.sin(theta) * r * 380], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
  );
  stars.visible = false;
  return stars;
}

// ---------------------------------------------------------------- mountains

/** A layer's colours: snow on the peaks, rock below, shade lower down, haze at the foot.
 *  snowFrom = how tall a peak must be (0..1) before snow starts (above 1: never);
 *  warm = sunlit colour near the sun's gap, warmAmt = how much. */
type LayerLook = { snow: number; rock: number; shade: number; haze: number; snowFrom: number; warm: number; warmAmt: number };
type Layer = { z: number; low: number; high: number; looks: PerTheme<LayerLook> };

function mountainLayers() {
  // Peaks given as angles above the horizon, so they frame the sky the same way on any setup.
  // Per theme: [valley (sunset), frost (snow-covered, icy blue rock), inferno (black basalt lit red from below)].
  const sunset = 0xffbf8c;
  const never = 2;
  const layers: Layer[] = [
    {
      z: -275, low: 2.2, high: 9.5,
      looks: [
        { snow: 0xf8e4ea, rock: 0xa995c4, shade: 0xc9a6c4, haze: 0xf2c0b4, snowFrom: 0.35, warm: sunset, warmAmt: 0.5 },
        { snow: 0xffffff, rock: 0x7086b0, shade: 0x9eb2d2, haze: 0xd2deee, snowFrom: 0.3, warm: 0xfff6ea, warmAmt: 0.3 },
        { snow: 0x2a1418, rock: 0x1c1014, shade: 0x2c1214, haze: 0x6a1c10, snowFrom: never, warm: 0xff5020, warmAmt: 0.45 },
      ],
    },
    {
      z: -240, low: 1.2, high: 6.8,
      looks: [
        { snow: 0xf3d8e0, rock: 0x8a76a6, shade: 0xb08aaa, haze: 0xe6aeaa, snowFrom: 0.35, warm: sunset, warmAmt: 0.5 },
        { snow: 0xf2f6fc, rock: 0x5a6e96, shade: 0x8ea2c4, haze: 0xc6d4e8, snowFrom: 0.2, warm: 0xfff6ea, warmAmt: 0.3 },
        { snow: 0x241014, rock: 0x170c10, shade: 0x261012, haze: 0x5e180e, snowFrom: never, warm: 0xff5020, warmAmt: 0.4 },
      ],
    },
    {
      z: -208, low: 0.2, high: 2.4,
      looks: [
        { snow: 0x6f7a62, rock: 0x56634f, shade: 0x8f8a7a, haze: 0xdcaaa6, snowFrom: never, warm: sunset, warmAmt: 0.5 },
        { snow: 0xe6eef8, rock: 0x4a5c74, shade: 0x7e90aa, haze: 0xbccadc, snowFrom: 0.1, warm: 0xfff6ea, warmAmt: 0.2 },
        { snow: 0x140a0c, rock: 0x120a0c, shade: 0x1e0c0c, haze: 0x501408, snowFrom: never, warm: 0xff4a1a, warmAmt: 0.35 },
      ],
    },
  ];
  return layers.map(mountainStrip);
}

/** Triangle-wave 0..1 (sharp peaks, unlike sine hills). */
const tri = (u: number) => 1 - Math.abs(2 * (u - Math.floor(u)) - 1);

/** One layer of jagged peaks. Its vertex colours are built once per theme and blended by setTheme. */
function mountainStrip(l: Layer) {
  const d = camZ() - l.z;
  const half = d * 1.35;
  const gapX = sunSlope() * d;
  const gapHalf = d * 0.1;
  const step = d * 0.018;
  const cols = Math.ceil((half * 2) / step) + 1;
  const ROWS = 4; // peak, snow line, lower rock, hazy base
  const pos: number[] = [];
  const col: number[][] = [[], [], []];
  const c = new THREE.Color();
  const looks = l.looks.map((k) => ({
    snow: new THREE.Color(k.snow),
    rock: new THREE.Color(k.rock),
    shade: new THREE.Color(k.shade),
    haze: new THREE.Color(k.haze),
    warm: new THREE.Color(k.warm),
    snowFrom: k.snowFrom,
    warmAmt: k.warmAmt,
  }));
  const s1 = range(0, 10);
  const s2 = range(0, 10);

  for (let i = 0; i < cols; i++) {
    const x = -half + i * step;
    // Jagged ridge: two triangle waves + jitter; low in the gap where the sun sets, taller to the sides.
    let p = 0.6 * tri(x / (d * 0.16) + s1) + 0.3 * tri(x / (d * 0.07) + s2) + range(-0.06, 0.06);
    p *= 0.3 + 0.7 * smooth(Math.abs(x - gapX), gapHalf * 0.4, gapHalf * 1.8);
    p *= 0.75 + 0.35 * smooth(Math.abs(x), d * 0.1, d * 0.9);
    p = THREE.MathUtils.clamp(p, 0, 1);
    const peakY = heightAt(l.z, l.low + (l.high - l.low) * p);
    const footY = heightAt(l.z, l.low - 1.2);
    const snowY = peakY - (peakY - footY) * 0.28;
    const ys = [peakY, snowY, footY, -12];
    for (let r = 0; r < ROWS; r++) pos.push(x, ys[r], l.z);
    // Near the sun's gap: warm sunlight (in inferno, the volcano's glow).
    const sunlit = Math.exp(-(((x - gapX) / (d * 0.32)) ** 2));
    looks.forEach((k, t) => {
      const snowAmt = k.snowFrom > 1 ? 0 : smooth(p, k.snowFrom, k.snowFrom + 0.35);
      for (let r = 0; r < ROWS; r++) {
        if (r === 0) c.copy(k.rock).lerp(k.snow, snowAmt);
        else if (r === 1) c.copy(k.rock).lerp(k.snow, snowAmt * 0.35);
        else if (r === 2) c.copy(k.shade);
        else c.copy(k.haze);
        if (r < 2) c.lerp(k.warm, sunlit * k.warmAmt);
        col[t].push(c.r, c.g, c.b);
      }
    });
  }
  const index: number[] = [];
  for (let i = 0; i < cols - 1; i++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const a = i * ROWS + r;
      const b = (i + 1) * ROWS + r;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const perTheme = col.map((a) => new Float32Array(a)) as unknown as PerTheme<Float32Array>;
  const color = new THREE.BufferAttribute(perTheme[0].slice(), 3);
  geo.setAttribute('color', color);
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  return {
    mesh,
    setTheme(w: ThemeWeights) {
      mixArray(color.array as Float32Array, perTheme, w);
      color.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- volcano (inferno)

function createVolcano() {
  // A volcano rises in the gap between the mountains where the sun was (inferno only):
  // a dark cone with glowing lava streaks, a pulsing crater glow and a plume of smoke.
  const z = -255;
  const d = camZ() - z;
  const x = sunSlope() * d;
  const topY = heightAt(z, 7.5);
  const baseY = heightAt(z, -1.5);
  const h = topY - baseY;
  const geo = new THREE.CylinderGeometry(d * 0.022, d * 0.16, h, 28, 6, true);
  // Vertex colours: dark basalt, red toward the crater, lava streaks running down the front.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(0x1a0e10);
  const rim = new THREE.Color(0x8a2410);
  const lava = new THREE.Color(0xff6a1a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const up = pos.getY(i) / h + 0.5; // 0 at the foot, 1 at the crater
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    c.copy(rock).lerp(rim, smooth(up, 0.6, 1));
    const streak = Math.max(0, Math.cos(a * 9 + 1.2)) ** 6 * (pos.getZ(i) > 0 ? 1 : 0) * smooth(up, 0.15, 0.9);
    c.lerp(lava, streak);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.translate(0, h / 2, 0); // grows up from its foot
  const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const group = new THREE.Group();
  group.position.set(x, baseY, z);
  group.add(cone);

  // Crater glow (additive: bloom makes it burn) and dark smoke puffs rising from it.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,120,40,0.9)', 'rgba(255,60,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  glow.position.y = h;
  group.add(glow);
  const smokeTex = radialTexture('rgba(70,40,40,0.85)', 'rgba(40,20,20,0)');
  const puffs = Array.from({ length: 9 }, (_, k) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, fog: false }));
    group.add(s);
    return { s, phase: k / 9 };
  });
  let shown = 0;
  group.visible = false;
  return {
    group,
    update(t: number) {
      if (!group.visible) return;
      glow.scale.setScalar(d * (0.09 + Math.sin(t * 2.1) * 0.012));
      // Each puff rises, drifts, grows and fades, then starts again at the crater.
      for (const p of puffs) {
        const k = (p.phase + t * 0.035) % 1;
        p.s.position.set(Math.sin(k * 3 + p.phase * 9) * d * 0.02 + k * d * 0.08, h + k * d * 0.16, 0);
        p.s.scale.setScalar(d * (0.04 + k * 0.12));
        p.s.material.opacity = shown * Math.sin(k * Math.PI) * 0.9;
      }
    },
    setTheme(w: ThemeWeights) {
      // It rises out of the ground as the inferno theme fades in.
      shown = w[2];
      group.visible = shown > 0.01;
      group.scale.y = Math.max(0.01, smooth(shown, 0, 1));
      glow.material.opacity = shown;
    },
  };
}

// ---------------------------------------------------------------- valley mist

function valleyMist(): THREE.Sprite[] {
  // Soft white bands lying in front of each mountain layer's foot (the misty valleys).
  const tex = radialTexture('rgba(255,236,236,0.9)', 'rgba(255,236,236,0)');
  const out: THREE.Sprite[] = [];
  for (const z of [-196, -226, -258]) {
    const d = camZ() - z;
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: range(0.45, 0.7), depthWrite: false, fog: false }));
      sp.scale.set(d * range(0.7, 1.1), d * range(0.03, 0.05), 1);
      sp.position.set(range(-d, d), heightAt(z, range(-0.4, 0.6)), z);
      out.push(sp);
    }
  }
  return out;
}

// ---------------------------------------------------------------- clouds

/** A puffy cloud drawn on a canvas. Default: purple-grey top, pink middle, gold underside lit by the
 *  sun. `stops` = top / middle / underside colours. */
function cloudTexture(stops = ['#a48cc4', '#f2a6ac', '#ffcf86']): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 20, 0, 108);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.55, stops[1]);
  grad.addColorStop(1, stops[2]);
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = grad;
  ctx.beginPath();
  // A row of overlapping puffs, biggest in the middle, on a flat-ish bottom.
  const n = 7 + Math.floor(rand() * 4);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const r = (14 + 30 * Math.sin(u * Math.PI)) * range(0.8, 1.15);
    const cx = 24 + u * (w - 48) + range(-6, 6);
    const cy = 96 - r * 0.55 + range(-4, 4);
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.rect(30, 80, w - 60, 22);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createClouds() {
  const group = new THREE.Group();
  const textures = [cloudTexture(), cloudTexture(), cloudTexture()];
  const z = -300;
  const d = camZ() - z;
  // Every cloud is two sprites in the same place: the sunset one (valley) and a plain grey one that
  // the other themes tint: snow clouds in frost, ash clouds lit red from below in inferno.
  const clouds: Array<{ s: THREE.Sprite; grey: THREE.Sprite; opacity: number; speed: number; x0: number }> = [];
  for (let i = 0; i < 16; i++) {
    const opacity = range(0.75, 0.95);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[i % 3], transparent: true, opacity, depthWrite: false, fog: false }));
    const width = range(45, 120);
    s.scale.set(width, width * range(0.3, 0.42), 1);
    const x0 = range(-d * 1.2, d * 1.2);
    s.position.set(x0, heightAt(z, range(4.5, 12.5)), z + range(-10, 10));
    const grey = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false, fog: false }));
    grey.scale.copy(s.scale);
    grey.position.copy(s.position);
    grey.visible = false;
    group.add(s, grey);
    clouds.push({ s, grey, opacity, speed: range(0.6, 1.8), x0 });
  }
  const greyTextures = [0, 1, 2].map(() => cloudTexture(['#8e93a4', '#d4d8e2', '#ffffff']));
  clouds.forEach((c, i) => (c.grey.material.map = greyTextures[i % 3]));
  const tints = [0xffffff, 0xf2f6ff, 0x9a3020].map((c) => new THREE.Color(c)) as unknown as PerTheme<THREE.Color>;
  const tint = new THREE.Color();
  const span = d * 2.4;
  return {
    group,
    update(t: number) {
      for (const c of clouds) {
        c.s.position.x = ((c.x0 + t * c.speed + span / 2) % span) - span / 2;
        c.grey.position.x = c.s.position.x;
      }
    },
    setTheme(w: ThemeWeights) {
      // The grey clouds take the frost / inferno tint, weighted between the two.
      const other = w[1] + w[2];
      if (other > 0) mixColor(tint, tints, [0, w[1] / other, w[2] / other]);
      for (const c of clouds) {
        c.s.material.opacity = c.opacity * w[0];
        c.s.visible = w[0] > 0.01;
        c.grey.material.opacity = c.opacity * other;
        c.grey.visible = other > 0.01;
        c.grey.material.color.copy(tint);
      }
    },
  };
}
