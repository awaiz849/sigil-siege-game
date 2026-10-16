// Synthesized background music (Web Audio, no audio files): a small fantasy theme in D minor
// that builds with the fight. A tiny step sequencer plays 8th-note steps:
//   pad     warm chord (soft triangles), one chord per bar: Dm - Bb - F - C (boss: Dm - Bb - Gm - A)
//   harp    plucked arpeggio of the chord, every level
//   flute   the melody (8 bars), soft in the menu, clearer in the waves
//   brass   the boss's darker, lower melody
//   bass    root notes, from wave 1
//   drums   taiko booms from wave 1, hi-hat ticks from wave 2, snare from wave 3, driving toms for the boss
// Everything goes through a generated reverb for space, plus a quiet wind underneath.
// setMusicIntensity(0..4): 0 = menus, 1-3 = wave number, 4 = boss. Tempo per level: CONFIG.MUSIC_BPM.
import { CONFIG } from '../config.ts';
import { audioOut } from './sound.ts';

/** Frequency of a note given in semitones above D4. */
const D4 = 293.66;
const hz = (semi: number) => D4 * Math.pow(2, semi / 12);

// Chords as semitones above D4 (root, third, fifth). One chord per bar.
const DM = [0, 3, 7];
const BB = [-4, 0, 3];
const F = [3, 7, 10];
const C = [-2, 2, 5];
const GM = [-7, -4, 0];
const A = [-5, -1, 2]; // A major (C#): tension before the loop returns to D minor
const THEME_CHORDS = [DM, BB, F, C, DM, BB, F, C];
const BOSS_CHORDS = [DM, BB, GM, A];

// Melodies: [step, semitone above D4, length in steps]; 8 steps per bar.
const THEME: Array<[number, number, number]> = [
  [0, 7, 3], [3, 5, 1], [4, 3, 2], [6, 2, 2], // Dm: A - G F E
  [8, 0, 6], [14, 3, 2], // Bb: D ... F
  [16, 7, 2], [18, 10, 2], [20, 7, 2], [22, 5, 2], // F: A C A G
  [24, 2, 6], [30, -2, 2], // C: E ... C
  [32, 0, 2], [34, 3, 2], [36, 7, 2], [38, 12, 2], // Dm: D F A D (rising)
  [40, 10, 3], [43, 8, 1], [44, 7, 4], // Bb: C Bb A
  [48, 3, 2], [50, 5, 2], [52, 7, 2], [54, 10, 2], // F: F G A C
  [56, 5, 3], [59, 3, 1], [60, 2, 4], // C: G F E (back to the start)
];
const BOSS_THEME: Array<[number, number, number]> = [
  [0, -12, 1], [1, -12, 1], [2, -12, 2], [4, -9, 2], [6, -10, 2], // Dm: D D D F E
  [8, -14, 4], [12, -16, 4], // Bb: C Bb
  [16, -14, 2], [18, -12, 2], [20, -9, 2], [22, -7, 2], // Gm: C D F G
  [24, -5, 3], [27, -7, 1], [28, -10, 2], [30, -13, 2], // A: A G E C#
];
const LOOP = 64; // theme: 8 bars
const BOSS_LOOP = 32; // boss: 4 bars

let started = false;
let intensity = 0;
let out: GainNode | null = null; // dry music bus
let verb: GainNode | null = null; // send to the reverb
let windGain: GainNode | null = null;
let nextStep = 0;
let step = 0;

/** Start the music graph once audio is allowed and schedule notes ahead (call every frame). */
export function updateMusic() {
  const a = audioOut();
  if (!a || CONFIG.MUSIC_VOLUME <= 0) return;
  const { ctx } = a;
  if (!started) start(a);
  if (!out) return;
  const bpm = CONFIG.MUSIC_BPM[intensity] ?? 90;
  const len = 60 / bpm / 2; // one eighth note
  // A tab in the background stops the clock jumping ahead: never schedule a big backlog.
  if (nextStep < ctx.currentTime - 0.2) nextStep = ctx.currentTime + 0.05;
  while (nextStep < ctx.currentTime + 0.2) {
    playStep(ctx, a.noise, nextStep, step, len);
    step++;
    nextStep += len;
  }
}

