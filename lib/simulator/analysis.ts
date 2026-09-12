import type { Emitter, Localization, LocalizationMetrics } from './types';

/** Sufficient statistics accumulated across frames, without retaining active masks. */
export type MatchTotals = {
  matchedCount: number;
  activeEmitterFrames: number;
  falsePositiveCount: number;
  squaredErrorSumNm2: number;
};

/**
 * Rectangular Hungarian assignment; rows <= columns and all costs are finite.
 * Returns a distinct column for each row, minimizing total cost.
 */
function minimumCostAssignment(costs: readonly Float64Array[]): Int32Array {
  const rowCount = costs.length;
  const columnCount = costs[0].length;
  const rowPotential = new Float64Array(rowCount + 1);
  const columnPotential = new Float64Array(columnCount + 1);
  const assignedRow = new Int32Array(columnCount + 1);
  const predecessor = new Int32Array(columnCount + 1);

  for (let row = 1; row <= rowCount; row++) {
    assignedRow[0] = row;
    const minCost = new Float64Array(columnCount + 1).fill(Infinity);
    const visited = new Uint8Array(columnCount + 1);
    let column = 0;
    do {
      visited[column] = 1;
      const currentRow = assignedRow[column];
      let delta = Infinity;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= columnCount; candidate++) {
        if (visited[candidate]) continue;
        const reduced = costs[currentRow - 1][candidate - 1] - rowPotential[currentRow] - columnPotential[candidate];
        if (reduced < minCost[candidate]) {
          minCost[candidate] = reduced;
          predecessor[candidate] = column;
        }
        if (minCost[candidate] < delta) {
          delta = minCost[candidate];
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= columnCount; candidate++) {
        if (visited[candidate]) {
          rowPotential[assignedRow[candidate]] += delta;
          columnPotential[candidate] -= delta;
        } else {
          minCost[candidate] -= delta;
        }
      }
      column = nextColumn;
    } while (assignedRow[column] !== 0);

    do {
      const previous = predecessor[column];
      assignedRow[column] = assignedRow[previous];
      column = previous;
    } while (column !== 0);
  }

  const assignment = new Int32Array(rowCount);
  for (let column = 1; column <= columnCount; column++) {
    if (assignedRow[column]) assignment[assignedRow[column] - 1] = column - 1;
  }
  return assignment;
}

/**
 * Match fits to ACTIVE emitter centers in this camera frame, including its drift.
 * Centers outside [0,width) x [0,height) are excluded from the observable truth.
 * First maximize the number of pairs within the inclusive finite gate, then
 * minimize their total Euclidean distance. Every fit and emitter is used at most once.
 */
export function matchFrameLocalizations(
  localizations: readonly Localization[],
  activeEmitters: readonly Emitter[],
  frameIndex: number,
  fieldSizeNm: { width: number; height: number },
  matchRadiusNm: number
): MatchTotals {
  if (!Number.isFinite(matchRadiusNm) || matchRadiusNm <= 0) {
    throw new RangeError('The localization matching radius must be finite and positive');
  }
  if (localizations.some((l) => l.frameIndex !== frameIndex)) {
    throw new Error('Localization matching requires detections from the same camera frame');
  }
  const truth = activeEmitters.filter((e) =>
    e.x >= 0 && e.x < fieldSizeNm.width && e.y >= 0 && e.y < fieldSizeNm.height
  );
  const totals: MatchTotals = {
    matchedCount: 0,
    activeEmitterFrames: truth.length,
    falsePositiveCount: localizations.length,
    squaredErrorSumNm2: 0,
  };
  if (!truth.length || !localizations.length) return totals;

  // The smaller set forms the rows. Normalized valid costs are <= 1; one
  // invalid edge costs more than every valid edge combined, enforcing cardinality.
  const rows = localizations.length <= truth.length ? localizations : truth;
  const columns = localizations.length <= truth.length ? truth : localizations;
  const unmatchedCost = rows.length + 1;
  const distances = rows.map((row) => Float64Array.from(columns, (column) =>
    Math.hypot(row.x - column.x, row.y - column.y)
  ));
  const costs = distances.map((row) => Float64Array.from(row, (distance) =>
    distance <= matchRadiusNm ? distance / matchRadiusNm : unmatchedCost
  ));
  const assignment = minimumCostAssignment(costs);
  for (let row = 0; row < assignment.length; row++) {
    const distance = distances[row][assignment[row]];
    if (distance > matchRadiusNm || !Number.isFinite(distance)) continue;
    totals.matchedCount++;
    totals.squaredErrorSumNm2 += distance * distance;
  }
  totals.falsePositiveCount -= totals.matchedCount;
  return totals;
}

/** Per-axis RMS on matched pairs; detection errors expose excluded observations. */
export function summarizeMatches(totals: MatchTotals, matchRadiusNm: number): LocalizationMetrics {
  const detections = totals.matchedCount + totals.falsePositiveCount;
  return {
    rmsPerAxisErrorNm: totals.matchedCount
      ? Math.sqrt(totals.squaredErrorSumNm2 / (2 * totals.matchedCount))
      : null,
    matchedCount: totals.matchedCount,
    activeEmitterFrames: totals.activeEmitterFrames,
    missedCount: totals.activeEmitterFrames - totals.matchedCount,
    falsePositiveCount: totals.falsePositiveCount,
    detectionRecall: totals.activeEmitterFrames ? totals.matchedCount / totals.activeEmitterFrames : null,
    falsePositiveRate: detections ? totals.falsePositiveCount / detections : null,
    matchRadiusNm,
  };
}
