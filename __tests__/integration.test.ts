import { describe, expect, it } from 'vitest';
import { matchFrameLocalizations, summarizeMatches, type MatchTotals } from '@/lib/simulator/analysis';
import { localizeFrame } from '@/lib/simulator/localization';
import { renderFrame } from '@/lib/simulator/renderFrame';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';
import { params } from './fixtures';

describe('camera, localization, and measurement integration', () => {
  it('compares matched per-axis RMS to an approximate per-axis precision on seeded observations', () => {
    const p = params({ photonsPerCycle: 3000, backgroundPerPixel: 5, fieldSizePx: { width: 32, height: 32 } });
    const emitter = { x: (32 * 160) / 2 + 37, y: (32 * 160) / 2 - 21 };
    const field = { width: 32 * p.pixelSizeNm, height: 32 * p.pixelSizeNm };
    let seed = 3107;
    const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const totals: MatchTotals = { matchedCount: 0, activeEmitterFrames: 0, falsePositiveCount: 0, squaredErrorSumNm2: 0 };

    for (let frame = 0; frame < 200; frame++) {
      const detections = localizeFrame(renderFrame([emitter], p, frame, rng), p);
      const measured = matchFrameLocalizations(detections, [emitter], frame, field, p.psfSigmaNm);
      totals.matchedCount += measured.matchedCount;
      totals.activeEmitterFrames += measured.activeEmitterFrames;
      totals.falsePositiveCount += measured.falsePositiveCount;
      totals.squaredErrorSumNm2 += measured.squaredErrorSumNm2;
    }
    const metrics = summarizeMatches(totals, p.psfSigmaNm);
    expect(metrics.matchedCount).toBeGreaterThan(180);
    expect(metrics.activeEmitterFrames).toBe(200);
    expect(metrics.falsePositiveCount).toBe(0);
    expect(metrics.rmsPerAxisErrorNm).not.toBeNull();
    const sigma = thompsonSigmaLoc(p.psfSigmaNm, p.photonsPerCycle, p.pixelSizeNm, p.backgroundPerPixel);
    // Both quantities are per-axis; TLW remains an approximation rather than an exact bound.
    const ratio = metrics.rmsPerAxisErrorNm! / sigma;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.3);
  });
});
