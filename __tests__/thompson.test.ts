import { describe, it, expect } from 'vitest';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';

describe('thompsonSigmaLoc', () => {
  it('matches Thompson 2002 numerical example: N=3000, σ=130, a=160, b=10 → ~3 nm', () => {
    const sigma = thompsonSigmaLoc(130, 3000, 160, 10);
    expect(sigma).toBeGreaterThan(2.5);
    expect(sigma).toBeLessThan(3.5);
  });

  it('improves as 1/sqrt(N) at low background', () => {
    const s1 = thompsonSigmaLoc(130, 1000, 160, 0);
    const s2 = thompsonSigmaLoc(130, 4000, 160, 0);
    // Doubling-cube should give sqrt(4) = 2x improvement
    expect(s1 / s2).toBeCloseTo(2, 1);
  });

  it('degrades as background increases', () => {
    const low = thompsonSigmaLoc(130, 1000, 160, 1);
    const high = thompsonSigmaLoc(130, 1000, 160, 20);
    expect(high).toBeGreaterThan(low);
  });

  it('shot noise limit: σ_loc ≈ σ/sqrt(N) when b=0 and pixels small', () => {
    const sigma = 130;
    const N = 10000;
    const result = thompsonSigmaLoc(sigma, N, 10, 0); // tiny pixels
    const expected = sigma / Math.sqrt(N);
    expect(Math.abs(result - expected)).toBeLessThan(0.5);
  });
});
