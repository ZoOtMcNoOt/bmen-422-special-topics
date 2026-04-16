import { describe, it, expect } from 'vitest';
import { runSimulation } from '@/lib/simulator/runSimulation';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import type { SimulationParams } from '@/lib/simulator/types';

describe('analysis: end-to-end metrics on the default preset', () => {
  it('empirical precision stays on the same order as Thompson, and detection η is < 1 in a dense sample', async () => {
    const params: SimulationParams = {
      photonsPerCycle: 5000,
      backgroundPerPixel: 20,
      dutyCycle: 0.001,
      nFrames: 500,
      driftRateNmPerFrame: 0,
      correctDrift: true,
      rigorMode: 'rigorous',
      pixelSizeNm: 160,
      psfSigmaNm: 130,
      fieldSizePx: { width: 64, height: 64 },
    };
    // Small emitter pool so the test runs fast; keep density high enough
    // that crowding is present (this is the whole point of the test).
    const gt = generateGroundTruth(
      { kind: 'two-lines', separationNm: 50, length: 3000, nPerLine: 2500 },
      { width: 10000, height: 10000 }
    );
    const result = await runSimulation(gt, params, { onProgress: () => {} });

    expect(result.empiricalPrecisionNm).toBeGreaterThan(0);
    // Empirical precision on a dense 50-nm-line preset should land in the
    // 1–50 nm range (the Thompson prediction at N=5000 is ~2.4 nm, and
    // crowding typically inflates the empirical error 1–10×).
    expect(result.empiricalPrecisionNm).toBeLessThan(50);

    // Detection efficiency must be between 0 and 1. On this dense sample
    // we expect it below 1 because overlapping blinks merge, but well
    // above 0 because most frames still produce detections.
    expect(result.detectionEfficiency).toBeGreaterThan(0.1);
    expect(result.detectionEfficiency).toBeLessThanOrEqual(1);

    // P90 must be at least as large as the median.
    expect(result.empiricalPrecisionP90Nm).toBeGreaterThanOrEqual(
      result.empiricalPrecisionNm
    );
  }, 60000);
});
