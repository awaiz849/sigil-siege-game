// Voice callouts: the wizard shouts the spell name ("Water!", "Storm!") with the browser's built-in
// speech synthesis. Chrome's system voices (e.g. Microsoft David / Zira on Windows) work offline;
// we prefer a local English voice and never wait for a network one. Off if the browser has none.
import { CONFIG } from '../config.ts';

let voice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  // Local (offline) first; among those prefer a deeper male voice for the wizard if there is one.
  const local = english.filter((v) => v.localService);
  voice = local.find((v) => /david|daniel|george|male|guy/i.test(v.name)) ?? local[0] ?? null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

let lastAt = 0;

/** Say a short callout. A new callout cuts off the previous one, so fast casting stays snappy. */
export function callout(text: string) {
  const v = CONFIG.VOICE;
  if (!v.enabled || !voice || !('speechSynthesis' in window)) return;
  const now = performance.now();
  if (now - lastAt < v.minGapMs) return; // don't machine-gun words
  lastAt = now;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.volume = v.volume;
  u.rate = v.rate;
  u.pitch = v.pitch;
  speechSynthesis.speak(u);
}
