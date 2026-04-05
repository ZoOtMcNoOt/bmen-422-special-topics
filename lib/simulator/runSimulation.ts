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

function computeMedianSigmaLoc(locs: Localization[]): number {
  if (locs.length === 0) return 0;
  const sorted = locs.map((l) => l.sigmaLocNm).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export type RunOptions = {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export async function runSimulation(
  groundTruth: GroundTruth,
  params: SimulationParams,
  options: RunOptions = {}
): Promise<SimulationResult> {
  const { onProgress, signal } = options;
  const states = initEmitterStates(groundTruth.emitters.length);
  const { kOn, kOff } = ratesFromDutyCycle(params.dutyCycle, 0.4);
  const pBleach = 0;

  const allLocs: Localization[] = [];

  // Warm up so the duty cycle is near steady state from frame 0
  for (let i = 0; i < 20; i++) stepPhotoswitching(states, kOn, kOff, pBleach);

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
    const frame = renderFrame(active, params, f);
    const locs = localizeFrame(frame, params);
    for (const l of locs) allLocs.push(l);

    if (f % 50 === 0) {
      onProgress?.(f / params.nFrames);
      // Yield to event loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
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

  onProgress?.(1);

  return {
    groundTruth,
    localizations: finalLocs,
    reconstruction: recon.pixels,
    reconstructionSize: { width: recon.width, height: recon.height },
    measuredSigmaLocNm: measuredSigmaLoc,
    predictedSigmaLocNm: predictedSigmaLoc,
  };
}
