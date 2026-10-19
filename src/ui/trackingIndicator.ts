// Small corner indicator while hand tracking loads in the background (the title screen does not
// wait for it): "Hand tracking: loading... 72%" -> "Hand tracking: ready ✓" (then fades out).
// Plain HTML (styles in index.html). Receives the same progress calls as the loading screen.
import type { ProgressSink } from './loadingScreen.ts';

export function createTrackingIndicator() {
  const el = document.createElement('div');
  el.id = 'tracking-indicator';
  el.setAttribute('role', 'status');
  document.body.append(el);
  const parts = new Map<string, { loaded: number; total: number; done: boolean }>();
  let finished = false;

  function render() {
    if (finished) return;
    let loaded = 0;
    let total = 0;
    for (const p of parts.values()) {
      total += p.total;
      loaded += p.done ? p.total : Math.min(p.loaded, p.total);
    }
    el.textContent = `Hand tracking: loading... ${total ? Math.floor((loaded / total) * 100) : 0}%`;
  }

  function finish(text: string, cls: string, fadeAfterS: number) {
    finished = true;
    el.textContent = text;
    el.classList.add(cls);
    setTimeout(() => el.classList.add('fade'), fadeAfterS * 1000);
    setTimeout(() => el.remove(), fadeAfterS * 1000 + 800);
  }

  render();
  const sink: ProgressSink = {
    expect(key, _label, expectedBytes) {
      parts.set(key, { loaded: 0, total: expectedBytes, done: false });
      render();
    },
    progress(key, loaded, total) {
      const p = parts.get(key);
      if (!p) return;
      p.loaded = loaded;
      if (total && total > 0) p.total = total;
      render();
    },
    complete(key) {
      const p = parts.get(key);
      if (p) p.done = true;
      render();
    },
  };
  return {
    ...sink,
    ready: () => finish('Hand tracking: ready ✓', 'ready', 3),
    /** The friendly error notice explains what happened; this only says it is off. */
    failed: () => finish('Hand tracking: unavailable', 'failed', 6),
  };
}
