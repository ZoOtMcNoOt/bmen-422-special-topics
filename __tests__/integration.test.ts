import { describe, expect, it } from 'vitest';
import { localizeFrame } from '@/lib/simulator/localization';
import { renderFrame } from '@/lib/simulator/renderFrame';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';
import { distance, nearestTo, params } from './fixtures';

describe('Thompson formula vs. the simulator', () => {
  it('mean 2-D localization error matches the Rayleigh expectation from Thompson σ', () => {
    const p = params({ photonsPerCycle: 3000, backgroundPerPixel: 5, fieldSizePx: { width: 32, height: 32 } });
    const x = (32 * 160) / 2 + 37;
    const y = (32 * 160) / 2 - 21;

    const errors: number[] = [];
    for (let t = 0; t < 200; t++) {
      const locs = localizeFrame(renderFrame([{ x, y }], p, t), p);
      if (locs.length) errors.push(distance(nearestTo(locs, x, y), x, y));
    }
    expect(errors.length).toBeGreaterThan(180);

    // Independent N(0, σ²) errors in x and y ⇒ |error| is Rayleigh with mean σ·√(π/2).
    const sigma = thompsonSigmaLoc(p.psfSigmaNm, p.photonsPerCycle, p.pixelSizeNm, p.backgroundPerPixel);
    const ratio = errors.reduce((a, b) => a + b, 0) / errors.length / (sigma * Math.sqrt(Math.PI / 2));
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  });
});
