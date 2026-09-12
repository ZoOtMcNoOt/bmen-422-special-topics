import type { Emitter, Localization } from './types';

/** Simulated stage drift moves in +x with a smaller +y component. */
const Y_DRIFT_RATIO = 0.5;

export function computeDriftAtFrame(frameIndex: number, rateNmPerFrame: number) {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || !Number.isFinite(rateNmPerFrame)) {
    throw new RangeError('Drift requires a non-negative integer frame and a finite rate');
  }
  return { x: frameIndex * rateNmPerFrame, y: frameIndex * rateNmPerFrame * Y_DRIFT_RATIO };
}

export function applyDriftToEmitter(e: Emitter, drift: { x: number; y: number }): Emitter {
  return { x: e.x + drift.x, y: e.y + drift.y };
}

/** Subtract the KNOWN simulated drift. This is ideal correction, not an estimator. */
export function correctLocalizationDrift(
  localizations: readonly Localization[],
  rateNmPerFrame: number
): Localization[] {
  return localizations.map((l) => {
    const drift = computeDriftAtFrame(l.frameIndex, rateNmPerFrame);
    return { ...l, x: l.x - drift.x, y: l.y - drift.y };
  });
}
