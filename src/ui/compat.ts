// Device / browser checks and camera-error explanations, used by boot.ts and main.ts.
//
// Dev-only failure simulation: add ?simulate=<case> to the URL under `npm run dev` to see each
// error screen without breaking anything for real (the production build ignores it):
//   camera-denied, no-camera, camera-busy, insecure, no-webgl, mediapipe-fail, firefox, mobile,
//   hand-lost, crash

export type Simulated =
  | 'camera-denied' | 'no-camera' | 'camera-busy' | 'insecure' | 'no-webgl'
  | 'mediapipe-fail' | 'firefox' | 'mobile' | 'hand-lost' | 'crash';

/** The simulated failure, or null (always null in production). */
export const simulate: Simulated | null = import.meta.env.DEV
  ? (new URLSearchParams(location.search).get('simulate') as Simulated | null)
  : null;

/** The camera only works on https:// or localhost. */
export function isSecure(): boolean {
  return simulate !== 'insecure' && window.isSecureContext;
}

/** Can this browser draw 3D (WebGL)? */
export function hasWebGL(): boolean {
  if (simulate === 'no-webgl') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Phone or tablet (touch-first device): the game needs a laptop with a webcam. */
export function isMobileDevice(): boolean {
  if (simulate === 'mobile') return true;
  const ua = navigator.userAgent;
  const uaMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS pretends to be a Mac
  return uaMobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || ipad;
}

/** Chrome / Edge (Chromium) run MediaPipe best; Safari and Firefox work less reliably. */
export function isRecommendedBrowser(): boolean {
  if (simulate === 'firefox') return false;
  const ua = navigator.userAgent;
  return /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
}

export type CameraProblem = 'denied' | 'missing' | 'busy' | 'insecure' | 'other';

/** Turn a getUserMedia error into one of the cases we explain to the player. */
export function cameraProblem(err: unknown): CameraProblem {
  if (!isSecure()) return 'insecure';
  const name = err instanceof Error || err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'missing';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'other';
}

/** What to tell the player for each camera problem. */
export const CAMERA_MESSAGES: Record<CameraProblem, { title: string; body: string; hint?: string }> = {
  denied: {
    title: 'Camera blocked',
    body: 'Camera access is needed to play. Click the camera icon in the address bar → Allow, then reload.',
  },
  missing: {
    title: 'No webcam found',
    body: 'No webcam detected. Connect a webcam and reload.',
  },
  busy: {
    title: 'Camera is busy',
    body: 'Your camera is being used by another app (Zoom, Meet, Teams...). Close it and reload.',
  },
  insecure: {
    title: 'Secure connection needed',
    body: 'Browsers only allow the camera on secure pages. Open this game over https:// (or on localhost), then allow the camera.',
    hint: `This page was opened over ${location.protocol.replace(':', '')}.`,
  },
  other: {
    title: 'Camera problem',
    body: 'The camera could not be started. Check that it is connected and not used by another app, then reload.',
  },
};
