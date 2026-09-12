import { median } from '@/lib/utils';
import { matchFrameLocalizations, summarizeMatches, type MatchTotals } from './analysis';
import { applyDriftToEmitter, computeDriftAtFrame, correctLocalizationDrift } from './drift';
import { localizeFrame } from './localization';
import { initEmitterStates, kOnFromDutyCycle, stepPhotoswitching } from './photoswitching';
import { gaussianPsfPixelIntegrated } from './psf';
import { renderFrame } from './renderFrame';
import type { Emitter, GroundTruth, Localization, SimulationParams, SimulationPreviewMetadata, SimulationResult } from './types';

/** ON→OFF probability per frame; sets the mean ON-event length to 2.5 frames. */
const K_OFF_PER_FRAME = 0.4;
/** Steps before frame 0 so the ON fraction has relaxed to its steady state. */
const WARMUP_FRAMES = 20;
/** Frames between yields to the event loop and live UI updates. */
const LIVE_UPDATE_STRIDE = 50;
/** Covers the UI maximum of 10,000 64×64 frames without retaining a float image stack. */
const MAX_PREVIEW_FRAMES = 10_000;
const MAX_CAMERA_PIXELS = 64 * 64;
const MAX_PREVIEW_BYTES = MAX_PREVIEW_FRAMES * MAX_CAMERA_PIXELS;

export type LiveUpdate = {
  /** Every localization so far — a fresh copy each update. */
  localizations: Localization[];
  framesCompleted: number;
  /** Latest acquired camera frame and current raw all-frame mean; null before frame 0. */
  cameraFrame: Uint8Array | null;
  widefield: Uint8Array | null;
  preview: SimulationPreviewMetadata;
  /** Only the newly reported frames, at most LIVE_UPDATE_STRIDE entries per array. */
  newFrameStats: { startFrame: number; activePerFrame: number[]; countsPerFrame: number[] };
};

type RunOptions = {
  onUpdate?: (u: LiveUpdate) => void;
  signal?: AbortSignal;
  /** Supply a seeded generator for repeatable acquisitions of the same specimen. */
  rng?: () => number;
};

function previewByte(photons: number, ceiling: number): number {
  return ceiling > 0 ? Math.round(Math.max(0, Math.min(1, photons / ceiling)) * 255) : 0;
}

/** Quantize the mean of raw counts, never the mean of already clipped camera previews. */
function meanPreview(summedPixels: Float64Array, framesCompleted: number) {
  let ceilingPhotons = 0;
  if (framesCompleted > 0) {
    for (const sum of summedPixels) ceilingPhotons = Math.max(ceilingPhotons, sum / framesCompleted);
  }
  const pixels = new Uint8Array(summedPixels.length);
  if (ceilingPhotons > 0) {
    for (let i = 0; i < pixels.length; i++) pixels[i] = previewByte(summedPixels[i] / framesCompleted, ceilingPhotons);
  }
  return { pixels, ceilingPhotons };
}

