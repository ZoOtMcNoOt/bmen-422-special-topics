import type { GroundTruth, Localization } from './types';

/**
 * Ground-truth-referenced localization precision.
 *
 * For every reported localization, find the nearest true emitter and record
 * the Euclidean distance. Returns the median, mean, and p90 of that error
 * distribution.
 *
 * Because the simulator knows the true emitter positions, this is a *direct*
 * measurement of localization quality — no theoretical formula in the loop.
 * Unlike the Thompson σ_loc (which assumes an isolated molecule emitting the
 * observed photon count), this metric correctly penalises crowding artifacts:
 * when two neighbouring molecules' PSFs merge, the single-emitter fit lands
 * at their photometric centroid, so distances to *either* true emitter grow
 * with separation and show up in the error distribution.
 *
 * Complexity: O(N_locs × N_emitters). For the default preset (~10 k emitters,
 * ~10 k locs) this runs in ~100 ms. When the emitter pool grows we bucket
 * into a uniform grid so average lookup stays O(1).
 */
export function computeEmpiricalPrecision(
  locs: Localization[],
  groundTruth: GroundTruth
): { medianNm: number; meanNm: number; p90Nm: number } {
  if (locs.length === 0 || groundTruth.emitters.length === 0) {
    return { medianNm: 0, meanNm: 0, p90Nm: 0 };
  }

  // Build a uniform spatial grid for fast nearest-neighbour queries. The
  // cell size is chosen so the expected number of emitters per cell is ~1;
  // we probe the 3×3 neighbourhood of the query cell (enough because the
  // true nearest neighbour can't be further than one cell away on average).
  const { emitters, fieldSizeNm } = groundTruth;
  const area = fieldSizeNm.width * fieldSizeNm.height;
  const cellNm = Math.max(50, Math.sqrt(area / emitters.length));
  const nCols = Math.max(1, Math.ceil(fieldSizeNm.width / cellNm));
  const nRows = Math.max(1, Math.ceil(fieldSizeNm.height / cellNm));
  const grid: number[][] = new Array(nCols * nRows);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  for (let i = 0; i < emitters.length; i++) {
    const e = emitters[i];
    const gx = Math.min(nCols - 1, Math.max(0, Math.floor(e.x / cellNm)));
    const gy = Math.min(nRows - 1, Math.max(0, Math.floor(e.y / cellNm)));
    grid[gy * nCols + gx].push(i);
  }

  const dists: number[] = new Array(locs.length);
  for (let i = 0; i < locs.length; i++) {
    const l = locs[i];
    const gx = Math.min(nCols - 1, Math.max(0, Math.floor(l.x / cellNm)));
    const gy = Math.min(nRows - 1, Math.max(0, Math.floor(l.y / cellNm)));

    let best = Infinity;
    // Spiral outward until we find a cell containing at least one emitter,
    // then widen by one ring so we catch any closer emitter across a cell
    // boundary. Handles the edge case where the loc's own cell is empty.
    let radius = 0;
    let foundAtRadius = -1;
    while (radius <= Math.max(nCols, nRows)) {
      const xLow = Math.max(0, gx - radius);
      const xHigh = Math.min(nCols - 1, gx + radius);
      const yLow = Math.max(0, gy - radius);
      const yHigh = Math.min(nRows - 1, gy + radius);
      for (let cy = yLow; cy <= yHigh; cy++) {
        for (let cx = xLow; cx <= xHigh; cx++) {
          // Only visit the outer ring to avoid double-counting.
          if (radius > 0 && cx > xLow && cx < xHigh && cy > yLow && cy < yHigh) {
            continue;
          }
          for (const idx of grid[cy * nCols + cx]) {
            const e = emitters[idx];
            const dx = e.x - l.x;
            const dy = e.y - l.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) best = d2;
          }
        }
      }
      if (foundAtRadius >= 0 && radius > foundAtRadius) break;
      if (best < Infinity && foundAtRadius < 0) foundAtRadius = radius;
      radius++;
    }
    dists[i] = Math.sqrt(best);
  }

  dists.sort((a, b) => a - b);
  const medianNm = dists[Math.floor(dists.length / 2)];
  const p90Nm = dists[Math.floor(dists.length * 0.9)];
  let sum = 0;
  for (const d of dists) sum += d;
  const meanNm = sum / dists.length;
  return { medianNm, meanNm, p90Nm };
}

/**
 * Detection efficiency: localizations per ON-emitter-frame event.
 *
 * Every time an emitter is in the ON state during a frame it produces
 * photons and (ideally) a localization. In sparse conditions this ratio
 * approaches 1. In dense conditions, multiple simultaneously-on emitters
 * get merged into a single detection by the local-max detector, pulling
 * the ratio below 1. A very low value (≤ 0.5) indicates the duty cycle or
 * emitter density is too high for the current localizer.
 */
export function computeDetectionEfficiency(
  nLocalizations: number,
  nOnEmitterFrameEvents: number
): number {
  if (nOnEmitterFrameEvents === 0) return 0;
  return nLocalizations / nOnEmitterFrameEvents;
}
