// Scenery themes: the battlefield looks different every wave (CONFIG.WAVE_SCENERY).
//   valley   wave 1  the sunset valley from the concept art
//   frost    wave 2  a snowy mountain pass in cold daylight
//   inferno  wave 3  a volcanic wasteland at night
// Nothing is rebuilt when the wave changes. Every themed part keeps one colour (or colour array)
// per theme and blends them with the theme WEIGHTS: how much of each theme shows, summing to 1.
// During a fade the weights slide from the old theme to the new one, so everything cross-fades
// together. Per-theme values are always written in THEMES order: [valley, frost, inferno].
import * as THREE from 'three';
import { CONFIG } from '../config.ts';

export type ThemeName = (typeof CONFIG.WAVE_SCENERY.byWave)[number];
export const THEMES: readonly ThemeName[] = ['valley', 'frost', 'inferno'];
/** How much of each theme shows, in THEMES order (sums to 1). */
export type ThemeWeights = readonly [number, number, number];
/** One value per theme, in THEMES order. */
export type PerTheme<T> = readonly [T, T, T];
/** Something that follows the theme: called with the new weights whenever they change. */
export type Themed = (w: ThemeWeights) => void;

/** Theme index for a wave number (1..3). */
export function themeForWave(wave: number): number {
  const byWave = CONFIG.WAVE_SCENERY.byWave;
  return THEMES.indexOf(byWave[Math.min(byWave.length, Math.max(1, wave)) - 1]);
}

/** Blend a number per theme. */
export function mixNum(v: PerTheme<number>, w: ThemeWeights): number {
  return v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
}

/** Blend a colour per theme into `out`. */
export function mixColor(out: THREE.Color, c: PerTheme<THREE.Color>, w: ThemeWeights): THREE.Color {
  return out.setRGB(
    c[0].r * w[0] + c[1].r * w[1] + c[2].r * w[2],
    c[0].g * w[0] + c[1].g * w[1] + c[2].g * w[2],
    c[0].b * w[0] + c[1].b * w[1] + c[2].b * w[2],
  );
}

/** Blend arrays (e.g. per-vertex colours) per theme into `out`. */
export function mixArray(out: Float32Array, a: PerTheme<Float32Array>, w: ThemeWeights): void {
  const [a0, a1, a2] = a;
  const [w0, w1, w2] = w;
  for (let i = 0; i < out.length; i++) out[i] = a0[i] * w0 + a1[i] * w1 + a2[i] * w2;
}

/** Make a target colour follow the theme: one colour per theme. */
export function themedColor(target: THREE.Color, colors: PerTheme<THREE.ColorRepresentation>): Themed {
  const c = colors.map((v) => new THREE.Color(v)) as unknown as PerTheme<THREE.Color>;
  return (w) => mixColor(target, c, w);
}

/** Snow on things in frost, soot in inferno: what prop colours are pulled toward. */
const SNOW = new THREE.Color(0xeef4ff);
const SOOT = new THREE.Color(0x2a1c1c);

/** Make a prop material's colour follow the theme: its own colour in the valley, covered in snow
 *  in frost (snow = how much), charred in inferno (soot = how much). */
export function themedTint(target: THREE.Color, snow = 0.55, soot = 0.6): Themed {
  const base = target.clone();
  return themedColor(target, [base, base.clone().lerp(SNOW, snow), base.clone().lerp(SOOT, soot)]);
}
