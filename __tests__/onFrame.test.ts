import { describe, it, expect } from 'vitest';
import { runSimulation, type LiveFrameUpdate } from '@/lib/simulator/runSimulation';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import type { SimulationParams } from '@/lib/simulator/types';

describe('runSimulation live frame stream', () => {
  it('invokes onFrame at least once and exposes the cumulative sum', async () => {
    const params: SimulationParams = {
      photonsPerCycle: 4000,
      backgroundPerPixel: 5,
      dutyCycle: 0.005,
      nFrames: 120,
      driftRateNmPerFrame: 0,
      correctDrift: false,
      rigorMode: 'rigorous',
      pixelSizeNm: 160,
      psfSigmaNm: 130,
      fieldSizePx: { width: 32, height: 32 },
    };
    const gt = generateGroundTruth(
      { kind: 'two-lines', separationNm: 80, length: 1500, nPerLine: 200 },
      { width: 5120, height: 5120 }
    );

    const updates: LiveFrameUpdate[] = [];
    const result = await runSimulation(gt, params, {
      onProgress: () => {},
      onFrame: (u) => updates.push(u),
    });

    // 120 frames → ~3 progress-aligned updates + 1 final flush
    expect(updates.length).toBeGreaterThanOrEqual(2);
    const last = updates[updates.length - 1];
    expect(last.frameIndex).toBe(params.nFrames - 1);
    expect(last.totalFrames).toBe(params.nFrames);
    expect(last.framePixels.length).toBe(32 * 32);

    // Cumulative array in the last update equals the sum projection in the
    // result. They're both Float32Array; compare element-wise.
    expect(result.summedFramesPixels.length).toBe(32 * 32);
    expect(result.summedFramesSize).toEqual({ width: 32, height: 32 });
    let totalSum = 0;
    for (let i = 0; i < result.summedFramesPixels.length; i++) {
      expect(last.cumulativePixels[i]).toBe(result.summedFramesPixels[i]);
      totalSum += result.summedFramesPixels[i];
    }
    // With nonzero background and 120 frames, the cumulative pixel total
    // should be substantial (>> 0). Sanity check, not a tight bound.
    expect(totalSum).toBeGreaterThan(0);
  }, 30000);

  it('cumulative buffer in updates is independent of subsequent frames', async () => {
    const params: SimulationParams = {
      photonsPerCycle: 3000,
      backgroundPerPixel: 5,
      dutyCycle: 0.005,
      nFrames: 100,
      driftRateNmPerFrame: 0,
      correctDrift: false,
      rigorMode: 'rigorous',
      pixelSizeNm: 160,
      psfSigmaNm: 130,
      fieldSizePx: { width: 16, height: 16 },
    };
    const gt = generateGroundTruth(
      { kind: 'two-lines', separationNm: 80, length: 1000, nPerLine: 50 },
      { width: 2560, height: 2560 }
    );

    const seen: Float32Array[] = [];
    await runSimulation(gt, params, {
      onProgress: () => {},
      onFrame: (u) => seen.push(u.cumulativePixels),
    });

    // Successive cumulative snapshots must be monotonically growing per
    // pixel — proves the runner isn't aliasing the same buffer into every
    // update (which would make all snapshots identical and equal to the
    // final sum).
    expect(seen.length).toBeGreaterThanOrEqual(2);
    let differs = false;
    for (let i = 0; i < seen[0].length; i++) {
      if (seen[seen.length - 1][i] > seen[0][i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  }, 30000);
});
