import { describe, expect, it } from 'vitest';
import { backgroundIntegral, dilogOfNegative, mlePrecisionNm } from '@/lib/simulator/precision';

/** ∫₀¹ ln t / (1 + t/τ) dt by Simpson's rule after t = e^{−v}, which removes the log singularity. */
function integralByQuadrature(tau: number): number {
  const f = (v: number) => (-v * Math.exp(-v)) / (1 + Math.exp(-v) / tau);
  const end = 80;
  const steps = 40_000;
  const h = end / steps;
  let sum = f(0) + f(end);
  for (let i = 1; i < steps; i++) sum += f(i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

describe('dilogarithm', () => {
  it('matches known values on both sides of the inversion point', () => {
    expect(dilogOfNegative(0)).toBe(0);
    expect(dilogOfNegative(1)).toBeCloseTo(-(Math.PI ** 2) / 12, 14);
    // Li₂(−y) + Li₂(−1/y) = −π²/6 − ½ ln² y
    for (const y of [0.3, 2, 47])
      expect(dilogOfNegative(y) + dilogOfNegative(1 / y)).toBeCloseTo(-(Math.PI ** 2) / 6 - Math.log(y) ** 2 / 2, 13);
  });

  it('gives the background integral computed by direct quadrature', () => {
    for (const tau of [1e-4, 0.01, 0.0447, 0.5, 3, 200])
      expect(backgroundIntegral(tau)).toBeCloseTo(integralByQuadrature(tau), 9);
    expect(backgroundIntegral(0)).toBe(0);
  });
});

describe('mlePrecisionNm', () => {
  it('matches the exact Cramér–Rao bound for the simulated camera', () => {
    // Independently computed per-axis CRLB for a pixel-integrated Gaussian with
    // Poisson counts (σ = 130 nm, a = 160 nm), RMS over sub-pixel positions.
    const cases: [photons: number, background: number, crlb: number][] = [
      [5000, 20, 2.154], [1000, 20, 5.675], [1000, 100, 8.073], [200, 20, 18.051],
    ];
    for (const [photons, background, crlb] of cases)
      expect(Math.abs(mlePrecisionNm(130, photons, 160, background) / crlb - 1)).toBeLessThan(0.003);
  });

  it('is σₐ/√N without background', () => {
    expect(mlePrecisionNm(130, 1000, 160, 0)).toBeCloseTo(Math.sqrt((130 ** 2 + 160 ** 2 / 12) / 1000), 12);
    expect(mlePrecisionNm(130, 1000, 160, 0) / mlePrecisionNm(130, 4000, 160, 0)).toBeCloseTo(2, 12);
  });

  it('degrades with background and approaches σ/√N with tiny pixels', () => {
    expect(mlePrecisionNm(130, 1000, 160, 20)).toBeGreaterThan(mlePrecisionNm(130, 1000, 160, 1));
    expect(mlePrecisionNm(130, 10_000, 10, 0)).toBeCloseTo(130 / 100, 2);
  });

  it('is Infinity for zero photons', () => {
    expect(mlePrecisionNm(130, 0, 160, 10)).toBe(Infinity);
  });
});
