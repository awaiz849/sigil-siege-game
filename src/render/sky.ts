// The sunset sky behind the valley (concept art: "Sunset Siege Over the Enchanted Valley"):
//   sky dome   lavender above, peach at the horizon, a warm glow around the sun
//   sun        a big low disc sitting in a gap between the mountains
//   mountains  three layers of jagged peaks, snow on top, warm where the sun hits, hazy at the base
//   mist       soft white bands in the valleys between the layers
//   clouds     puffy clouds lit orange from below, drifting slowly
// Far things ignore the fog and fake their own haze with colour, so they stay readable.
import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { PALETTE } from './palette.ts';
import { radialTexture, WALL_TOP } from './environment.ts';

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
  scene.add(skyDome());
  scene.add(sun());
  mountainLayers().forEach((m) => scene.add(m));
  valleyMist().forEach((m) => scene.add(m));
  const clouds = createClouds();
  scene.add(clouds.group);
  return { update: clouds.update };
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

// ---------------------------------------------------------------- mountains

type Layer = { z: number; low: number; high: number; snow: boolean; colors: { snow: number; rock: number; shade: number; haze: number } };

function mountainLayers(): THREE.Mesh[] {
  // Peaks given as angles above the horizon, so they frame the sky the same way on any setup.
  const layers: Layer[] = [
    { z: -275, low: 2.2, high: 9.5, snow: true, colors: { snow: 0xf8e4ea, rock: 0xa995c4, shade: 0xc9a6c4, haze: 0xf2c0b4 } },
    { z: -240, low: 1.2, high: 6.8, snow: true, colors: { snow: 0xf3d8e0, rock: 0x8a76a6, shade: 0xb08aaa, haze: 0xe6aeaa } },
    { z: -208, low: 0.2, high: 2.4, snow: false, colors: { snow: 0x6f7a62, rock: 0x56634f, shade: 0x8f8a7a, haze: 0xdcaaa6 } },
  ];
  return layers.map(mountainStrip);
}

/** Triangle-wave 0..1 (sharp peaks, unlike sine hills). */
const tri = (u: number) => 1 - Math.abs(2 * (u - Math.floor(u)) - 1);

function mountainStrip(l: Layer): THREE.Mesh {
  const d = camZ() - l.z;
  const half = d * 1.35;
  const gapX = sunSlope() * d;
  const gapHalf = d * 0.1;
  const step = d * 0.018;
  const cols = Math.ceil((half * 2) / step) + 1;
  const ROWS = 4; // peak, snow line, lower rock, hazy base
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const snow = new THREE.Color(l.colors.snow);
  const rock = new THREE.Color(l.colors.rock);
  const shade = new THREE.Color(l.colors.shade);
  const haze = new THREE.Color(l.colors.haze);
  const warm = new THREE.Color(0xffbf8c);
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
    // Snow only on the taller peaks; sunlit warmth near the sun's direction.
    const snowAmt = l.snow ? smooth(p, 0.35, 0.7) : 0;
    const sunlit = 0.5 * Math.exp(-(((x - gapX) / (d * 0.32)) ** 2));
    for (let r = 0; r < ROWS; r++) {
      if (r === 0) c.copy(rock).lerp(snow, snowAmt);
      else if (r === 1) c.copy(rock).lerp(snow, snowAmt * 0.35);
      else if (r === 2) c.copy(shade);
      else c.copy(haze);
      if (r < 2) c.lerp(warm, sunlit);
      pos.push(x, ys[r], l.z);
      col.push(c.r, c.g, c.b);
    }
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
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
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

/** A puffy cloud drawn on a canvas: purple-grey top, pink middle, gold underside lit by the sun. */
function cloudTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 20, 0, 108);
  grad.addColorStop(0, '#a48cc4');
  grad.addColorStop(0.55, '#f2a6ac');
  grad.addColorStop(1, '#ffcf86');
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
  const clouds: Array<{ s: THREE.Sprite; speed: number; x0: number }> = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[i % 3], transparent: true, opacity: range(0.75, 0.95), depthWrite: false, fog: false }));
    const width = range(45, 120);
    s.scale.set(width, width * range(0.3, 0.42), 1);
    const x0 = range(-d * 1.2, d * 1.2);
    s.position.set(x0, heightAt(z, range(4.5, 12.5)), z + range(-10, 10));
    group.add(s);
    clouds.push({ s, speed: range(0.6, 1.8), x0 });
  }
  const span = d * 2.4;
  return {
    group,
    update(t: number) {
      for (const c of clouds) c.s.position.x = ((c.x0 + t * c.speed + span / 2) % span) - span / 2;
    },
  };
}