/** 0 = menus, 1..3 = wave number, 4 = boss fight. */
export function setMusicIntensity(level: number) {
  const was = intensity;
  intensity = Math.max(0, Math.min(4, level));
  // Entering or leaving the boss fight starts its loop from the top of a bar.
  if ((was === 4) !== (intensity === 4)) step = Math.ceil(step / 8) * 8;
  const a = audioOut();
  if (a && windGain) windGain.gain.setTargetAtTime(CONFIG.MUSIC_WIND * (1 - intensity * 0.15), a.ctx.currentTime, 2);
}

function start(a: { ctx: AudioContext; master: GainNode; noise: AudioBuffer }) {
  started = true;
  const { ctx, master, noise } = a;
  const bus = ctx.createGain();
  bus.gain.value = CONFIG.MUSIC_VOLUME;
  bus.connect(master);
  out = ctx.createGain();
  out.connect(bus);

  // Reverb: a convolver with 2.4 s of decaying stereo noise as its "room".
  const convolver = ctx.createConvolver();
  const seconds = 2.4;
  const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  convolver.buffer = ir;
  verb = ctx.createGain();
  verb.gain.value = 0.35;
  verb.connect(convolver).connect(bus);

  // Soft low wind underneath (low-passed noise, slowly gusting).
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noise;
  windSrc.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 380;
  const gust = ctx.createOscillator();
  gust.frequency.value = 0.07;
  const gustDepth = ctx.createGain();
  gustDepth.gain.value = 150;
  gust.connect(gustDepth).connect(windFilter.frequency);
  windGain = ctx.createGain();
  windGain.gain.value = CONFIG.MUSIC_WIND;
  windSrc.connect(windFilter).connect(windGain).connect(bus);
  windSrc.start();
  gust.start();
  nextStep = ctx.currentTime + 0.1;
}

/** Route a voice to the dry bus and (some of it) to the reverb. */
function connect(node: AudioNode, wet: number) {
  node.connect(out!);
  if (wet > 0 && verb) {
    const send = node.context.createGain();
    send.gain.value = wet;
    node.connect(send).connect(verb);
  }
}

/** Everything that happens on one eighth-note step. */
function playStep(ctx: AudioContext, noise: AudioBuffer, t: number, i: number, len: number) {
  const boss = intensity === 4;
  const level = intensity;
  const pos = i % 8; // position in the bar
  const chord = boss ? BOSS_CHORDS[Math.floor((i % BOSS_LOOP) / 8)] : THEME_CHORDS[Math.floor((i % LOOP) / 8)];

  // Pad: a new chord at the start of every bar, held for the whole bar.
  if (pos === 0) for (const semi of chord) pad(ctx, t, hz(semi - 12), len * 8, boss ? 0.035 : 0.04);

  // Harp: chord tones up and down (root, 3rd, 5th, octave ...).
  const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
  const tone = ARP[pos] === 3 ? chord[0] + 12 : chord[ARP[pos]];
  if (!boss || pos % 2 === 0) harp(ctx, t, hz(tone), level === 0 ? 0.05 : 0.065);

  // Melody: flute for the theme (from the menu on), brass for the boss.
  const notes = boss ? BOSS_THEME : THEME;
  const at = boss ? i % BOSS_LOOP : i % LOOP;
  for (const [s, semi, steps] of notes) {
    if (s !== at) continue;
    if (boss) brass(ctx, t, hz(semi), steps * len);
    else flute(ctx, t, hz(semi + (level >= 3 ? 12 : 0)), steps * len, level === 0 ? 0.045 : 0.06);
  }

  // Bass on beats 1 and 3, from wave 1 (boss: every beat).
  if (level >= 1 && (pos === 0 || pos === 4 || (boss && pos % 2 === 0))) bass(ctx, t, hz(chord[0] - 24), len * (boss ? 2 : 4));

  // Drums build with the waves.
  if (level >= 1 && (pos === 0 || pos === 4)) boom(ctx, t, pos === 0 ? 0.4 : 0.28);
  if (level >= 2 && pos % 2 === 1) hat(ctx, noise, t, 0.05);
  if (level >= 3 && (pos === 2 || pos === 6)) snare(ctx, noise, t, 0.1);
  if (level >= 3 && pos === 7) boom(ctx, t, 0.18, 110, 0.25);
  if (boss && pos % 2 === 1) boom(ctx, t, 0.16, 55, 0.2);
}

