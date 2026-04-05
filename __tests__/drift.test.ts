import { describe, it, expect } from 'vitest';
import {
  computeDriftAtFrame,
  applyDriftToEmitter,
  correctLocalizationDrift,
} from '@/lib/simulator/drift';
import type { Localization } from '@/lib/simulator/types';

describe('drift', () => {
  it('linear drift grows linearly with frame index', () => {
    const d0 = computeDriftAtFrame(0, 2.0);
    const d100 = computeDriftAtFrame(100, 2.0);
    expect(d0.x).toBeCloseTo(0, 6);
    expect(d100.x).toBeCloseTo(200, 6);
  });

  it('applyDriftToEmitter shifts position correctly', () => {
    const shifted = applyDriftToEmitter({ x: 100, y: 200 }, { x: 5, y: -3 });
    expect(shifted.x).toBe(105);
    expect(shifted.y).toBe(197);
  });

  it('correctLocalizationDrift recovers applied drift within 5 nm', () => {
    // Generate fake localizations with a linear drift baked in
    const locs: Localization[] = [];
    for (let f = 0; f < 100; f++) {
      const driftX = f * 1.5;
      const driftY = f * 0.8;
      for (let i = 0; i < 20; i++) {
        locs.push({
          x: 5000 + driftX + (Math.random() - 0.5) * 4,
          y: 5000 + driftY + (Math.random() - 0.5) * 4,
          sigmaLocNm: 3,
          nPhotons: 3000,
          frameIndex: f,
        });
      }
    }
    const corrected = correctLocalizationDrift(locs, 10);
    // Mean position after correction should be near (5000, 5000) regardless of frame
    const means = new Map<number, { x: number; y: number; n: number }>();
    for (const l of corrected) {
      const bin = Math.floor(l.frameIndex / 10);
      const m = means.get(bin) ?? { x: 0, y: 0, n: 0 };
      m.x += l.x;
      m.y += l.y;
      m.n += 1;
      means.set(bin, m);
    }
    // After anchored drift correction, all bin means should be consistent
    // with each other (within 5 nm), not necessarily at (5000, 5000). The
    // algorithm subtracts (bin_mean - bin0_mean) from every loc, so bin 0
    // retains its own intra-bin drift residual and every other bin is
    // equalized to bin 0 — correcting relative drift but carrying a
    // constant global offset.
    const binMeansList = [...means.values()].map((m) => ({
      x: m.x / m.n,
      y: m.y / m.n,
    }));
    const refBin = binMeansList[0];
    for (const m of binMeansList) {
      expect(Math.abs(m.x - refBin.x)).toBeLessThan(5);
      expect(Math.abs(m.y - refBin.y)).toBeLessThan(5);
    }
  });
});
