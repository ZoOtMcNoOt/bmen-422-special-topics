import { describe, it, expect } from 'vitest';
import { runSimulation } from '@/lib/simulator/runSimulation';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import type { SimulationParams } from '@/lib/simulator/types';

describe('runSimulation', () => {
  it('produces a reconstruction and matches Thompson prediction within 50%', async () => {
    const gt = generateGroundTruth(
      { kind: 'two-lines', separationNm: 100, length: 2000, nPerLine: 30 },
      { width: 10000, height: 10000 }
    );
    const params: SimulationParams = {
      photonsPerCycle: 3000,
      backgroundPerPixel: 5,
      dutyCycle: 0.02,
      nFrames: 200,
      driftRateNmPerFrame: 0,
      correctDrift: false,
      rigorMode: 'rigorous',
      pixelSizeNm: 160,
      psfSigmaNm: 130,
      fieldSizePx: { width: 64, height: 64 },
    };
    const result = await runSimulation(gt, params, { onProgress: () => {} });
    expect(result.localizations.length).toBeGreaterThan(10);
    expect(result.reconstruction.length).toBeGreaterThan(0);
    expect(result.measuredSigmaLocNm).toBeGreaterThan(0);
    expect(result.predictedSigmaLocNm).toBeGreaterThan(0);
    const ratio = result.measuredSigmaLocNm / result.predictedSigmaLocNm;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.0);
  }, 30000);
});
