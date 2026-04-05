import { describe, it, expect } from 'vitest';
import { gaussianPsfPoint, gaussianPsfPixelIntegrated, erf } from '@/lib/simulator/psf';

describe('erf', () => {
  it('erf(0) = 0', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
  });
  it('erf(1) ≈ 0.8427', () => {
    expect(erf(1)).toBeCloseTo(0.8427, 3);
  });
  it('erf(-1) ≈ -0.8427', () => {
    expect(erf(-1)).toBeCloseTo(-0.8427, 3);
  });
});

describe('gaussianPsfPoint', () => {
  it('peak value at origin equals 1/(2π σ²)', () => {
    const sigma = 130;
    const peak = gaussianPsfPoint(0, 0, sigma);
    expect(peak).toBeCloseTo(1 / (2 * Math.PI * sigma * sigma), 10);
  });

  it('falls off at 2 sigma', () => {
    const sigma = 130;
    const peak = gaussianPsfPoint(0, 0, sigma);
    const at2Sigma = gaussianPsfPoint(2 * sigma, 0, sigma);
    expect(at2Sigma / peak).toBeCloseTo(Math.exp(-2), 5);
  });
});

describe('gaussianPsfPixelIntegrated', () => {
  it('integrating over a very large region containing the center gives ~1', () => {
    const sigma = 130;
    // Integrate from -2000 to 2000 nm on both axes (way outside the PSF)
    const integral = gaussianPsfPixelIntegrated(-2000, 2000, -2000, 2000, 0, 0, sigma);
    expect(integral).toBeCloseTo(1, 4);
  });

  it('symmetry: pixel centered on emitter equals four quadrants combined', () => {
    const sigma = 130;
    const full = gaussianPsfPixelIntegrated(-80, 80, -80, 80, 0, 0, sigma);
    const quad = gaussianPsfPixelIntegrated(0, 80, 0, 80, 0, 0, sigma);
    expect(full).toBeCloseTo(4 * quad, 6);
  });
});
