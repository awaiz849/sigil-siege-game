// Real input: webcam + MediaPipe HandLandmarker -> fingertip cursor + pose -> contract events.
// Everything is served from public/mediapipe, so it works offline.
//
// Poses mode (default):
//   point (index only)  -> pen down, draw with the index fingertip
//   two (index+middle)  -> pen up: stroke ends and is sent for recognition
//   other (fist etc.)   -> also ends the stroke (forgiving: a drifting hand still casts)
//   palm (four fingers) -> shield; cancels a stroke in progress
// Pinch mode (fallback): pinch thumb + index = pen down, release = pen up. Palm still = shield.
// Both modes: a fast flick of the hand while the pen is up = THROW (meteor ultimate),
// and so is pushing BOTH open palms toward the camera (CONFIG.PALMS_PUSH; tracks 2 hands).
// With two hands in view, the one that was already being tracked keeps drawing.
import { HandLandmarker } from '@mediapipe/tasks-vision';
import { CONFIG } from '../config.ts';
import { emitCursor, emitPalm, emitStrokeEnd, emitStrokePoint, emitStrokeStart, emitThrow, type Point, type Pose } from '../events.ts';
import { OneEuroFilter } from './oneEuro.ts';
import { classifyPose, pinchRatio, PoseStabilizer, type Landmark } from './poses.ts';
import { isStrokeLongEnough } from './strokeFilter.ts';
import type { HandAssets } from './handAssets.ts';
import { isSecure, simulate } from '../ui/compat.ts';
import { ThrowDetector } from './throwDetector.ts';
import { PalmsPush } from './palmsPush.ts';

export type HandInput = Awaited<ReturnType<typeof createHandInput>>;

/** Starts the camera and uses the hand tracker prepared during the loading screen (prepareTracker).
 *  Throws if there is no camera (caller falls back to mouse). */
