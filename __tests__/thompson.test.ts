import { describe, expect, it } from 'vitest';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';

describe('thompsonSigmaLoc', () => {
  it('uses Poisson background variance, rather than squaring its mean', () => {
    // TLW noise SD sqrt(20) photons corresponds to this camera mean of 20.
    // Independently evaluated reference values: sigma=130 nm, a=160 nm.
    expect(thompsonSigmaLoc(130, 5000, 160, 20)).toBeCloseTo(2.007731116488115, 10);
    expect(thompsonSigmaLoc(130, 200, 160, 20)).toBeCloseTo(15.34161489451591, 10);
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
