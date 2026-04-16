import { describe, it, expect } from 'vitest';
import {
  computeEmpiricalPrecision,
  computeDetectionEfficiency,
} from '@/lib/simulator/analysis';
import type { GroundTruth, Localization } from '@/lib/simulator/types';

describe('computeEmpiricalPrecision', () => {
  it('returns zero for empty input', () => {
    const gt: GroundTruth = {
      emitters: [],
      fieldSizeNm: { width: 1000, height: 1000 },
      label: 'empty',
    };
    const out = computeEmpiricalPrecision([], gt);
    expect(out.medianNm).toBe(0);
    expect(out.p90Nm).toBe(0);
  });

  it('finds the nearest true emitter with known offsets', () => {
    const gt: GroundTruth = {
      emitters: [
        { x: 100, y: 100 },
        { x: 500, y: 500 },
        { x: 900, y: 900 },
      ],
      fieldSizeNm: { width: 1000, height: 1000 },
      label: 'three points',
    };
    // Offsets: 3, 5, 4 nm from the three true positions respectively
    const locs: Localization[] = [
      { x: 103, y: 100, sigmaLocNm: 3, nPhotons: 3000, frameIndex: 0 },
      { x: 500, y: 505, sigmaLocNm: 3, nPhotons: 3000, frameIndex: 0 },
      { x: 896, y: 900, sigmaLocNm: 3, nPhotons: 3000, frameIndex: 0 },
    ];
    const out = computeEmpiricalPrecision(locs, gt);
    // median of {3, 5, 4} = 4
    expect(out.medianNm).toBe(4);
    expect(out.meanNm).toBeCloseTo((3 + 5 + 4) / 3, 6);
  });

  it('scales with noise — doubling the perturbation doubles the median', () => {
    const n = 400;
    const gt: GroundTruth = {
      emitters: Array.from({ length: n }, (_, i) => ({
        x: 500 + ((i * 37) % 9000),
        y: 500 + ((i * 53) % 9000),
      })),
      fieldSizeNm: { width: 10000, height: 10000 },
      label: 'random',
    };
    const rng = () => (Math.random() - 0.5) * 2; // uniform [-1, 1]
    const makeLocs = (scale: number): Localization[] =>
      gt.emitters.map((e, i) => ({
        x: e.x + rng() * scale,
        y: e.y + rng() * scale,
        sigmaLocNm: 3,
        nPhotons: 3000,
        frameIndex: i,
      }));
    const low = computeEmpiricalPrecision(makeLocs(2), gt);
    const high = computeEmpiricalPrecision(makeLocs(4), gt);
    // Median of 2D offsets scales linearly with the noise scale. Wide
    // tolerance because the random draw is pseudo-random, not seeded.
    expect(high.medianNm / low.medianNm).toBeGreaterThan(1.4);
    expect(high.medianNm / low.medianNm).toBeLessThan(2.8);
  });

  it('spatial grid works for a single emitter in a large field', () => {
    // Regression test: when the loc's own cell is empty, the spiral search
    // must widen until it finds the (only) emitter elsewhere in the field.
    const gt: GroundTruth = {
      emitters: [{ x: 9000, y: 9000 }],
      fieldSizeNm: { width: 10000, height: 10000 },
      label: 'far corner',
    };
    const locs: Localization[] = [
      { x: 100, y: 100, sigmaLocNm: 3, nPhotons: 3000, frameIndex: 0 },
    ];
    const out = computeEmpiricalPrecision(locs, gt);
    const expected = Math.hypot(9000 - 100, 9000 - 100);
    expect(out.medianNm).toBeCloseTo(expected, 6);
  });
});

describe('computeDetectionEfficiency', () => {
  it('returns 0 when no ON events occurred', () => {
    expect(computeDetectionEfficiency(0, 0)).toBe(0);
    expect(computeDetectionEfficiency(5, 0)).toBe(0);
  });

  it('returns nLocs / nOnEvents when both are positive', () => {
    expect(computeDetectionEfficiency(80, 100)).toBe(0.8);
    expect(computeDetectionEfficiency(100, 100)).toBe(1);
    expect(computeDetectionEfficiency(50, 200)).toBe(0.25);
  });
});
