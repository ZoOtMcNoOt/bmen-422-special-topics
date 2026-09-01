import { describe, expect, it } from 'vitest';
import { erf, gaussianPsfPixelIntegrated, gaussianPsfPoint } from '@/lib/simulator/psf';

describe('erf', () => {
  it.each([
    [0, 0],
    [0.5, 0.5205],
    [1, 0.8427],
    [-1, -0.8427],
    [2, 0.9953],
  ])('erf(%d) ≈ %d', (x, expected) => {
    expect(erf(x)).toBeCloseTo(expected, 3);
  });
});

describe('gaussianPsfPoint', () => {
  it('peaks at 1/(2πσ²)', () => {
    expect(gaussianPsfPoint(0, 0, 130)).toBeCloseTo(1 / (2 * Math.PI * 130 * 130), 10);
  });
  it('falls to e⁻² at 2σ', () => {
    expect(gaussianPsfPoint(260, 0, 130) / gaussianPsfPoint(0, 0, 130)).toBeCloseTo(Math.exp(-2), 6);
  });
});

describe('gaussianPsfPixelIntegrated', () => {
  it('integrates to 1 over a region far larger than the PSF', () => {
    expect(gaussianPsfPixelIntegrated(-2000, 2000, -2000, 2000, 0, 0, 130)).toBeCloseTo(1, 4);
  });
  it('is symmetric: a centred pixel equals four quadrants', () => {
    const full = gaussianPsfPixelIntegrated(-80, 80, -80, 80, 0, 0, 130);
    const quadrant = gaussianPsfPixelIntegrated(0, 80, 0, 80, 0, 0, 130);
    expect(full).toBeCloseTo(4 * quadrant, 8);
  });
  it('sums to 1 across a grid of adjacent pixels', () => {
    let total = 0;
    for (let x = -10; x < 10; x++) {
      for (let y = -10; y < 10; y++) {
        total += gaussianPsfPixelIntegrated(x * 160, (x + 1) * 160, y * 160, (y + 1) * 160, 37, -21, 130);
      }
    }
    expect(total).toBeCloseTo(1, 6);
  });
});
