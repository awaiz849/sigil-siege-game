// Synthesized background music for the night siege (Web Audio, no audio files):
//   ambience  soft low wind (low-passed noise, slowly gusting), quiet (CONFIG.MUSIC_WIND)
//   pad       a dark minor chord that slowly swells and shifts (A minor -> F -> G -> E)
//   drums     war drums; tempo and density rise with the intensity level (wave / boss)
// setMusicIntensity(0..4): 0 = menus (wind + soft pad), 1-3 = waves, 4 = boss.
import { CONFIG } from '../config.ts';
import { audioOut } from './sound.ts';

// Chord progression (semitones above A2 = 110 Hz), one chord per 2 bars.
const CHORDS = [
  [0, 3, 7, 12], // A minor
  [-4, 0, 3, 8], // F major
  [-2, 2, 5, 10], // G major
  [-5, -1, 2, 7], // E major (tension)
];
const freq = (semi: number) => 110 * Math.pow(2, semi / 12);

let started = false;
let intensity = 0;
let out: GainNode | null = null;
let pad: OscillatorNode[] = [];
let padFilter: BiquadFilterNode | null = null;
let windGain: GainNode | null = null;
let nextBeat = 0;
let beat = 0;

/** Start the music graph once audio is allowed (call every frame; cheap after the first time). */
export function updateMusic() {
  const a = audioOut();
  if (!a || CONFIG.MUSIC_VOLUME <= 0) return;
  const { ctx } = a;
  if (!started) start(a);
  if (!out) return;

  // Schedule drum hits a little ahead of time (Web Audio clock is sample-accurate).
  const bpm = CONFIG.MUSIC_BPM[intensity] ?? 0;
  if (bpm <= 0) {
    nextBeat = ctx.currentTime + 0.1;
    return;
  }
  const step = 60 / bpm / 2; // eighth notes
  while (nextBeat < ctx.currentTime + 0.15) {
    drumStep(ctx, a.noise, nextBeat, beat);
    beat++;
    // Change chord every 16 eighths (2 bars).
    if (beat % 16 === 0) setChord(CHORDS[(beat / 16) % CHORDS.length], nextBeat);
    nextBeat += step;
  }
}

/** 0 = menus, 1..3 = wave number, 4 = boss fight. */
export function setMusicIntensity(level: number) {
  intensity = Math.max(0, Math.min(4, level));
  const a = audioOut();
  if (!a || !padFilter || !windGain) return;
  const t = a.ctx.currentTime;
  // The pad opens up (brighter) and the wind drops a little as the fight intensifies.
  padFilter.frequency.setTargetAtTime(400 + intensity * 250, t, 1.5);
  windGain.gain.setTargetAtTime(CONFIG.MUSIC_WIND * (1 - intensity * 0.15), t, 2);
}

function start(a: { ctx: AudioContext; master: GainNode; noise: AudioBuffer }) {
  started = true;
  const { ctx, master, noise } = a;
  out = ctx.createGain();
  out.gain.value = CONFIG.MUSIC_VOLUME;
  out.connect(master);

  // Wind: looping noise through a band-pass whose frequency wanders slowly (gusts).
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noise;
  windSrc.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 380;
  windFilter.Q.value = 0.5;
  const gust = ctx.createOscillator();
  gust.frequency.value = 0.07;
  const gustDepth = ctx.createGain();
  gustDepth.gain.value = 150;
  gust.connect(gustDepth).connect(windFilter.frequency);
  windGain = ctx.createGain();
  windGain.gain.value = CONFIG.MUSIC_WIND;
  windSrc.connect(windFilter).connect(windGain).connect(out);
  windSrc.start();
  gust.start();

  // Pad: four detuned saw voices through a soft low-pass.
  padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 400;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.05;
  padFilter.connect(padGain).connect(out);
  pad = CHORDS[0].map((s, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq(s);
    o.detune.value = (i % 2 ? 1 : -1) * 7;
    o.connect(padFilter!);
    o.start();
    return o;
  });
  nextBeat = ctx.currentTime + 0.2;
}

function setChord(chord: number[], at: number) {
  pad.forEach((o, i) => o.frequency.setTargetAtTime(freq(chord[i]), at, 0.4));
}

/** One eighth-note step of the drum pattern. Busier at higher intensity. */
function drumStep(ctx: AudioContext, noise: AudioBuffer, t: number, i: number) {
  const pos = i % 8; // position in the bar
  const level = intensity;
  // Big war drum on 1 and 5 (and 7 in the boss fight).
  if (pos === 0 || pos === 4 || (level >= 4 && pos === 6)) boom(ctx, t, pos === 0 ? 0.55 : 0.4);
  // Low tom pickup from wave 2.
  if (level >= 2 && pos === 7) boom(ctx, t, 0.25, 90);
  // Rattling snare-ish hits from wave 3.
  if (level >= 3 && (pos === 2 || pos === 6)) rattle(ctx, noise, t, 0.12);
  // Boss: a driving low pulse on every eighth.
  if (level >= 4) boom(ctx, t, 0.12, 50, 0.12);
}

function boom(ctx: AudioContext, t: number, vol: number, f0 = 70, dur = 0.5) {
  if (!out) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(f0 * 1.8, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function rattle(ctx: AudioContext, noise: AudioBuffer, t: number, vol: number) {
  if (!out) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.2);
}
