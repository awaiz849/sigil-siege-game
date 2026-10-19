// Entry point (index.html). Runs BEFORE the game so problems always end in a friendly message,
// never a blank or frozen screen:
//   1. a global error handler ("Something went wrong — Reload", details in the console),
//   2. no WebGL -> explain and stop (the game cannot draw anything without it),
//   3. phone / tablet -> "built for a laptop with a webcam" (Continue anyway is allowed),
//   4. not Chrome / Edge -> a small dismissable banner (does not block),
// then it loads the game (main.ts).
import { hasWebGL, isMobileDevice, isRecommendedBrowser, simulate } from './ui/compat.ts';
import { hideNotice, isNoticeOpen, reloadAction, showNotice } from './ui/notice.ts';

// ---- 1. Global error handler
function crashed(err: unknown): void {
  console.error('[Sigil Siege] Unexpected error:', err);
  if (isNoticeOpen('crash')) return;
  document.getElementById('loading')?.remove(); // never leave the loading screen hanging
  showNotice({
    id: 'crash',
    title: 'Something went wrong',
    body: 'Sorry, the game hit an unexpected error.',
    hint: 'Reload to play again. (Details are in the browser console.)',
    actions: [reloadAction()],
  });
}
window.addEventListener('error', (e) => {
  // Harmless browser noise, not a crash.
  if (typeof e.message === 'string' && e.message.includes('ResizeObserver loop')) return;
  crashed(e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => crashed(e.reason));

// ---- 2-4. Device and browser checks, then the game
function startGame(): void {
  import('./main.ts').catch(crashed);
}

if (!hasWebGL()) {
  document.getElementById('loading')?.remove();
  showNotice({
    id: 'webgl',
    title: 'No 3D graphics',
    body: "Your browser/GPU doesn't support 3D graphics (WebGL). Try Chrome or Edge.",
    hint: 'If you already use Chrome or Edge, turn on "Use graphics acceleration when available" in the browser settings and update your graphics driver.',
    actions: [reloadAction('Try again')],
  });
} else {
  if (!isRecommendedBrowser()) {
    showNotice({
      id: 'browser',
      kind: 'banner',
      body: 'Best in Chrome or Edge on a laptop. Hand tracking may be slower or less reliable in this browser.',
    });
  }
  if (isMobileDevice()) {
    showNotice({
      id: 'mobile',
      title: 'Built for a laptop',
      body: 'Sigil Siege is built for a laptop with a webcam: you cast spells by drawing in the air in front of the camera.',
      hint: 'Open this page on a laptop or desktop in Chrome or Edge for the best experience.',
      actions: [{ label: 'Continue anyway', onClick: () => { hideNotice('mobile'); startGame(); } }],
    });
  } else {
    startGame();
  }
}

if (simulate) console.info(`[dev] simulating: ${simulate}`);
