// Loading screen: the markup lives in index.html (#loading), so it shows from the very first paint,
// before any JavaScript runs. This module drives its progress bar with REAL byte counts of the big
// downloads (MediaPipe wasm, hand model, 3D models) and hides it once everything has finished or failed.
import { CONFIG } from '../config.ts';

type Part = { label: string; loaded: number; total: number; done: boolean };

export type LoadingScreen = ReturnType<typeof createLoadingScreen>;

/** Anything that shows download progress (the loading screen, the hand-tracking corner indicator). */
export interface ProgressSink {
  expect(key: string, label: string, expectedBytes: number): void;
  progress(key: string, loaded: number, total?: number): void;
  complete(key: string): void;
}

export function createLoadingScreen() {
  const root = document.getElementById('loading');
  const fill = document.getElementById('loading-fill');
  const text = document.getElementById('loading-text');
  const parts = new Map<string, Part>();
  let hidden = false;

  function render() {
    if (hidden || !fill || !text) return;
    let loaded = 0;
    let total = 0;
    for (const p of parts.values()) {
      total += p.total;
      loaded += p.done ? p.total : Math.min(p.loaded, p.total);
    }
    const fraction = total > 0 ? loaded / total : 0;
    fill.style.width = `${(fraction * 100).toFixed(1)}%`;
    const busy = [...parts.values()].find((p) => !p.done);
    text.textContent = busy
      ? `Loading ${busy.label}... ${Math.floor(fraction * 100)}%  (${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB)`
      : 'Ready!';
  }

  const screen = {
    /** Announce a download up front (expected size), so the bar never jumps backwards. */
    expect(key: string, label: string, expectedBytes: number) {
      parts.set(key, { label, loaded: 0, total: expectedBytes, done: false });
      render();
    },
    /** Bytes received so far. total = real size when the server sends it (else the expected size stays). */
    progress(key: string, loaded: number, total?: number) {
      const p = parts.get(key);
      if (!p) return;
      p.loaded = loaded;
      if (total && total > 0) p.total = total;
      render();
    },
    /** Finished (or failed: a missing file must not keep the screen up). */
    complete(key: string) {
      const p = parts.get(key);
      if (p) p.done = true;
      render();
    },
    /** Fade the screen out. */
    hide() {
      if (hidden) return;
      render();
      hidden = true;
      root?.classList.add('loading-done');
      setTimeout(() => root?.remove(), 600);
    },
  };

  // Never stuck: whatever happens, the game shows after LOADING.maxSeconds.
  setTimeout(() => {
    if (!hidden) console.warn('Loading screen timed out; starting anyway');
    screen.hide();
  }, CONFIG.LOADING.maxSeconds * 1000);
  return screen;
}

/** Download a file and report its progress as it streams in. */
export async function fetchWithProgress(url: string, onProgress: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  // Content-Length is missing when the server compresses on the fly: then the expected size is used.
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    onProgress(all.length, all.length);
    return all;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const all = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return all;
}
