import type { Emitter, Localization } from './types';

/**
 * Linear drift in the +x direction at rate rateNmPerFrame. Y-drift is half of x-drift.
 * (Arbitrary but deterministic choice for pedagogical clarity.)
 */
export function computeDriftAtFrame(
  frameIndex: number,
  rateNmPerFrame: number
): { x: number; y: number } {
  return {
    x: frameIndex * rateNmPerFrame,
    y: frameIndex * rateNmPerFrame * 0.5,
  };
}

export function applyDriftToEmitter(e: Emitter, drift: { x: number; y: number }): Emitter {
  return { x: e.x + drift.x, y: e.y + drift.y };
}

/**
 * Correct linear drift by fitting a weighted line through the
 * (frameIndex → x) and (frameIndex → y) localization clouds, then
 * subtracting the fitted linear trend from every localization.
 *
 * Why not per-bin centroids? The localizer is intentionally permissive
 * and includes low-photon detections whose σ_loc can exceed the line
 * separation. These outliers pull the raw bin centroid around by tens
 * of nm even with ~400 locs/bin, so a bin-centroid subtraction actively
 * *adds* structured noise to the reconstruction when the true drift is
 * zero (we measured ±90 nm of spurious shifts on the default two-lines
 * preset). A linear fit, weighted by 1/σ², averages that noise out over
 * the full acquisition — the slope is statistically consistent with
 * zero in the no-drift case, so no shift is applied, and it recovers
 * the true rate when drift is real.
 *
 * `binSize` is accepted for backward compatibility but no longer used.
 */
export function correctLocalizationDrift(
  locs: Localization[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  binSize: number = 500
): Localization[] {
  if (locs.length < 2) return locs;

  // Weighted sums for least-squares regression of position vs frame index.
  // Weight each loc by 1/σ² so high-precision locs dominate.
  let sumW = 0;
  let sumWt = 0;
  let sumWt2 = 0;
  let sumWx = 0;
  let sumWtx = 0;
  let sumWy = 0;
  let sumWty = 0;
  for (const l of locs) {
    const s = l.sigmaLocNm;
    if (!isFinite(s) || s <= 0) continue;
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
  if (sumW === 0) return locs;
  const meanT = sumWt / sumW;
  const varT = sumWt2 / sumW - meanT * meanT;
  if (varT <= 0) return locs;
  const meanX = sumWx / sumW;
  const meanY = sumWy / sumW;
  // Slopes: b = Σ w·(t−t̄)(z−z̄) / Σ w·(t−t̄)²  — equivalent form using
  // the moments above.
  const bx = (sumWtx / sumW - meanT * meanX) / varT;
  const by = (sumWty / sumW - meanT * meanY) / varT;

  // Subtract the linear drift relative to frame 0 (so bin 0 is the anchor,
  // matching the original API contract).
  return locs.map((l) => ({
    ...l,
    x: l.x - bx * l.frameIndex,
    y: l.y - by * l.frameIndex,
  }));
}