// ---------------------------------------------------------------- instruments

/** Envelope helper: soft attack, hold, release. */
function env(g: GainNode, t: number, vol: number, attack: number, dur: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
}

function osc(ctx: AudioContext, type: OscillatorType, f: number, t: number, stop: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.start(t);
  o.stop(stop);
  return o;
}

/** Warm pad voice: two slightly detuned triangles, slow swell. */
function pad(ctx: AudioContext, t: number, f: number, dur: number, vol: number) {
  const g = ctx.createGain();
  env(g, t, vol, dur * 0.35, dur, dur * 0.3);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  for (const d of [-6, 6]) osc(ctx, 'triangle', f, t, t + dur * 1.4, d).connect(lp);
  lp.connect(g);
  connect(g, 0.6);
}

/** Plucked harp: bright attack that darkens quickly, ringing decay. */
function harp(ctx: AudioContext, t: number, f: number, vol: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.4);
  osc(ctx, 'triangle', f, t, t + 1.3).connect(lp);
  lp.connect(g);
  connect(g, 0.5);
}

/** Flute: sine + a little triangle, gentle vibrato that grows into long notes. */
function flute(ctx: AudioContext, t: number, f: number, dur: number, vol: number) {
  const g = ctx.createGain();
  env(g, t, vol, 0.07, dur, Math.min(0.25, dur * 0.4));
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(14, t + Math.min(0.5, dur)); // cents
  vib.connect(depth);
  const a = osc(ctx, 'sine', f, t, t + dur + 0.4);
  const b = osc(ctx, 'triangle', f, t, t + dur + 0.4);
  depth.connect(a.detune);
  depth.connect(b.detune);
  vib.start(t);
  vib.stop(t + dur + 0.4);
  const bGain = ctx.createGain();
  bGain.gain.value = 0.25;
  a.connect(g);
  b.connect(bGain).connect(g);
  connect(g, 0.55);
}

/** Boss brass: two detuned saws through a low-pass that opens on each note. */
function brass(ctx: AudioContext, t: number, f: number, dur: number) {
  const g = ctx.createGain();
  env(g, t, 0.06, 0.05, dur, 0.15);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(1100, t + 0.12);
  lp.frequency.linearRampToValueAtTime(700, t + dur);
  for (const d of [-8, 8]) osc(ctx, 'sawtooth', f, t, t + dur + 0.3, d).connect(lp);
  lp.connect(g);
  connect(g, 0.35);
}

/** Round bass note. */
function bass(ctx: AudioContext, t: number, f: number, dur: number) {
  const g = ctx.createGain();
  env(g, t, 0.13, 0.02, dur * 0.8, dur * 0.2);
  osc(ctx, 'triangle', f, t, t + dur + 0.1).connect(g);
  connect(g, 0.1);
}

/** Taiko-style drum: a pitched thump that drops. */
function boom(ctx: AudioContext, t: number, vol: number, f0 = 70, dur = 0.5) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const o = osc(ctx, 'sine', f0 * 1.8, t, t + dur + 0.05);
  o.frequency.setValueAtTime(f0 * 1.8, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + dur);
  o.connect(g);
  connect(g, 0.25);
}

/** Short filtered-noise tick. */
function hat(ctx: AudioContext, noise: AudioBuffer, t: number, vol: number) {
  noiseHit(ctx, noise, t, vol, 'highpass', 7000, 0.05);
}

/** Snare: noise burst + a short tone. */
function snare(ctx: AudioContext, noise: AudioBuffer, t: number, vol: number) {
  noiseHit(ctx, noise, t, vol, 'bandpass', 1800, 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  osc(ctx, 'triangle', 190, t, t + 0.12).connect(g);
  connect(g, 0.2);
}

function noiseHit(ctx: AudioContext, noise: AudioBuffer, t: number, vol: number, type: BiquadFilterType, f: number, dur: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g);
  connect(g, 0.2);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}
