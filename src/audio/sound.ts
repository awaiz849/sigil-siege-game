// Synthesized sound effects with the Web Audio API: no audio files.
// Every sound is a few oscillators and/or filtered noise with a quick volume envelope.
// For a hands-free demo, start Chrome with --autoplay-policy=no-user-gesture-required;
// otherwise audio starts after the first click/key (browsers block it before that).
import { CONFIG } from '../config.ts';
import type { SpellResult } from '../game/spells.ts';
import type { GameEvent } from '../game/types.ts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Create the audio graph on first use: master volume -> compressor -> speakers. */
function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = CONFIG.VOLUME;
    master.connect(comp).connect(ctx.destination);
    // 1 s of white noise, reused by every noisy sound.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Hidden tab: silence everything at once. Suspending the AudioContext also stops its clock,
 *  so the music picks up in step when the tab comes back. */
export function setAudioPaused(paused: boolean): void {
  if (!ctx) return;
  (paused ? ctx.suspend() : ctx.resume()).catch(() => {});
}

// Unlock audio on the first gesture if the autoplay flag isn't set.
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio(), { once: true });

/** The shared audio context, master output and noise buffer (for music.ts). Null until audio can start. */
export function audioOut(): { ctx: AudioContext; master: GainNode; noise: AudioBuffer } | null {
  const a = audio();
  return a && master && noiseBuffer ? { ctx: a, master, noise: noiseBuffer } : null;
}

/** One oscillator note: type, start/end frequency, duration, volume, delay. */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.3, delay = 0) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Filtered noise burst (whooshes, cracks, booms). */
function noise(filter: BiquadFilterType, f0: number, f1: number, dur: number, vol = 0.3, delay = 0, q = 1) {
  const a = audio();
  if (!a || !master || !noiseBuffer) return;
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  const bq = a.createBiquadFilter();
  bq.type = filter;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f0, t);
  bq.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** Notes as semitones above A4 (440 Hz). */
const note = (semi: number) => 440 * Math.pow(2, semi / 12);