export async function runSimulation(
  groundTruth: GroundTruth,
  params: SimulationParams,
  { onUpdate, signal, rng = Math.random }: RunOptions = {}
): Promise<SimulationResult> {
  const { width, height } = params.fieldSizePx;
  const pixelsPerFrame = width * height;
  const previewBytes = pixelsPerFrame * params.nFrames;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 ||
      !Number.isSafeInteger(params.nFrames) || params.nFrames < 0 || params.nFrames > MAX_PREVIEW_FRAMES ||
      !Number.isSafeInteger(pixelsPerFrame) || pixelsPerFrame > MAX_CAMERA_PIXELS ||
      !Number.isSafeInteger(previewBytes) || previewBytes > MAX_PREVIEW_BYTES) {
    throw new RangeError('Camera previews require positive integer dimensions, at most 4,096 pixels per frame, and 0–10,000 integer frames (40.96 MB display budget)');
  }
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
  for (let i = 0; i < WARMUP_FRAMES; i++) stepPhotoswitching(states, kOn, K_OFF_PER_FRAME, rng);

  const rawLocalizations: Localization[] = [];
  const localizations: Localization[] = [];
  const cameraFrames = new Uint8Array(signal?.aborted ? 0 : previewBytes);
  const summedPixels = new Float64Array(pixelsPerFrame);
  const activePerFrame: number[] = [];
  const countsPerFrame: number[] = [];
  const halfPixel = params.pixelSizeNm / 2;
  const peakPixelMass = gaussianPsfPixelIntegrated(-halfPixel, halfPixel, -halfPixel, halfPixel, 0, 0, params.psfSigmaNm);
  const cameraCeilingPhotons = Math.max(1, params.backgroundPerPixel + 1.5 * params.photonsPerCycle * peakPixelMass);
  const previewBase = { width, height, toneMap: 'linear' as const, cameraCeilingPhotons };
  const matchRadiusNm = params.psfSigmaNm;
  const totals: MatchTotals = { matchedCount: 0, activeEmitterFrames: 0, falsePositiveCount: 0, squaredErrorSumNm2: 0 };
  let framesCompleted = 0;
  let lastReported = -1;

  const report = () => {
    if (framesCompleted === lastReported) return;
    const startFrame = Math.max(0, lastReported);
    lastReported = framesCompleted;
    if (!onUpdate) return;
    const mean = meanPreview(summedPixels, framesCompleted);
    onUpdate({
      localizations: localizations.slice(),
      framesCompleted,
      cameraFrame: framesCompleted > 0 ? cameraFrames.slice((framesCompleted - 1) * pixelsPerFrame, framesCompleted * pixelsPerFrame) : null,
      widefield: framesCompleted > 0 ? mean.pixels : null,
      preview: { ...previewBase, widefieldCeilingPhotons: mean.ceilingPhotons },
      newFrameStats: { startFrame, activePerFrame: activePerFrame.slice(startFrame), countsPerFrame: countsPerFrame.slice(startFrame) },
    });
  };

  for (let f = 0; f < params.nFrames; f++) {
    if (signal?.aborted) break;

    stepPhotoswitching(states, kOn, K_OFF_PER_FRAME, rng);
    const drift = computeDriftAtFrame(f, params.driftRateNmPerFrame);
    const active: Emitter[] = [];
    for (let i = 0; i < states.length; i++) {
      if (states[i].isOn) active.push(applyDriftToEmitter(groundTruth.emitters[i], drift));
    }
    const frame = renderFrame(active, params, f, rng);
    const detected = localizeFrame(frame, params);
    const offset = f * pixelsPerFrame;
    for (let i = 0; i < pixelsPerFrame; i++) {
      summedPixels[i] += frame.pixels[i];
      cameraFrames[offset + i] = previewByte(frame.pixels[i], cameraCeilingPhotons);
    }
    activePerFrame.push(active.length);
    countsPerFrame.push(detected.length);
    const matched = matchFrameLocalizations(detected, active, f, groundTruth.fieldSizeNm, matchRadiusNm);
    totals.matchedCount += matched.matchedCount;
    totals.activeEmitterFrames += matched.activeEmitterFrames;
    totals.falsePositiveCount += matched.falsePositiveCount;
    totals.squaredErrorSumNm2 += matched.squaredErrorSumNm2;
    for (const l of detected) rawLocalizations.push(l);
    const display = params.correctDrift ? correctLocalizationDrift(detected, params.driftRateNmPerFrame) : detected;
    for (const l of display) localizations.push(l);
    framesCompleted = f + 1;

    if (framesCompleted % LIVE_UPDATE_STRIDE === 0) {
      report();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  report();
  const mean = meanPreview(summedPixels, framesCompleted);

  return {
    params,
    groundTruth,
    framesCompleted,
    // Release unacquired storage after cancellation; live updates never copy the full stack.
    cameraFrames: framesCompleted === params.nFrames ? cameraFrames : cameraFrames.slice(0, framesCompleted * pixelsPerFrame),
    widefield: mean.pixels,
    preview: { ...previewBase, widefieldCeilingPhotons: mean.ceilingPhotons },
    activePerFrame,
    countsPerFrame,
    localizations,
    rawLocalizations,
    apparentSigmaLocNm: rawLocalizations.length ? median(rawLocalizations.map((l) => l.sigmaLocNm)) : null,
    metrics: summarizeMatches(totals, matchRadiusNm),
  };
}
