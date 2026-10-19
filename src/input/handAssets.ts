// The two big MediaPipe downloads (wasm engine ~13 MB, hand model ~7.5 MB), started at page load
// with progress for the loading screen. The bytes are handed straight to MediaPipe (blob URL for the
// wasm, a buffer for the model), so nothing is downloaded twice. All files come from public/mediapipe
// (offline, no CDN).
import { CONFIG } from '../config.ts';
import { fetchWithProgress, type LoadingScreen } from '../ui/loadingScreen.ts';
import { simulate } from '../ui/compat.ts';

const BASE = `${import.meta.env.BASE_URL}mediapipe/`;

export interface HandAssets {
  /** The wasm loader script (small; MediaPipe loads it itself). */
  wasmLoaderPath: string;
  /** Object URL of the downloaded wasm binary. */
  wasmBinaryPath: string;
  /** The hand_landmarker.task model bytes. */
  model: Uint8Array;
}

let attempts = 0;

export function downloadHandAssets(loading: LoadingScreen): Promise<HandAssets> {
  attempts++;
  const { wasm, handModel } = CONFIG.LOADING.expectedBytes;
  loading.expect('wasm', 'hand tracking engine', wasm);
  loading.expect('handModel', 'hand model', handModel);
  const get = (key: string, url: string) => {
    // Dev-only: the first download "fails" so the error screen and its Retry can be tested.
    if (simulate === 'mediapipe-fail' && attempts === 1) {
      loading.complete(key);
      return Promise.reject(new Error(`simulated download failure: ${url}`));
    }
    return fetchWithProgress(url, (l, t) => loading.progress(key, l, t)).finally(() => loading.complete(key));
  };

  return Promise.all([
    get('wasm', `${BASE}wasm/vision_wasm_internal.wasm`),
    get('handModel', `${BASE}hand_landmarker.task`),
  ]).then(([wasmBytes, model]) => ({
    wasmLoaderPath: `${BASE}wasm/vision_wasm_internal.js`,
    wasmBinaryPath: URL.createObjectURL(new Blob([wasmBytes as BlobPart], { type: 'application/wasm' })),
    model,
  }));
}
