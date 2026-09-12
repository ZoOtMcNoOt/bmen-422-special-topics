import { describe, expect, it } from 'vitest';
import { localizeFrame } from '@/lib/simulator/localization';
import { gaussianPsfPixelIntegrated, gaussianPsfPixelIntegratedGradient } from '@/lib/simulator/psf';
import { renderFrame } from '@/lib/simulator/renderFrame';
import type { Emitter, Frame, SimulationParams } from '@/lib/simulator/types';
import { CENTER_NM, distance, nearestTo, params } from './fixtures';

/** Deterministic expected pixel counts isolate fitting error from sampling noise. */
function expectedFrame(emitters: Emitter[], p: SimulationParams): Frame {
  const { width, height } = p.fieldSizePx;
  const pixels = new Float32Array(width * height);
  const a = p.pixelSizeNm;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let count = p.backgroundPerPixel;
      for (const e of emitters) {
        count += p.photonsPerCycle * gaussianPsfPixelIntegrated(
          x * a, (x + 1) * a, y * a, (y + 1) * a, e.x, e.y, p.psfSigmaNm
        );
      }
      pixels[y * width + x] = count;
    }
  }
  return { pixels, width, height, frameIndex: 0 };
}

const seededRandom = (initial: number) => {
  let seed = initial;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
};

describe('numerical localization boundaries', () => {
  it('turns a four-pixel intensity plateau into exactly one localization', () => {
    const p = params();
    const truth = { x: CENTER_NM, y: CENTER_NM };
    const found = localizeFrame(expectedFrame([truth], p), p);
    expect(found).toHaveLength(1);
    expect(distance(found[0], truth.x, truth.y)).toBeLessThan(0.001);
  });

  it.each([130, 240, 320])('corrects finite-ROI photon capture at PSF sigma %d nm', (psfSigmaNm) => {
    const p = params({ psfSigmaNm });
    const truth = { x: CENTER_NM + 40, y: CENTER_NM - 30 };
    const found = localizeFrame(expectedFrame([truth], p), p);
    expect(found).toHaveLength(1);
    expect(distance(found[0], truth.x, truth.y)).toBeLessThan(0.01);
    expect(Math.abs(found[0].nPhotons / p.photonsPerCycle - 1)).toBeLessThan(0.0001);
  });

  it('keeps resolvable emitters separate while suppressing duplicate fits', () => {
    const p = params();
    const truth = [{ x: CENTER_NM - 400, y: CENTER_NM }, { x: CENTER_NM + 400, y: CENTER_NM }];
    const found = localizeFrame(expectedFrame(truth, p), p);
    expect(found).toHaveLength(2);
    for (const point of truth) expect(distance(nearestTo(found, point.x, point.y), point.x, point.y)).toBeLessThan(10);
  });

  it.each([NaN, Infinity, -1])('rejects a fitting ROI containing invalid camera count %s', (count) => {
    const p = params();
    const frame = expectedFrame([{ x: CENTER_NM + 40, y: CENTER_NM - 30 }], p);
    frame.pixels[32 * frame.width + 32] = count;
    expect(localizeFrame(frame, p)).toHaveLength(0);
  });

  it('does not accept an unidentifiable sub-pixel delta as a precise Gaussian fit', () => {
    const p = params({ psfSigmaNm: 0.01, backgroundPerPixel: 0 });
    const frame = expectedFrame([{ x: CENTER_NM + 40, y: CENTER_NM + 30 }], p);
    expect(localizeFrame(frame, p)).toHaveLength(0);
  });

  it('precision estimates remain comparable to repeated localization error with Poisson background', () => {
    const p = params({ photonsPerCycle: 1200, backgroundPerPixel: 80 });
    const truth = { x: CENTER_NM + 40, y: CENTER_NM - 30 };
    const rng = seededRandom(7624);
    let squaredError = 0;
    let predicted = 0;
    let accepted = 0;
    const trials = 160;
    for (let trial = 0; trial < trials; trial++) {
      const found = localizeFrame(renderFrame([truth], p, trial, rng), p);
      expect(found.length).toBeLessThanOrEqual(1);
      if (!found.length) continue;
      accepted++;
      squaredError += distance(found[0], truth.x, truth.y) ** 2;
      predicted += found[0].sigmaLocNm;
    }
    // A statistical shape screen may reject an otherwise valid noise draw.
    // Check retention as well as precision, so discarding difficult frames
    // cannot make the estimator appear artificially accurate.
    expect(accepted).toBeGreaterThanOrEqual(0.98 * trials);
    const empiricalPerAxisRms = Math.sqrt(squaredError / (2 * accepted));
    const ratio = (predicted / accepted) / empiricalPerAxisRms;
    // TLW is an approximation; this catches the former ~5x background-unit error.
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(1.5);
  });
});

describe('analytic integrated-PSF derivatives', () => {
  it('agrees with independent finite differences at off-center pixel positions', () => {
    const bounds = [320, 480, 480, 640] as const;
    const x = 359, y = 578, sigma = 130, step = 0.1;
    const analytic = gaussianPsfPixelIntegratedGradient(...bounds, x, y, sigma);
    const dx = (gaussianPsfPixelIntegrated(...bounds, x + step, y, sigma) - gaussianPsfPixelIntegrated(...bounds, x - step, y, sigma)) / (2 * step);
    const dy = (gaussianPsfPixelIntegrated(...bounds, x, y + step, sigma) - gaussianPsfPixelIntegrated(...bounds, x, y - step, sigma)) / (2 * step);
    expect(analytic.value).toBe(gaussianPsfPixelIntegrated(...bounds, x, y, sigma));
    expect(Math.abs(analytic.dx / dx - 1)).toBeLessThan(0.0001);
    expect(Math.abs(analytic.dy / dy - 1)).toBeLessThan(0.0001);
  });
});
