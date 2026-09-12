import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/simulator/defaults';
import { localizeFrame } from '@/lib/simulator/localization';
import { gaussianPsfPixelIntegrated } from '@/lib/simulator/psf';
import { renderFrame } from '@/lib/simulator/renderFrame';
import type { Emitter, Frame, SimulationParams } from '@/lib/simulator/types';

const base: SimulationParams = { ...DEFAULT_PARAMS, fieldSizePx: { width: 32, height: 32 }, nFrames: 1 };
const seededRandom = (initial: number) => {
  let seed = initial;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
};

/** Noise-free camera expectations keep deterministic model tests independent of
 * detection luck. Photons can vary to construct a deliberately misspecified PSF. */
function expectedFrame(points: (Emitter & { photons?: number })[], p = base): Frame {
  const { width, height } = p.fieldSizePx;
  const pixels = new Float32Array(width * height);
  const a = p.pixelSizeNm;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let count = p.backgroundPerPixel;
      for (const e of points) {
        count += (e.photons ?? p.photonsPerCycle) * gaussianPsfPixelIntegrated(
          x * a, (x + 1) * a, y * a, (y + 1) * a, e.x, e.y, p.psfSigmaNm,
        );
      }
      pixels[y * width + x] = count;
    }
  }
  return { pixels, width, height, frameIndex: 0 };
}

function pair(separation: number, angle: number, x = 2600, y = 2530): Emitter[] {
  const dx = separation / 2 * Math.cos(angle), dy = separation / 2 * Math.sin(angle);
  return [{ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy }];
}

describe('single-emitter model screening', () => {
  it.each([50, 190, 480])('rejects incompatible %i nm pairs instead of inventing midpoint coordinates', (separation) => {
    for (const angle of [0, Math.PI / 6, Math.PI / 4, Math.PI / 2]) {
      expect(localizeFrame(expectedFrame(pair(separation, angle)), base)).toHaveLength(0);
    }
  });

  it('rejects an elongated spot even when its total brightness matches a single molecule', () => {
    const points = pair(190, Math.PI / 4).map((e) => ({ ...e, photons: base.photonsPerCycle / 2 }));
    expect(localizeFrame(expectedFrame(points), base)).toHaveLength(0);
  });

  it('makes the equal-brightness calibration assumption explicit for an unresolved pair', () => {
    const points = pair(50, 0);
    const frame = expectedFrame(points);
    expect(localizeFrame(frame, base)).toHaveLength(0);
    // Shape alone cannot reliably tell this pair from one brighter molecule.
    // Changing the calibration changes the hypothesis, not the camera data.
    const found = localizeFrame(frame, { ...base, photonsPerCycle: 2 * base.photonsPerCycle });
    expect(found).toHaveLength(1);
    expect(Math.hypot(found[0].x - 2600, found[0].y - 2530)).toBeLessThan(1);
  });

  it('retains separated spots across pixel phase and orientation with low localization error', () => {
    const random = seededRandom(72415);
    const geometry = seededRandom(28444);
    const trials = 160;
    let accepted = 0, squaredError = 0;
    for (let f = 0; f < trials; f++) {
      const points = pair(800, geometry() * 2 * Math.PI, 2560 + geometry() * 160, 2560 + geometry() * 160);
      const found = localizeFrame(renderFrame(points, base, f, random), base);
      expect(found.length).toBeLessThanOrEqual(2);
      accepted += found.length;
      for (const l of found) {
        const error = Math.min(...points.map((e) => Math.hypot(l.x - e.x, l.y - e.y)));
        squaredError += error ** 2;
      }
    }
    // A neighboring PSF can still contaminate an ROI: measure missed fits too.
    expect(accepted).toBeGreaterThanOrEqual(0.9 * 2 * trials);
    expect(Math.sqrt(squaredError / (2 * accepted))).toBeLessThan(3);
  });

  it.each([
    { photonsPerCycle: 5000, backgroundPerPixel: 20, limitNm: 3 },
    { photonsPerCycle: 1200, backgroundPerPixel: 80, limitNm: 8 },
    { photonsPerCycle: 500, backgroundPerPixel: 100, limitNm: 18 },
    { photonsPerCycle: 200, backgroundPerPixel: 0, limitNm: 13 },
  ])('retains isolated spots at N=$photonsPerCycle and b=$backgroundPerPixel', ({ limitNm, ...settings }) => {
    const p = { ...base, ...settings };
    const random = seededRandom(924215), geometry = seededRandom(444282);
    const trials = 160;
    let accepted = 0, squaredError = 0;
    for (let f = 0; f < trials; f++) {
      const point = { x: 2560 + geometry() * 160, y: 2560 + geometry() * 160 };
      const found = localizeFrame(renderFrame([point], p, f, random), p);
      expect(found.length).toBeLessThanOrEqual(1);
      if (!found.length) continue;
      accepted++;
      squaredError += (found[0].x - point.x) ** 2 + (found[0].y - point.y) ** 2;
    }
    expect(accepted).toBeGreaterThanOrEqual(0.98 * trials);
    expect(Math.sqrt(squaredError / (2 * accepted))).toBeLessThan(limitNm);
  });

  it('preserves noiseless sub-pixel positions and photons throughout a camera pixel', () => {
    for (const dx of [0, 0.15, 0.5, 0.85, 0.999]) {
      for (const dy of [0, 0.2, 0.5, 0.8, 0.999]) {
        const point = { x: (16 + dx) * 160, y: (16 + dy) * 160 };
        const found = localizeFrame(expectedFrame([point]), base);
        expect(found).toHaveLength(1);
        expect(Math.hypot(found[0].x - point.x, found[0].y - point.y)).toBeLessThan(0.01);
        expect(Math.abs(found[0].nPhotons / base.photonsPerCycle - 1)).toBeLessThan(0.0001);
      }
    }
  });

  it('preserves the existing two-pixel detector border and handles nearby valid spots', () => {
    const hidden = { x: 80, y: 2530 };
    expect(localizeFrame(expectedFrame([hidden]), base)).toHaveLength(0);
    const point = { x: 2.6 * 160, y: 2530 };
    const found = localizeFrame(expectedFrame([point]), base);
    expect(found).toHaveLength(1);
    expect(Math.hypot(found[0].x - point.x, found[0].y - point.y)).toBeLessThan(0.01);
  });

  it.each([0, 2, 20, 100])('does not turn background %i into molecules', (backgroundPerPixel) => {
    const p = { ...base, backgroundPerPixel };
    const random = seededRandom(76187);
    for (let f = 0; f < 80; f++) expect(localizeFrame(renderFrame([], p, f, random), p)).toHaveLength(0);
  });
});
