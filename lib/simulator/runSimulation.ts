import type {
  GroundTruth,
  SimulationParams,
  SimulationResult,
  Localization,
  Emitter,
} from './types';
import { initEmitterStates, stepPhotoswitching, ratesFromDutyCycle } from './photoswitching';
import { renderFrame } from './renderFrame';
import { localizeFrame } from './localization';
import { computeDriftAtFrame, applyDriftToEmitter, correctLocalizationDrift } from './drift';
import { reconstructImage } from './reconstruction';
import { thompsonSigmaLoc } from './thompson';
import { computeEmpiricalPrecision, computeDetectionEfficiency } from './analysis';

function computeMedianSigmaLoc(locs: Localization[]): number {
  if (locs.length === 0) return 0;
  const sorted = locs.map((l) => l.sigmaLocNm).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export type LiveFrameUpdate = {
  // Snapshot of the camera frame just rendered. Owned by the caller after
  // this callback returns — runSimulation will not mutate it.
  framePixels: Float32Array;
  // Cumulative sum of every frame rendered so far (W × H photons). A *copy*
  // of the running accumulator, also safe for the caller to retain.
  cumulativePixels: Float32Array;
  width: number;
  height: number;
  frameIndex: number; // 0-based; equals nFrames-1 on the final update
  totalFrames: number;
  nLocalizationsSoFar: number;
};

export type RunOptions = {
  onProgress?: (fraction: number) => void;
  // Called periodically (every ~50 frames + once at the end) so the UI
  // can render the live camera view without blocking the simulation loop.
  onFrame?: (update: LiveFrameUpdate) => void;
  signal?: AbortSignal;
};

// How often to surface live frames to the UI. Matches the existing event-loop
// yield cadence so we don't add extra animation-frame work.
const LIVE_UPDATE_STRIDE = 50;

export async function runSimulation(
  groundTruth: GroundTruth,
  params: SimulationParams,
  options: RunOptions = {}
): Promise<SimulationResult> {
  const { onProgress, onFrame, signal } = options;
  const states = initEmitterStates(groundTruth.emitters.length);
  const { kOn, kOff } = ratesFromDutyCycle(params.dutyCycle, 0.4);
  const pBleach = 0;

  const allLocs: Localization[] = [];
  // Track total ON-emitter-frame events so we can report detection
  // efficiency (localizations / true blink-frame events).
  let totalOnFrameEvents = 0;

  const W = params.fieldSizePx.width;
  const H = params.fieldSizePx.height;
  // Running sum of every rendered frame — the "what a long-exposure camera
  // would have seen" projection. A single allocation, accumulated in place.
  const cumulative = new Float32Array(W * H);

  // Warm up so the duty cycle is near steady state from frame 0
  for (let i = 0; i < 20; i++) stepPhotoswitching(states, kOn, kOff, pBleach);

  // Hold a reference to the most-recently-rendered frame so we can flush a
  // final live update after the loop without re-rendering.
  let lastFramePixels: Float32Array | null = null;

  for (let f = 0; f < params.nFrames; f++) {
    if (signal?.aborted) break;

    stepPhotoswitching(states, kOn, kOff, pBleach);
    const drift = computeDriftAtFrame(f, params.driftRateNmPerFrame);
    const active: Emitter[] = [];
    for (let i = 0; i < states.length; i++) {
      if (states[i].isOn) {
        active.push(applyDriftToEmitter(groundTruth.emitters[i], drift));
      }
    }
    totalOnFrameEvents += active.length;
    const frame = renderFrame(active, params, f);
    lastFramePixels = frame.pixels;
    // Accumulate into the cumulative projection.
    for (let i = 0; i < cumulative.length; i++) cumulative[i] += frame.pixels[i];

    const locs = localizeFrame(frame, params);
    for (const l of locs) allLocs.push(l);

    if (f % LIVE_UPDATE_STRIDE === 0) {
      onProgress?.(f / params.nFrames);
      // Pass copies of the buffers we keep mutating so the UI can hold on
      // to them without seeing torn updates.
      onFrame?.({
        framePixels: frame.pixels, // fresh allocation per frame, safe to share
        cumulativePixels: cumulative.slice(),
        width: W,
        height: H,
        frameIndex: f,
        totalFrames: params.nFrames,
        nLocalizationsSoFar: allLocs.length,
      });
      // Yield to event loop so React can repaint
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Final live-update flush — the loop's last 50-frame window may not have
  // landed on the stride boundary, so push one more snapshot so the UI ends
  // showing the very last frame and the complete cumulative image.
  if (lastFramePixels !== null) {
    onFrame?.({
      framePixels: lastFramePixels,
      cumulativePixels: cumulative.slice(),
      width: W,
      height: H,
      frameIndex: params.nFrames - 1,
      totalFrames: params.nFrames,
      nLocalizationsSoFar: allLocs.length,
    });
  }

  const finalLocs = params.correctDrift ? correctLocalizationDrift(allLocs, 100) : allLocs;

  const recon = reconstructImage(finalLocs, {
    fieldSizeNm: groundTruth.fieldSizeNm,
    outputPixelSizeNm: 10,
  });

  // Use median, not mean, for measured σ_loc. The localizer is intentionally
  // permissive — it accepts low-photon candidates so the detection rate stays
  // high for dim real emitters. That creates a long-tailed distribution of
  // per-loc σ values (σ ∝ 1/√N, so a spurious 30-photon detection contributes
  // σ ≈ 10× the true Thompson value). The arithmetic mean is pathologically
  // sensitive to that tail; the median is robust and matches the Thompson
  // prediction essentially exactly. This is the same reason ThunderSTORM and
  // other SMLM packages report robust summary statistics for localization
  // uncertainty.
  const measuredSigmaLoc = computeMedianSigmaLoc(finalLocs);

  const predictedSigmaLoc = thompsonSigmaLoc(
    params.psfSigmaNm,
    params.photonsPerCycle,
    params.pixelSizeNm,
    params.backgroundPerPixel
  );

  const empirical = computeEmpiricalPrecision(finalLocs, groundTruth);
  const detectionEfficiency = computeDetectionEfficiency(
    finalLocs.length,
    totalOnFrameEvents
  );

  onProgress?.(1);

  return {
    groundTruth,
    localizations: finalLocs,
    reconstruction: recon.pixels,
    reconstructionSize: { width: recon.width, height: recon.height },
    summedFramesPixels: cumulative,
    summedFramesSize: { width: W, height: H },
    measuredSigmaLocNm: measuredSigmaLoc,
    predictedSigmaLocNm: predictedSigmaLoc,
    empiricalPrecisionNm: empirical.medianNm,
    empiricalPrecisionP90Nm: empirical.p90Nm,
    detectionEfficiency,
  };
}