export const sound = {
  // ---- spells
  water() {
    tone('sine', 300, 900, 0.25, 0.25);
    tone('sine', 500, 1400, 0.2, 0.15, 0.06);
    noise('bandpass', 800, 2000, 0.25, 0.08, 0, 3);
  },
  fire() {
    noise('lowpass', 400, 3000, 0.35, 0.35);
    tone('sawtooth', 110, 220, 0.3, 0.12);
  },
  nature() {
    // Plucked chord, like a harp.
    [0, 4, 7, 12].forEach((s, i) => tone('triangle', note(s - 5), note(s - 5), 0.4, 0.15, i * 0.04));
    noise('highpass', 3000, 6000, 0.15, 0.05);
  },
  /** Meteor thrown: a rising rushing-air whoosh. */
  meteorWhoosh() {
    noise('bandpass', 300, 1800, 0.75, 0.22);
  },
  /** Meteor lands: a deep explosion. */
  meteorBoom() {
    noise('lowpass', 900, 80, 1.1, 0.55);
    tone('sine', 95, 28, 1.0, 0.7);
    tone('sawtooth', 170, 40, 0.45, 0.14);
  },
  lightning() {
    noise('highpass', 6000, 1500, 0.15, 0.6);
    noise('lowpass', 300, 60, 1.0, 0.5, 0.05);
    tone('sawtooth', 80, 40, 0.8, 0.15, 0.05);
  },
  wind() {
    // Rising whoosh: band-passed noise sweeping up, plus a soft low rush.
    noise('bandpass', 300, 1800, 0.6, 0.35, 0, 1.5);
    noise('lowpass', 500, 150, 0.7, 0.2, 0.05);
  },
  shield() {
    // Metallic ping (inharmonic partials) + whoosh.
    tone('sine', 1200, 1150, 0.6, 0.18);
    tone('sine', 1870, 1800, 0.5, 0.1);
    noise('bandpass', 1500, 400, 0.4, 0.15, 0, 2);
  },
  // ---- results
  hit() {
    tone('sine', 180, 60, 0.15, 0.4);
  },
  superEffective() {
    [0, 4, 7, 12].forEach((s, i) => tone('square', note(s + 3), note(s + 3), 0.12, 0.08, i * 0.06));
  },
  kill() {
    tone('sine', 160, 50, 0.2, 0.4);
    noise('bandpass', 2000, 6000, 0.25, 0.12, 0.03, 2);
    tone('triangle', note(15), note(19), 0.25, 0.1, 0.05);
  },
  resisted() {
    tone('square', 140, 120, 0.18, 0.08);
  },
  miss() {
    tone('triangle', 500, 200, 0.25, 0.15);
  },
  fizzle() {
    noise('bandpass', 1200, 300, 0.4, 0.2, 0, 4);
    tone('sawtooth', 90, 70, 0.3, 0.06);
  },
  cooldown() {
    tone('square', 220, 220, 0.08, 0.06);
    tone('square', 180, 180, 0.08, 0.06, 0.1);
  },
  // ---- game
  castleHit() {
    noise('lowpass', 500, 50, 0.6, 0.6);
    tone('sine', 80, 35, 0.5, 0.5);
  },
  warlockCharge() {
    tone('sawtooth', 200, 600, 1.0, 0.05);
  },
  bossArrive() {
    // Low horn swelling in, then two drum hits.
    tone('sawtooth', 55, 55, 1.4, 0.18);
    tone('sawtooth', 82.5, 82.5, 1.4, 0.12);
    noise('lowpass', 200, 60, 0.5, 0.5, 0.2);
    noise('lowpass', 200, 60, 0.5, 0.5, 0.6);
  },
  bossWarning() {
    tone('square', 880, 880, 0.08, 0.06);
    tone('square', 660, 660, 0.08, 0.06, 0.12);
  },
  waveStart() {
    [0, 7].forEach((s, i) => tone('square', note(s - 12), note(s - 12), 0.18, 0.08, i * 0.15));
  },
  win() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone('square', note(s), note(s), 0.22, 0.09, i * 0.09));
  },
  lose() {
    [0, -3, -7, -12].forEach((s, i) => tone('triangle', note(s - 5), note(s - 6), 0.4, 0.15, i * 0.22));
  },
  // ---- UI
  tick() {
    tone('square', 1200, 1200, 0.03, 0.03);
  },
  select() {
    tone('square', note(7), note(7), 0.08, 0.08);
    tone('square', note(12), note(12), 0.12, 0.08, 0.07);
  },
  start() {
    [0, 4, 7, 12].forEach((s, i) => tone('square', note(s), note(s), 0.12, 0.08, i * 0.05));
    noise('highpass', 2000, 8000, 0.4, 0.06);
  },
};

/** Sounds for a cast result. */
export function playCast(r: SpellResult) {
  if (r.kind === 'ignored') return;
  if (r.kind === 'fizzle') return sound.fizzle();
  if (r.kind === 'cooldown' || r.kind === 'nomana') return sound.cooldown();
  if (r.spell === 'water') sound.water();
  else if (r.spell === 'fire') sound.fire();
  else if (r.spell === 'nature') sound.nature();
  else if (r.spell === 'lightning') sound.lightning();
  else if (r.spell === 'wind') sound.wind();
  else if (r.spell === 'shield') sound.shield();
  if (r.kind === 'miss') return sound.miss();
  if (r.hits.some((h) => h.effect === 'strong')) sound.superEffective();
  else if (r.hits.some((h) => h.effect === 'weak')) sound.resisted();
  if (r.kind === 'kill') sound.kill();
  else if (r.kind === 'hit') sound.hit();
}

/** Sounds for game events (from takeEvents). */
export function playEvents(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'castleHit') sound.castleHit();
    else if (e.type === 'chargeStart') sound.warlockCharge();
    else if (e.type === 'bossArrive') sound.bossArrive();
    else if (e.type === 'bossWarning') sound.bossWarning();
    else if (e.type === 'waveStart') sound.waveStart();
    else if (e.type === 'gameOver') e.result === 'WIN' ? sound.win() : sound.lose();
  }
}
