import { describe, expect, it } from 'vitest';
import { matchFrameLocalizations, summarizeMatches } from '@/lib/simulator/analysis';
import type { Emitter, Localization } from '@/lib/simulator/types';
import { loc } from './fixtures';

const field = { width: 1000, height: 1000 };
const match = (detections: Localization[], active: Emitter[], gate = 10, frame = 0) =>
  matchFrameLocalizations(detections, active, frame, field, gate);

/** Exhaustive independent reference for tiny gated bipartite matching problems. */
function bruteMatch(detections: Localization[], active: Emitter[], gate: number) {
  let best = { count: -1, distance: Infinity, squared: 0 };
  function visit(index: number, used: Set<number>, count: number, distance: number, squared: number) {
    if (index === detections.length) {
      if (count > best.count || (count === best.count && distance < best.distance)) {
        best = { count, distance, squared };
      }
      return;
    }
    visit(index + 1, used, count, distance, squared);
    active.forEach((emitter, target) => {
      if (used.has(target)) return;
      const d = Math.hypot(detections[index].x - emitter.x, detections[index].y - emitter.y);
      if (d > gate) return;
      used.add(target);
      visit(index + 1, used, count + 1, distance + d, squared + d * d);
      used.delete(target);
    });
  }
  visit(0, new Set(), 0, 0, 0);
  return best;
}

describe('active-frame localization matching', () => {
  it('prioritizes two valid matches over the cheaper greedy match and one miss', () => {
    const result = match([loc(101, 100), loc(95, 100)], [{ x: 100, y: 100 }, { x: 110, y: 100 }]);
    expect(result.matchedCount).toBe(2);
    expect(result.falsePositiveCount).toBe(0);
    expect(result.squaredErrorSumNm2).toBe(9 ** 2 + 5 ** 2);
  });

  it('minimizes total distance among assignments with maximum cardinality', () => {
    const result = match([loc(102, 100), loc(108, 100)], [{ x: 100, y: 100 }, { x: 110, y: 100 }], 20);
    expect(result.matchedCount).toBe(2);
    expect(result.squaredErrorSumNm2).toBe(8);
  });

  it('counts duplicates as false positives and uses only the closest duplicate', () => {
    const result = match([loc(102, 100), loc(103, 100), loc(100, 100)], [{ x: 100, y: 100 }]);
    expect(result).toEqual({ matchedCount: 1, activeEmitterFrames: 1, falsePositiveCount: 2, squaredErrorSumNm2: 0 });
    expect(summarizeMatches(result, 10).falsePositiveRate).toBeCloseTo(2 / 3);
  });

  it('matches only supplied active truth and refuses mixed camera frames', () => {
    const result = match([loc(900, 900)], [{ x: 100, y: 100 }]);
    expect(result.matchedCount).toBe(0);
    expect(result.falsePositiveCount).toBe(1);
    expect(() => match([loc(100, 100, { frameIndex: 1 })], [{ x: 100, y: 100 }])).toThrow(/same camera frame/);
  });

  it('includes the matching gate boundary and excludes centers outside the sensor', () => {
    const active = [{ x: 0, y: 100 }, { x: 1000, y: 100 }, { x: -1, y: 100 }];
    const result = match([loc(10, 100), loc(1000, 100)], active);
    expect(result.matchedCount).toBe(1);
    expect(result.activeEmitterFrames).toBe(1);
    expect(result.falsePositiveCount).toBe(1);
    expect(result.squaredErrorSumNm2).toBe(100);
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid matching gate %s', (gate) => {
    expect(() => match([], [], gate)).toThrow(/finite and positive/);
  });

  it('agrees with exhaustive matching on seeded rectangular problems', () => {
    let seed = 37;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let n = 1; n <= 4; n++) {
      for (let m = 1; m <= 4; m++) {
        for (let trial = 0; trial < 6; trial++) {
          const detections = Array.from({ length: n }, () => loc(100 + random() * 30, 100 + random() * 30));
          const active = Array.from({ length: m }, () => ({ x: 100 + random() * 30, y: 100 + random() * 30 }));
          const expected = bruteMatch(detections, active, 15);
          const actual = match(detections, active, 15);
          expect(actual.matchedCount).toBe(expected.count);
          expect(actual.squaredErrorSumNm2).toBeCloseTo(expected.squared, 8);
          expect(actual.falsePositiveCount).toBe(n - expected.count);
        }
      }
    }
  });
});

describe('localization measurement summaries', () => {
  it('reports matched per-axis RMS, misses, and false positives as separate quantities', () => {
    const result = summarizeMatches({
      matchedCount: 2, activeEmitterFrames: 4, falsePositiveCount: 1, squaredErrorSumNm2: 25 + 9,
    }, 130);
    expect(result).toEqual({
      rmsPerAxisErrorNm: Math.sqrt(34 / 4),
      matchedCount: 2, activeEmitterFrames: 4, missedCount: 2, falsePositiveCount: 1,
      detectionRecall: 0.5, falsePositiveRate: 1 / 3, matchRadiusNm: 130,
    });
  });

  it('does not turn no detections into zero localization error', () => {
    const result = summarizeMatches(match([], [{ x: 100, y: 100 }]), 10);
    expect(result.rmsPerAxisErrorNm).toBeNull();
    expect(result.missedCount).toBe(1);
    expect(result.detectionRecall).toBe(0);
    expect(result.falsePositiveRate).toBeNull();
  });

  it('reports false fits even when no emitter was active', () => {
    const result = summarizeMatches(match([loc(100, 100)], []), 10);
    expect(result.rmsPerAxisErrorNm).toBeNull();
    expect(result.detectionRecall).toBeNull();
    expect(result.falsePositiveRate).toBe(1);
  });

  it('leaves both rates unavailable when neither activity nor fits exist', () => {
    const result = summarizeMatches(match([], []), 10);
    expect(result.rmsPerAxisErrorNm).toBeNull();
    expect(result.detectionRecall).toBeNull();
    expect(result.falsePositiveRate).toBeNull();
  });
});
