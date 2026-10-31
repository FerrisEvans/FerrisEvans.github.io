/** The visitor experience is high-quality 3D or LO-FI. Measurements advise;
 * they never silently change the renderer's quality.
 * No DOM, renderer, timers or storage: callers supply observations in milliseconds. */
export type QualityTier = 'high' | 'lofi';
export type QualityReason = 'software-renderer' | 'texture-limit'
  | 'limited-capability' | 'capable-device' | 'unmasked-capability';

export type QualityCapabilities = {
  renderer?: string;
  maxTextureSize?: number;
  hardwareConcurrency?: number;
  reducedMotion?: boolean;
};

export type QualitySelection = Readonly<{
  mode: '3d' | 'lofi';
  tier: QualityTier;
  fps: 60;
  dprCap: number;
  renderOnDemand: boolean;
  reason: QualityReason;
}>;

const softwareRenderer = /swiftshader|llvmpipe|softpipe|software\s+(?:rasterizer|renderer)|gdi generic|microsoft basic render|\bwarp\b/i;
const capableRenderer = /nvidia|geforce|quadro|\b(?:rtx|gtx)\b|radeon\s+(?:rx|pro)\b|apple\s+(?:m\d|gpu)\b|intel.*\barc\b/i;
const positive = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

/** Preserve thin edges on DPR-1 displays and use native DPR 2 where available. */
export function renderPixelRatio(nativeDpr: number, cap = 2): number {
  return Math.min(Math.max(positive(nativeDpr) ?? 1, 1.5), cap);
}

function selection(reason: QualityReason, renderOnDemand: boolean, mode: '3d' | 'lofi' = '3d'): QualitySelection {
  return Object.freeze({ mode, tier: mode === '3d' ? 'high' : 'lofi', fps: 60, dprCap: 2, renderOnDemand, reason });
}

export function selectQuality(capabilities: QualityCapabilities): QualitySelection {
  const renderer = capabilities.renderer ?? '';
  const textureSize = positive(capabilities.maxTextureSize);
  const cores = positive(capabilities.hardwareConcurrency);
  const demand = capabilities.reducedMotion === true;
  if (textureSize !== undefined && textureSize < 4096) return selection('texture-limit', demand, 'lofi');
  if (softwareRenderer.test(renderer)) return selection('software-renderer', demand, 'lofi');
  if (cores !== undefined && cores <= 2) return selection('limited-capability', demand, 'lofi');
  // Privacy-masked renderer strings do not prove that a device is weak.
  return selection(capableRenderer.test(renderer) ? 'capable-device' : 'unmasked-capability', demand);
}

export type FrameObservation = {
  nowMs: number;
  /** Time between consecutive rendered frames, including deliberate FPS pacing.
   * Do not pass every rAF callback or synchronous renderer.render() CPU cost. */
  frameMs: number;
  /** False during hidden tabs, on-demand gaps or interrupted render loops. */
  continuous?: boolean;
  visible?: boolean;
  /** False during camera transitions, active drags, resize and initial reveal. */
  stable?: boolean;
};

export type PerformanceAdvice = { reason: 'sustained-slow-frames'; measuredFps: number };
/** Offer LO-FI once, after 20s of continuous stable rendering followed by
 * three slow 6s windows. Loading, isolated stalls, transitions, hidden tabs
 * and on-demand rendering never count as runtime evidence. Quality is fixed. */
export function createQualityMonitor(initial: QualitySelection) {
  const current = initial;
  let lastNow: number | undefined;
  let stableElapsed = 0;
  let notified = false;
  let elapsed = 0, frames = 0, slowWindows = 0;

  function clearWindow() { elapsed = frames = 0; }
  function reset() {
    lastNow = undefined;
    stableElapsed = 0;
    slowWindows = 0;
    clearWindow();
    // Do not repeat a dismissed recommendation after every navigation.
  }
  function observe(sample: FrameObservation): PerformanceAdvice | null {
    const { nowMs, frameMs } = sample;
    if (current.mode !== '3d' || notified) return null;
    if (!Number.isFinite(nowMs) || !Number.isFinite(frameMs) || frameMs <= 0 || nowMs < 0) { reset(); return null; }
    const interval = lastNow === undefined ? 0 : nowMs - lastNow;
    const interrupted = sample.visible === false || sample.continuous === false || sample.stable === false
      || (lastNow !== undefined && (interval <= 0 || interval > 1500));
    lastNow = nowMs;
    if (interrupted) {
      clearWindow(); slowWindows = 0; stableElapsed = 0;lastNow = undefined;
      return null;
    }
    // Advance only across observed, eligible intervals, never with wall time
    // spent loading, hidden, resizing or waiting for the first rendered frame.
    if (stableElapsed < 20000) { stableElapsed += interval; return null; }
    elapsed += frameMs; frames++;
    // At very low FPS, allow a longer window to gather enough real frames.
    if (elapsed < 6000 || frames < 12) return null;
    // Repeated stalls can consume most of the window while remaining a small
    // fraction of its frames. Count their effect on throughput as well.
    const measuredFps = frames * 1000 / elapsed;
    // A 45–60 FPS cadence or an occasional late frame is not enough to
    // interrupt exploration. A tiny tolerance avoids floating-point boundary
    // noise at exactly 45 FPS; recurring costly stalls still reduce throughput.
    const lowThroughput = measuredFps + .01 < current.fps * .75;
    slowWindows = lowThroughput ? slowWindows + 1 : 0;
    clearWindow();
    if (slowWindows < 3) return null;
    notified = true;
    return { reason: 'sustained-slow-frames', measuredFps };
  }
  return { get current() { return current; }, observe, reset };
}
