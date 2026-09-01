import { median } from '@/lib/utils';
import { computeDetectionEfficiency, computeEmpiricalPrecision } from './analysis';
import { applyDriftToEmitter, computeDriftAtFrame, correctLocalizationDrift } from './drift';
import { localizeFrame } from './localization';
import { initEmitterStates, kOnFromDutyCycle, stepPhotoswitching } from './photoswitching';
import { renderFrame } from './renderFrame';
import type { Emitter, GroundTruth, Localization, SimulationParams, SimulationResult } from './types';

/** ON→OFF probability per frame; sets the mean ON-event length to 2.5 frames. */
const K_OFF_PER_FRAME = 0.4;
/** Steps before frame 0 so the ON fraction has relaxed to its steady state. */
const WARMUP_FRAMES = 20;
/** Frames between yields to the event loop and live UI updates. */
const LIVE_UPDATE_STRIDE = 50;

export type LiveUpdate = {
  /** Every localization so far — a fresh copy each update. */
  localizations: Localization[];
  framesCompleted: number;
};

type RunOptions = {
  onUpdate?: (u: LiveUpdate) => void;
  signal?: AbortSignal;
};

export async function runSimulation(
  groundTruth: GroundTruth,
  params: SimulationParams,
  { onUpdate, signal }: RunOptions = {}
): Promise<SimulationResult> {
  const cameraW = params.fieldSizePx.width * params.pixelSizeNm;
  const cameraH = params.fieldSizePx.height * params.pixelSizeNm;
  if (groundTruth.fieldSizeNm.width !== cameraW || groundTruth.fieldSizeNm.height !== cameraH) {
    throw new Error(
      `Ground-truth field ${groundTruth.fieldSizeNm.width}×${groundTruth.fieldSizeNm.height} nm ` +
        `must equal the camera footprint ${cameraW}×${cameraH} nm`
    );
  }

  const states = initEmitterStates(groundTruth.emitters.length);
  const kOn = kOnFromDutyCycle(params.dutyCycle, K_OFF_PER_FRAME);
  for (let i = 0; i < WARMUP_FRAMES; i++) stepPhotoswitching(states, kOn, K_OFF_PER_FRAME);

  const localizations: Localization[] = [];
  let onEvents = 0;
  let framesCompleted = 0;
  let lastReported = -1;

  const report = () => {
    if (framesCompleted === lastReported) return;
    lastReported = framesCompleted;
    onUpdate?.({ localizations: localizations.slice(), framesCompleted });
  };

  for (let f = 0; f < params.nFrames; f++) {
    if (signal?.aborted) break;

    stepPhotoswitching(states, kOn, K_OFF_PER_FRAME);
    const drift = computeDriftAtFrame(f, params.driftRateNmPerFrame);
    const active: Emitter[] = [];
    for (let i = 0; i < states.length; i++) {
      if (states[i].isOn) active.push(applyDriftToEmitter(groundTruth.emitters[i], drift));
    }
    onEvents += active.length;

    const frame = renderFrame(active, params, f);
    for (const l of localizeFrame(frame, params)) localizations.push(l);
    framesCompleted = f + 1;

    if (framesCompleted % LIVE_UPDATE_STRIDE === 0) {
      report();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  report();

  const final = params.correctDrift ? correctLocalizationDrift(localizations) : localizations;
  const empirical = computeEmpiricalPrecision(final, groundTruth);

  return {
    params,
    groundTruth,
    framesCompleted,
    localizations: final,
    apparentSigmaLocNm: median(final.map((l) => l.sigmaLocNm)),
    empiricalPrecisionNm: empirical.medianNm,
    empiricalPrecisionP90Nm: empirical.p90Nm,
    detectionEfficiency: computeDetectionEfficiency(final.length, onEvents),
  };
}
