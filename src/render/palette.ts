// Colours for the 3D world. Night / dusk mood matching our pixel deck (navy + gold).
import type { Element } from '../game/types.ts';

export const PALETTE = {
  navy: 0x0d0b24,
  gold: 0xf2c14e,
  skyTop: 0x03020a,
  skyMid: 0x0b0a22,
  skyHorizon: 0x1c1840,
  horizonGlow: 0x7a1e3a, // faint blood-red glow low on the horizon: something is coming
  fog: 0x0e0c22,
  moon: 0xfff1cf,
  grass: 0x22433a,
  grassDark: 0x142a26,
  road: 0x5e4c44,
  roadDark: 0x3e322e,
  stone: 0x7d7a8c,
  stoneDark: 0x4d4a5c,
  wood: 0x5a3b24,
  torch: 0xffa040,
  pine: 0x173630,
  pineDark: 0x0e2420,
  robe: 0x2b1f3d,
};

/** Element colours: used for glows, tints and particles. Badges add icons (never colour alone). */
export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xff5a2e,
  water: 0x3fa9ff,
  nature: 0x6fe05a,
};
