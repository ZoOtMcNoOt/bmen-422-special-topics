import { describe, expect, it } from 'vitest';
import { localizeFrame } from '@/lib/simulator/localization';
import { renderFrame } from '@/lib/simulator/renderFrame';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';
import { CENTER_NM, distance, nearestTo, params } from './fixtures';

describe('localizeFrame', () => {
  it('finds an isolated emitter to within a few nm', () => {
    const p = params();
    const x = CENTER_NM + 40;
    const y = CENTER_NM - 30;
    const locs = localizeFrame(renderFrame([{ x, y }], p, 0), p);
    expect(locs.length).toBeGreaterThanOrEqual(1);
    expect(distance(nearestTo(locs, x, y), x, y)).toBeLessThan(15);
  });

  it('returns nothing for a blank frame', () => {
    const p = params({ backgroundPerPixel: 0 });
    expect(localizeFrame(renderFrame([], p, 0), p)).toHaveLength(0);
  });

  it('rejects background noise: no false detections at b = 20 over 20 frames', () => {
    const p = params({ backgroundPerPixel: 20 });
    let falsePositives = 0;
    for (let f = 0; f < 20; f++) falsePositives += localizeFrame(renderFrame([], p, f), p).length;
    expect(falsePositives).toBe(0);
  });

  it('merges two emitters 50 nm apart into one detection at their midpoint', () => {
    const p = params();
    const x = CENTER_NM + 40;
    const locs = localizeFrame(renderFrame([{ x, y: CENTER_NM - 25 }, { x, y: CENTER_NM + 25 }], p, 0), p);
    const merged = nearestTo(locs, x, CENTER_NM);
    expect(Math.abs(merged.y - CENTER_NM)).toBeLessThan(15);
    // The ROI sums both molecules' photons.
    expect(merged.nPhotons).toBeGreaterThan(1.5 * p.photonsPerCycle);
    expect(merged.nPhotons).toBeLessThan(2.5 * p.photonsPerCycle);
  });

  it('resolves two emitters 800 nm apart as separate detections', () => {
    const p = params();
    const a = { x: CENTER_NM - 400, y: CENTER_NM };
    const b = { x: CENTER_NM + 400, y: CENTER_NM };
    const locs = localizeFrame(renderFrame([a, b], p, 0), p);
    expect(distance(nearestTo(locs, a.x, a.y), a.x, a.y)).toBeLessThan(15);
    expect(distance(nearestTo(locs, b.x, b.y), b.x, b.y)).toBeLessThan(15);
  });

  it('reports a Thompson σ consistent with the photons it counted', () => {
    const p = params();
    const [loc] = localizeFrame(renderFrame([{ x: CENTER_NM, y: CENTER_NM }], p, 0), p);
    expect(loc.sigmaLocNm).toBeCloseTo(thompsonSigmaLoc(p.psfSigmaNm, loc.nPhotons, p.pixelSizeNm, p.backgroundPerPixel), 10);
  });

  it('the realistic fit is no worse than the centroid on a bright isolated molecule', () => {
    // At high SNR both estimators are near the Thompson limit (~2 nm), so the
    // mean errors agree to within noise; this guards against the MLE regressing.
    const x = CENTER_NM + 30;
    const y = CENTER_NM + 30;
    let centroid = 0;
    let mle = 0;
    const trials = 60;
    for (let t = 0; t < trials; t++) {
      for (const rigorMode of ['pedagogical', 'rigorous'] as const) {
        const p = params({ rigorMode });
        const locs = localizeFrame(renderFrame([{ x, y }], p, t), p);
        const err = distance(nearestTo(locs, x, y), x, y);
        if (rigorMode === 'pedagogical') centroid += err;
        else mle += err;
      }
    }
    expect(mle / trials).toBeLessThan(centroid / trials + 0.75);
  });
});