export async function createHandInput(tracker: Promise<HandLandmarker>) {
  const video = await startCamera();
  let landmarker: HandLandmarker;
  try {
    landmarker = await tracker;
  } catch (err) {
    // The camera works but MediaPipe failed to load: free the camera and say so (main.ts offers Retry).
    for (const t of (video.srcObject as MediaStream).getTracks()) t.stop();
    throw new TrackerLoadError(err);
  }

  let enabled = true;
  let lastVideoTime = -1;

  // Pose stability: a pose must repeat for N frames before it counts.
  const stabilizer = new PoseStabilizer(CONFIG.POSE_STABLE_FRAMES);
  let stablePose: Pose = 'other';

  // Pinch state (fallback mode).
  let pinched = false;
  let releaseSince: number | null = null;

  // Stroke state.
  let drawing = false;
  let points: Point[] = [];

  let lastCursor: Point = { x: 0, y: 0 };

  // Fast flick = throw (meteor). Only while the pen is up, so drawing never fires it.
  const throwDetector = new ThrowDetector();
  // Both open palms pushed forward = meteor too.
  const palmsPush = new PalmsPush();
  let primaryWrist: Landmark | null = null;

  // Smoothed cursor in screen pixels.
  const fx = new OneEuroFilter(CONFIG.ONE_EURO_MIN_CUTOFF, CONFIG.ONE_EURO_BETA);
  const fy = new OneEuroFilter(CONFIG.ONE_EURO_MIN_CUTOFF, CONFIG.ONE_EURO_BETA);

  // Exposed for the debug overlay / camera preview.
  const debug = {
    handVisible: false,
    rawPose: 'other' as Pose,
    stablePose: 'other' as Pose,
    pinch: 0,
    landmarks: [] as Landmark[], // normalized camera coords (NOT mirrored)
    detectMs: 0,
    trackingFps: 0,
  };
  let lastDetectAt = 0;

  function startStroke() {
    drawing = true;
    points = [];
    emitStrokeStart();
  }

  function endStroke(send: boolean) {
    if (!drawing) return;
    drawing = false;
    if (send && isStrokeLongEnough(points)) emitStrokeEnd(points);
    points = [];
  }

  function addPoint(x: number, y: number) {
    const last = points[points.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < CONFIG.HAND_MIN_STEP_PX) return;
    points.push({ x, y });
    emitStrokePoint(x, y);
  }

  /** Camera coords (0..1) -> overlay pixels: mirror x, and stretch the inner area to the full screen. */
  function toScreen(lm: Landmark): Point {
    const m = CONFIG.HAND_EDGE_MARGIN;
    const nx = clamp01(((1 - lm.x) - m) / (1 - 2 * m));
    const ny = clamp01((lm.y - m) / (1 - 2 * m));
    return { x: nx * window.innerWidth, y: ny * window.innerHeight };
  }

  function handLost() {
    // Tell listeners the hand is gone (pose 'other'), so e.g. a palm hold stops counting.
    if (debug.handVisible) emitCursor(lastCursor.x, lastCursor.y, 'other');
    debug.handVisible = false;
    debug.landmarks = [];
    endStroke(false); // hand left the camera: drop the stroke
    stabilizer.reset();
    throwDetector.reset();
    stablePose = 'other';
    pinched = false;
    releaseSince = null;
    fx.reset();
    fy.reset();
  }

  // Detection is driven by the CAMERA's frames, not the render loop: requestVideoFrameCallback fires once
  // per new video frame (~30 fps), so the 60 fps render frames don't carry the detection work.
  // Browsers without it fall back to checking for a new frame from update() (once per render frame).
  const useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
  if (useVideoFrames) {
    const onVideoFrame = () => {
      processFrame();
      video.requestVideoFrameCallback(onVideoFrame);
    };
    video.requestVideoFrameCallback(onVideoFrame);
  }

  /** Call once per animation frame (only does work when requestVideoFrameCallback is missing). */
  function update() {
    if (!useVideoFrames) processFrame();
  }

  /** Detect hands in the newest camera frame (at most once per frame) and emit the contract events. */
  function processFrame() {
    // Hidden tab: no detection at all (the game is paused too); resumes on the next frame.
    if (!enabled || document.hidden || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);
    debug.detectMs = performance.now() - now;
    // Tracking FPS = how often we get a new camera frame to analyse (smoothed).
    if (lastDetectAt > 0) debug.trackingFps += (1000 / (now - lastDetectAt) - debug.trackingFps) * 0.1;
    lastDetectAt = now;

    // Two hands: the one nearest where the drawing hand was keeps the cursor.
    const hands = result.landmarks;
    let lm = hands[0];
    if (hands.length > 1 && primaryWrist) {
      const d = (h: Landmark[]) => Math.hypot(h[0].x - primaryWrist!.x, h[0].y - primaryWrist!.y);
      lm = d(hands[1]) < d(hands[0]) ? hands[1] : hands[0];
    }
    if (!lm) {
      handLost();
      primaryWrist = null;
      palmsPush.reset();
      return;
    }
    primaryWrist = lm[0];
    // Both palms pushed forward: the meteor, aimed between the hands (no shield, no stroke).
    const both = CONFIG.PALMS_PUSH.enabled ? palmsPush.push(now, hands) : null;
    if (both) {
      const aim = toScreen(both);
      emitThrow(aim.x, aim.y);
    }
    const twoPalms = hands.length > 1 && hands.every((h) => classifyPose(h) === 'palm');
    debug.handVisible = true;
    debug.landmarks = lm;

    // 1. Pose with stability filter.
    const raw = classifyPose(lm);
    debug.rawPose = raw;
    const previous = stablePose;
    stablePose = stabilizer.push(raw);
    debug.stablePose = stablePose;

    // Palm = shield, once per opening of the hand (both modes).
    if (stablePose === 'palm' && previous !== 'palm') {
      endStroke(false);
      if (!twoPalms) emitPalm(); // both palms up is the meteor, not the shield
    }

    // 2. Cursor: index tip (poses) or between thumb and index (pinch). Smoothed.
    const tip = CONFIG.INPUT_MODE === 'pinch' ? midpoint(lm[4], lm[8]) : lm[8];
    const p = toScreen(tip);
    const t = now / 1000;
    const x = fx.filter(p.x, t);
    const y = fy.filter(p.y, t);

    // 3. Pen down / pen up.
    if (CONFIG.INPUT_MODE === 'pinch') updatePinch(lm, now);
    else updatePoses();

    if (drawing) addPoint(x, y);
    lastCursor = { x, y };

    // 4. Throw gesture (meteor), pen up only.
    if (drawing) throwDetector.reset();
    else {
      const aim = throwDetector.push(now, lm, lastCursor);
      if (aim) emitThrow(aim.x, aim.y);
    }
    emitCursor(x, y, drawing ? 'point' : stablePose === 'point' ? 'other' : stablePose);
  }

  function updatePoses() {
    if (stablePose === 'point' && !drawing) startStroke();
    else if (stablePose !== 'point' && drawing) endStroke(stablePose !== 'palm');
  }

  function updatePinch(lm: Landmark[], now: number) {
    const ratio = pinchRatio(lm);
    debug.pinch = ratio;
    if (stablePose === 'palm') return;
    // Two thresholds (hysteresis) + a short release delay so a flicker doesn't end the stroke.
    if (!pinched && ratio < CONFIG.PINCH_ON) {
      pinched = true;
      releaseSince = null;
      startStroke();
    } else if (pinched) {
      if (ratio > CONFIG.PINCH_OFF) {
        releaseSince ??= now;
        if (now - releaseSince >= CONFIG.PINCH_RELEASE_MS) {
          pinched = false;
          endStroke(true);
        }
      } else {
        releaseSince = null;
      }
    }
  }

  return {
    video,
    debug,
    update,
    setEnabled(on: boolean) {
      if (!on) handLost();
      enabled = on;
    },
  };
}

