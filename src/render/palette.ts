// Colours for the 3D world. Sunset mood: orange horizon, magenta-to-indigo sky, purple mountains.
import type { Element } from '../game/types.ts';

export const PALETTE = {
  navy: 0x0d0b24,
  gold: 0xf2c14e,
  skyTop: 0x7a70c0, // lavender high up
  skyMid: 0xcb9cc8, // pink-lilac
  skyHorizon: 0xffb27c, // peach at the horizon
  horizonGlow: 0xffc27a, // the setting sun's glow
  fog: 0xcaa6bc, // lilac haze (matches the mountains' misty feet)
  sun: 0xfff2c4,
  sunHalo: 'rgba(255,205,130,0.75)',
  // Night (wave 3): deep navy sky, a faint purple glow where the sun went down, the moon.
  nightTop: 0x03020a,
  nightMid: 0x0b0a22,
  nightHorizon: 0x1c1840,
  nightGlow: 0x3a1638,
  nightFog: 0x0e0c22,
  moon: 0xfff1cf,
  grass: 0x6a9a4a,
  grassDark: 0x3f6e38,
  road: 0x9f8a6c,
  roadDark: 0x7f6a52,
  stone: 0x7d7a8c,
  stoneDark: 0x8a7f78,
  wood: 0x5a3b24,
  torch: 0xffa040,
  pine: 0x3a7046,
  pineDark: 0x24503a,
  robe: 0x2b1f3d,
};

/** Element colours: used for glows, tints and particles. Badges add icons (never colour alone). */
export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xff5a2e,
  water: 0x3fa9ff,
  nature: 0x6fe05a,
};
