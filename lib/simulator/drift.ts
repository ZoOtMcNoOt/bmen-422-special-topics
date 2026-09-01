import type { Emitter, Localization } from './types';

/** Simulated stage drift moves in +x with a smaller +y component. */
const Y_DRIFT_RATIO = 0.5;

export function computeDriftAtFrame(frameIndex: number, rateNmPerFrame: number) {
  return { x: frameIndex * rateNmPerFrame, y: frameIndex * rateNmPerFrame * Y_DRIFT_RATIO };
}

export function applyDriftToEmitter(e: Emitter, drift: { x: number; y: number }): Emitter {
  return { x: e.x + drift.x, y: e.y + drift.y };
}

/**
 * Remove linear drift: a 1/σ²-weighted least-squares fit of position against
 * frame index, with the fitted slope subtracted so frame 0 is the anchor.
 */
export function correctLocalizationDrift(localizations: Localization[]): Localization[] {
  if (localizations.length < 2) return localizations;

  let sumW = 0, sumWt = 0, sumWt2 = 0, sumWx = 0, sumWtx = 0, sumWy = 0, sumWty = 0;
  for (const l of localizations) {
    const s = l.sigmaLocNm;
    if (!Number.isFinite(s) || s <= 0) continue;
    const w = 1 / (s * s);
    const t = l.frameIndex;
    sumW += w;
    sumWt += w * t;
    sumWt2 += w * t * t;
    sumWx += w * l.x;
    sumWtx += w * t * l.x;
    sumWy += w * l.y;
    sumWty += w * t * l.y;
  }
  if (sumW === 0) return localizations;

  const meanT = sumWt / sumW;
  const varT = sumWt2 / sumW - meanT * meanT;
  if (varT <= 0) return localizations;

  const bx = (sumWtx / sumW - meanT * (sumWx / sumW)) / varT;
  const by = (sumWty / sumW - meanT * (sumWy / sumW)) / varT;

  return localizations.map((l) => ({ ...l, x: l.x - bx * l.frameIndex, y: l.y - by * l.frameIndex }));
}