/** MediaPipe (wasm or hand model) failed to download or start; the camera itself was fine. */
export class TrackerLoadError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super('Hand tracking failed to load');
    this.name = 'TrackerLoadError';
    this.cause = cause;
  }
}

async function startCamera(): Promise<HTMLVideoElement> {
  // Dev-only: pretend the camera failed in a specific way (see ui/compat.ts).
  if (simulate === 'camera-denied') throw new DOMException('Permission denied', 'NotAllowedError');
  if (simulate === 'no-camera') throw new DOMException('Requested device not found', 'NotFoundError');
  if (simulate === 'camera-busy') throw new DOMException('Could not start video source', 'NotReadableError');
  // Over plain http the browser hides navigator.mediaDevices entirely.
  if (!isSecure() || !navigator.mediaDevices?.getUserMedia) throw new DOMException('Camera needs a secure context', 'SecurityError');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: CONFIG.CAMERA_WIDTH, height: CONFIG.CAMERA_HEIGHT, facingMode: 'user' },
    audio: false,
  });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return video;
}

/** GPU delegate first, CPU if the GPU path fails. */
/** Build the tracker from the downloaded files and run one detection on a blank frame. The first
 *  detection compiles MediaPipe's GPU shaders (measured: ~5 s), so doing it during the loading screen
 *  avoids a freeze the moment the camera starts. Needs no camera. */
export async function prepareTracker(assets: HandAssets): Promise<HandLandmarker> {
  const landmarker = await createLandmarker(assets);
  const blank = document.createElement('canvas');
  blank.width = CONFIG.CAMERA_WIDTH;
  blank.height = CONFIG.CAMERA_HEIGHT;
  blank.getContext('2d')?.fillRect(0, 0, blank.width, blank.height);
  const t0 = performance.now();
  landmarker.detectForVideo(blank, t0);
  console.info(`Hand tracker warmed up in ${Math.round(performance.now() - t0)} ms`);
  return landmarker;
}

export async function createLandmarker(assets: HandAssets): Promise<HandLandmarker> {
  // The one wasm build we ship (already downloaded by handAssets.ts, so no second download).
  // (FilesetResolver.forVisionTasks would also look for the nosimd build, which we deleted.)
  const fileset = { wasmLoaderPath: assets.wasmLoaderPath, wasmBinaryPath: assets.wasmBinaryPath };
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetBuffer: assets.model, delegate },
    runningMode: 'VIDEO' as const,
    numHands: CONFIG.PALMS_PUSH.enabled ? 2 : 1,
    minHandDetectionConfidence: CONFIG.HAND_DETECTION_CONFIDENCE,
    minTrackingConfidence: CONFIG.HAND_TRACKING_CONFIDENCE,
  });
  try {
    return await HandLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (err) {
    console.warn('GPU hand tracking failed, using CPU', err);
    return await HandLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

function midpoint(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
