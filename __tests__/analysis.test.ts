import { describe, expect, it } from 'vitest';
import { computeDetectionEfficiency, computeEmpiricalPrecision } from '@/lib/simulator/analysis';
import type { GroundTruth, Localization } from '@/lib/simulator/types';
import { distance, loc, nearestTo } from './fixtures';

const truth = (emitters: { x: number; y: number }[], size = 1000): GroundTruth => ({
  emitters,
  fieldSizeNm: { width: size, height: size },
  label: 'test',
});

/** Brute-force reference. */
const bruteNearest = (l: Localization, gt: GroundTruth) => {
  const e = nearestTo(gt.emitters, l.x, l.y);
  return distance(e, l.x, l.y);
};

describe('computeEmpiricalPrecision', () => {
  it('returns zeros for empty input', () => {
    expect(computeEmpiricalPrecision([], truth([{ x: 1, y: 1 }]))).toEqual({ medianNm: 0, p90Nm: 0 });
    expect(computeEmpiricalPrecision([loc(1, 1)], truth([]))).toEqual({ medianNm: 0, p90Nm: 0 });
  });

  it('measures known offsets exactly', () => {
    const gt = truth([{ x: 100, y: 100 }, { x: 500, y: 500 }, { x: 900, y: 900 }]);
    const out = computeEmpiricalPrecision([loc(103, 100), loc(500, 505), loc(896, 900)], gt);
    expect(out.medianNm).toBe(4);
    expect(out.p90Nm).toBe(5);
  });

  it('finds the true nearest emitter even when it lies two grid rings out', () => {
    // 100 emitters in a 1000 nm field ⇒ 100 nm cells, 10×10 grid.
    // Loc (99,50) is in cell (0,0); the emitter at the origin is 110.9 nm away,
    // but the one at (201,50) — in cell (2,0), ring 2 — is only 102 nm away.
    const filler = Array.from({ length: 98 }, () => ({ x: 995, y: 995 }));
    const gt = truth([{ x: 0, y: 0 }, { x: 201, y: 50 }, ...filler]);
    expect(computeEmpiricalPrecision([loc(99, 50)], gt).medianNm).toBeCloseTo(102, 6);
  });

  it('agrees with brute force on random fields', () => {
    for (let trial = 0; trial < 20; trial++) {
      const n = 40 + Math.floor(Math.random() * 60);
      const gt = truth(Array.from({ length: n }, () => ({ x: Math.random() * 10_000, y: Math.random() * 10_000 })), 10_000);
      const locs = Array.from({ length: 51 }, () => loc(Math.random() * 10_000, Math.random() * 10_000));
      const expected = locs.map((l) => bruteNearest(l, gt)).sort((a, b) => a - b);
      const out = computeEmpiricalPrecision(locs, gt);
      expect(out.medianNm).toBeCloseTo(expected[25], 6);
      expect(out.p90Nm).toBeCloseTo(expected[45], 6);
    }
  });

  it('scales linearly with localization noise', () => {
    const emitters = Array.from({ length: 2000 }, (_, i) => ({ x: 500 + ((i * 37) % 9000), y: 500 + ((i * 53) % 9000) }));
    const gt = truth(emitters, 10_000);
    const noisy = (scale: number) => emitters.map((e) => loc(e.x + (Math.random() - 0.5) * scale, e.y + (Math.random() - 0.5) * scale));
    const ratio = computeEmpiricalPrecision(noisy(4), gt).medianNm / computeEmpiricalPrecision(noisy(2), gt).medianNm;
    // Ratio SE ≈ 1.6 % with 2000 points; ±7.5 % is >4σ.
    expect(ratio).toBeGreaterThan(1.85);
    expect(ratio).toBeLessThan(2.15);
  });
});

describe('computeDetectionEfficiency', () => {
  it('is 0 with no ON events', () => {
    expect(computeDetectionEfficiency(5, 0)).toBe(0);
  });
  it('is the ratio of localizations to ON events', () => {
    expect(computeDetectionEfficiency(80, 100)).toBe(0.8);
    expect(computeDetectionEfficiency(100, 100)).toBe(1);
  });
});
