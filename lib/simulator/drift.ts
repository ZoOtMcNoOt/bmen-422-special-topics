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
 * Correct drift in localizations by binning and estimating per-bin mean offset.
 * Simple centroid-of-localizations approach — works when emitters are stationary
 * relative to each other.
 */
export function correctLocalizationDrift(
  locs: Localization[],
  binSize: number = 500
): Localization[] {
  if (locs.length === 0) return locs;
  const maxFrame = Math.max(...locs.map((l) => l.frameIndex));
  const nBins = Math.ceil((maxFrame + 1) / binSize);
  const binStats: { sumX: number; sumY: number; count: number }[] = [];
  for (let i = 0; i < nBins; i++) binStats.push({ sumX: 0, sumY: 0, count: 0 });

  for (const l of locs) {
    const bin = Math.floor(l.frameIndex / binSize);
    binStats[bin].sumX += l.x;
    binStats[bin].sumY += l.y;
    binStats[bin].count += 1;
  }

  // Reference bin: bin 0 (start of acquisition)
  const ref = binStats[0];
  if (ref.count === 0) return locs;
  const refX = ref.sumX / ref.count;
  const refY = ref.sumY / ref.count;

  const binOffsets = binStats.map((b) => {
    if (b.count === 0) return { dx: 0, dy: 0 };
    return {
      dx: b.sumX / b.count - refX,
      dy: b.sumY / b.count - refY,
    };
  });

  return locs.map((l) => {
    const bin = Math.floor(l.frameIndex / binSize);
    const off = binOffsets[bin];
    return { ...l, x: l.x - off.dx, y: l.y - off.dy };
  });
}
