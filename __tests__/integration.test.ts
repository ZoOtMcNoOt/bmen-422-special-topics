import { describe, it, expect } from 'vitest';
import { renderFrame } from '@/lib/simulator/renderFrame';
import { localizeFrame } from '@/lib/simulator/localization';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';
import type { Emitter, SimulationParams } from '@/lib/simulator/types';

describe('integration: Thompson formula verification', () => {
  it('measured σ_loc matches Thompson prediction within 25% at N=3000', () => {
    const params: SimulationParams = {
      photonsPerCycle: 3000,
      backgroundPerPixel: 5,
      dutyCycle: 0.001,
      nFrames: 1,
      driftRateNmPerFrame: 0,
      correctDrift: false,
      rigorMode: 'rigorous',
      pixelSizeNm: 160,
      psfSigmaNm: 130,
      fieldSizePx: { width: 32, height: 32 },
    };

    const trueX = (32 * 160) / 2 + 37;
    const trueY = (32 * 160) / 2 - 21;
    const emitters: Emitter[] = [{ x: trueX, y: trueY }];

    const errors: number[] = [];
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const frame = renderFrame(emitters, params, t);
      const locs = localizeFrame(frame, params);
      if (locs.length === 0) continue;
      const best = locs.reduce((b, l) =>
        Math.hypot(l.x - trueX, l.y - trueY) < Math.hypot(b.x - trueX, b.y - trueY) ? l : b
      );
      errors.push(Math.hypot(best.x - trueX, best.y - trueY));
    }

    expect(errors.length).toBeGreaterThan(trials * 0.9);
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    const prediction = thompsonSigmaLoc(
      params.psfSigmaNm,
      params.photonsPerCycle,
      params.pixelSizeNm,
      params.backgroundPerPixel
    );
    // Expected mean 2D distance: if (X-trueX) and (Y-trueY) are independent
    // N(0, σ²_loc), then R = √(dx² + dy²) is Rayleigh-distributed with scale
    // parameter σ_loc, and E[R] = σ_loc · √(π/2) ≈ 1.2533 · σ_loc.
    // (The plan originally used σ · √2 · √(π/2) = σ · √π, which is neither
    // the mean nor RMS of a Rayleigh — an off-by-√2 math error caught in review.)
    const expected2D = prediction * Math.sqrt(Math.PI / 2);
    const ratio = meanError / expected2D;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
  }, 30000);
});
