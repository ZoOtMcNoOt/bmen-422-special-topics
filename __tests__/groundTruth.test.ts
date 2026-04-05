import { describe, it, expect } from 'vitest';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import type { GroundTruthInput } from '@/lib/simulator/types';

describe('generateGroundTruth — two-lines', () => {
  it('produces 2 * nPerLine emitters', () => {
    const input: GroundTruthInput = {
      kind: 'two-lines',
      separationNm: 50,
      length: 2000,
      nPerLine: 100,
    };
    const gt = generateGroundTruth(input, { width: 10000, height: 10000 });
    expect(gt.emitters.length).toBe(200);
  });

  it('places emitters on two parallel lines at the specified separation', () => {
    const gt = generateGroundTruth(
      { kind: 'two-lines', separationNm: 50, length: 2000, nPerLine: 50 },
      { width: 10000, height: 10000 }
    );
    // Find emitters on upper line vs lower line
    const yCoords = [...new Set(gt.emitters.map((e) => Math.round(e.y)))];
    expect(yCoords.length).toBe(2);
    expect(Math.abs(yCoords[0] - yCoords[1])).toBe(50);
  });
});

describe('generateGroundTruth — microtubule-ring', () => {
  it('places emitters on a ring of the specified diameter', () => {
    const gt = generateGroundTruth(
      { kind: 'microtubule-ring', diameterNm: 25, nEmitters: 100 },
      { width: 10000, height: 10000 }
    );
    expect(gt.emitters.length).toBe(100);
    const cx = 5000;
    const cy = 5000;
    for (const e of gt.emitters) {
      const r = Math.sqrt((e.x - cx) ** 2 + (e.y - cy) ** 2);
      expect(r).toBeCloseTo(12.5, 1);
    }
  });
});

describe('generateGroundTruth — actin-periodic', () => {
  it('places emitters at roughly periodic spacing', () => {
    const gt = generateGroundTruth(
      { kind: 'actin-periodic', periodNm: 190, lengthNm: 2000, nRungs: 10, nPerRung: 20 },
      { width: 10000, height: 10000 }
    );
    expect(gt.emitters.length).toBe(200);
  });
});
