import { describe, expect, it } from 'vitest';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { runSimulation, type LiveUpdate } from '@/lib/simulator/runSimulation';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';
import { FIELD, params } from './fixtures';

const gt = generateGroundTruth({ kind: 'two-lines', separationNm: 100, lengthNm: 2000, nPerLine: 30 }, FIELD);
const p = params({ photonsPerCycle: 3000, backgroundPerPixel: 5, dutyCycle: 0.02, nFrames: 200 });

describe('runSimulation', () => {
  it('refuses a ground truth whose field does not match the camera footprint', async () => {
    const wrong = generateGroundTruth({ kind: 'ring', diameterNm: 60, nEmitters: 10 }, { width: 10_000, height: 10_000 });
    await expect(runSimulation(wrong, p)).rejects.toThrow(/camera footprint/);
  });

  it('produces a sparse-regime result: Thompson-consistent σ, most blinks detected', async () => {
    const r = await runSimulation(gt, p);
    expect(r.localizations.length).toBeGreaterThan(50);
    // ~1 molecule ON per frame over 64² px, so overlaps are rare and the
    // fitter's own σ should sit close to the isolated-molecule prediction.
    const predicted = thompsonSigmaLoc(p.psfSigmaNm, p.photonsPerCycle, p.pixelSizeNm, p.backgroundPerPixel);
    expect(r.apparentSigmaLocNm / predicted).toBeGreaterThan(0.75);
    expect(r.apparentSigmaLocNm / predicted).toBeLessThan(1.35);
    // True error is a few nm: above σ (crowding, drift-free) but far below a pixel.
    expect(r.empiricalPrecisionNm).toBeGreaterThan(1);
    expect(r.empiricalPrecisionNm).toBeLessThan(30);
    expect(r.detectionEfficiency).toBeGreaterThan(0.6);
    expect(r.detectionEfficiency).toBeLessThanOrEqual(1);
  });

  it('snapshots what it ran with', async () => {
    const r = await runSimulation(gt, p);
    expect(r.params).toBe(p);
    expect(r.groundTruth).toBe(gt);
    expect(r.framesCompleted).toBe(p.nFrames);
  });

  it('returns localizations sorted by frame', async () => {
    const r = await runSimulation(gt, p);
    for (let i = 1; i < r.localizations.length; i++) {
      expect(r.localizations[i].frameIndex).toBeGreaterThanOrEqual(r.localizations[i - 1].frameIndex);
    }
  });

  it('streams independent, growing snapshots and ends on the final frame', async () => {
    const updates: LiveUpdate[] = [];
    const r = await runSimulation(gt, p, { onUpdate: (u) => updates.push(u) });
    expect(updates.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i].framesCompleted).toBeGreaterThan(updates[i - 1].framesCompleted);
    }
    const last = updates[updates.length - 1];
    expect(last.framesCompleted).toBe(p.nFrames);
    expect(last.localizations).toHaveLength(r.localizations.length);
    expect(updates[0].localizations.length).toBeLessThan(last.localizations.length);
  });

  it('stops early when aborted and reports how far it got', async () => {
    const controller = new AbortController();
    const r = await runSimulation(gt, p, {
      onUpdate: (u) => u.framesCompleted >= 50 && controller.abort(),
      signal: controller.signal,
    });
    expect(r.framesCompleted).toBeGreaterThanOrEqual(50);
    expect(r.framesCompleted).toBeLessThan(p.nFrames);
    expect(r.localizations.length).toBeGreaterThan(0);
  });
});
