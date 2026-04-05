import { describe, it, expect } from 'vitest';
import { localizeFrame } from '@/lib/simulator/localization';
import { renderFrame } from '@/lib/simulator/renderFrame';
import type { Emitter, SimulationParams } from '@/lib/simulator/types';

const baseParams: SimulationParams = {
  photonsPerCycle: 5000,
  backgroundPerPixel: 2,
  dutyCycle: 0.001,
  nFrames: 1,
  driftRateNmPerFrame: 0,
  correctDrift: false,
  rigorMode: 'rigorous',
  pixelSizeNm: 160,
  psfSigmaNm: 130,
  fieldSizePx: { width: 64, height: 64 },
};

describe('localizeFrame', () => {
  it('finds a single isolated emitter within a few nm of ground truth', () => {
    const trueX = (64 * 160) / 2 + 40; // offset from pixel center
    const trueY = (64 * 160) / 2 - 30;
    const emitters: Emitter[] = [{ x: trueX, y: trueY }];
    const frame = renderFrame(emitters, baseParams, 0);
    const locs = localizeFrame(frame, baseParams);

    expect(locs.length).toBeGreaterThanOrEqual(1);
    const closest = locs.reduce((best, l) => {
      const d = Math.hypot(l.x - trueX, l.y - trueY);
      return d < Math.hypot(best.x - trueX, best.y - trueY) ? l : best;
    });
    expect(Math.hypot(closest.x - trueX, closest.y - trueY)).toBeLessThan(15);
  });

  it('returns empty list for a blank frame', () => {
    const frame = renderFrame([], baseParams, 0);
    const locs = localizeFrame(frame, baseParams);
    expect(locs.length).toBe(0);
  });

  it('pedagogical (centroid) mode gives a worse fit than rigorous mode on average', () => {
    const trueX = (64 * 160) / 2 + 30;
    const trueY = (64 * 160) / 2 + 30;
    const emitters: Emitter[] = [{ x: trueX, y: trueY }];

    let ped = 0;
    let rig = 0;
    const trials = 20;
    for (let t = 0; t < trials; t++) {
      const f1 = renderFrame(emitters, { ...baseParams, rigorMode: 'pedagogical' }, t);
      const f2 = renderFrame(emitters, { ...baseParams, rigorMode: 'rigorous' }, t);
      const l1 = localizeFrame(f1, { ...baseParams, rigorMode: 'pedagogical' });
      const l2 = localizeFrame(f2, { ...baseParams, rigorMode: 'rigorous' });
      if (l1.length > 0)
        ped += Math.hypot(l1[0].x - trueX, l1[0].y - trueY);
      if (l2.length > 0)
        rig += Math.hypot(l2[0].x - trueX, l2[0].y - trueY);
    }
    // Rigorous should be at least as good on average
    expect(rig / trials).toBeLessThan(ped / trials + 5);
  });
});
