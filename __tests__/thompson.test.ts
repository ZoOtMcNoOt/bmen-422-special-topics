import { describe, expect, it } from 'vitest';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';

describe('thompsonSigmaLoc', () => {
  it('reproduces the canonical ~3 nm at N=3000, σ=130, a=160, b=10', () => {
    const s = thompsonSigmaLoc(130, 3000, 160, 10);
    expect(s).toBeGreaterThan(2.5);
    expect(s).toBeLessThan(3.5);
  });

  it('scales exactly as 1/√N when b = 0', () => {
    expect(thompsonSigmaLoc(130, 1000, 160, 0) / thompsonSigmaLoc(130, 4000, 160, 0)).toBeCloseTo(2, 8);
  });

  it('degrades with background', () => {
    expect(thompsonSigmaLoc(130, 1000, 160, 20)).toBeGreaterThan(thompsonSigmaLoc(130, 1000, 160, 1));
  });

  it('approaches σ/√N with tiny pixels and no background', () => {
    expect(thompsonSigmaLoc(130, 10_000, 10, 0)).toBeCloseTo(130 / 100, 2);
  });

  it('is Infinity for zero photons', () => {
    expect(thompsonSigmaLoc(130, 0, 160, 10)).toBe(Infinity);
  });
});
