// Colours for the 3D world. Night / dusk mood matching our pixel deck (navy + gold).
import type { Element } from '../game/types.ts';

export const PALETTE = {
  navy: 0x0d0b24,
  gold: 0xf2c14e,
  skyTop: 0x0d0b24,
  skyMid: 0x241a4d,
  skyHorizon: 0x6b3a6e,
  horizonGlow: 0xe0795a,
  fog: 0x2a1f4a,
  moon: 0xfff1cf,
  grass: 0x2f5a42,
  grassDark: 0x1e3a2c,
  road: 0x84664c,
  roadDark: 0x5c4535,
  stone: 0x7d7a8c,
  stoneDark: 0x4d4a5c,
  wood: 0x5a3b24,
  torch: 0xffa040,
  pine: 0x24493d,
  pineDark: 0x183530,
  robe: 0x2b1f3d,
};

/** Element colours: used for glows, tints and particles. Badges add icons (never colour alone). */
export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xff5a2e,
  water: 0x3fa9ff,
  nature: 0x6fe05a,
};
