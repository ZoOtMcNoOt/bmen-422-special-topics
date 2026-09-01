import { clamp, median } from '@/lib/utils';
import type { GroundTruth, Localization } from './types';

/** Grid cells are never narrower than this, so sparse fields don't allocate huge grids. */
const MIN_CELL_NM = 50;

/**
 * Median and p90 distance from each localization to its nearest true emitter.
 * A direct, ground-truth-referenced precision — unlike the Thompson estimate
 * it grows when overlapping molecules are merged into one detection.
 *
 * Emitters are bucketed into a uniform grid sized for ~1 per cell (but at
 * least MIN_CELL_NM wide). Each query spirals outward ring by ring and stops
 * once the best distance found is no larger than the distance to the nearest
 * unvisited ring, which guarantees exactness.
 */
export function computeEmpiricalPrecision(
  localizations: readonly Localization[],
  groundTruth: GroundTruth
): { medianNm: number; p90Nm: number } {
  const { emitters, fieldSizeNm } = groundTruth;
  if (localizations.length === 0 || emitters.length === 0) return { medianNm: 0, p90Nm: 0 };

  const cellNm = Math.max(MIN_CELL_NM, Math.sqrt((fieldSizeNm.width * fieldSizeNm.height) / emitters.length));
  const nCols = Math.max(1, Math.ceil(fieldSizeNm.width / cellNm));
  const nRows = Math.max(1, Math.ceil(fieldSizeNm.height / cellNm));
  const cellOf = (v: number, n: number) => clamp(Math.floor(v / cellNm), 0, n - 1);

  const grid: number[][] = Array.from({ length: nCols * nRows }, () => []);
  emitters.forEach((e, i) => grid[cellOf(e.y, nRows) * nCols + cellOf(e.x, nCols)].push(i));

  const maxRing = Math.max(nCols, nRows);
  const dists = new Float64Array(localizations.length);

  for (let i = 0; i < localizations.length; i++) {
    const l = localizations[i];
    const gx = cellOf(l.x, nCols);
    const gy = cellOf(l.y, nRows);
    let best = Infinity;

    for (let r = 0; r <= maxRing; r++) {
      const xLow = Math.max(0, gx - r);
      const xHigh = Math.min(nCols - 1, gx + r);
      const yLow = Math.max(0, gy - r);
      const yHigh = Math.min(nRows - 1, gy + r);
      for (let cy = yLow; cy <= yHigh; cy++) {
        const onEdgeRow = cy === gy - r || cy === gy + r;
        for (let cx = xLow; cx <= xHigh; cx++) {
          if (!onEdgeRow && cx !== gx - r && cx !== gx + r) continue;
          for (const idx of grid[cy * nCols + cx]) {
            const dx = emitters[idx].x - l.x;
            const dy = emitters[idx].y - l.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) best = d2;
          }
        }
      }
      // Everything within Chebyshev ring r is visited; nothing unvisited can be
      // closer than r·cellNm (the query lies inside its own cell).
      if (best <= (r * cellNm) ** 2) break;
    }
    dists[i] = Math.sqrt(best);
  }

  dists.sort();
  return { medianNm: median(dists), p90Nm: dists[Math.floor(dists.length * 0.9)] };
}

/** Localizations per ON-emitter-frame event; < 1 when the detector merges neighbours. */
export function computeDetectionEfficiency(nLocalizations: number, nOnEvents: number): number {
  return nOnEvents === 0 ? 0 : nLocalizations / nOnEvents;
}
