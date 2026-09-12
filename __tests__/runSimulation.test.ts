import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { runSimulation, type LiveUpdate } from '@/lib/simulator/runSimulation';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';
import * as blinking from '@/lib/simulator/photoswitching';
import * as fitting from '@/lib/simulator/localization';
import * as camera from '@/lib/simulator/renderFrame';
import type { Frame } from '@/lib/simulator/types';
import { FIELD, loc, params } from './fixtures';

const gt = generateGroundTruth({ kind: 'two-lines', separationNm: 100, lengthNm: 2000, nPerLine: 30 }, FIELD);
const p = params({ photonsPerCycle: 3000, backgroundPerPixel: 5, dutyCycle: 0.02, nFrames: 200 });
const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

afterEach(() => vi.restoreAllMocks());

describe('runSimulation', () => {
  it('refuses ground truth whose field does not match the camera footprint', async () => {
    const wrong = generateGroundTruth({ kind: 'ring', diameterNm: 60, nEmitters: 10 }, { width: 10_000, height: 10_000 });
    await expect(runSimulation(wrong, p)).rejects.toThrow(/camera footprint/);
  });

  it.each([
    { nFrames: 10_001 },
    { nFrames: -1 },
    { nFrames: 1.5 },
    { fieldSizePx: { width: 65, height: 64 } },
    { fieldSizePx: { width: 0, height: 64 } },
  ])('rejects acquisitions outside the bounded preview budget: %j', async (overrides) => {
    await expect(runSimulation(gt, { ...p, ...overrides })).rejects.toThrow(/display budget/);
  });

  it('keeps frame order and count history, averaging raw counts before display clipping', async () => {
    const frames: Frame[] = [
      { pixels: Float32Array.from([0, 10, 50, 200]), width: 2, height: 2, frameIndex: 0 },
      { pixels: Float32Array.from([0, 30, 100, 0]), width: 2, height: 2, frameIndex: 1 },
    ];
    const render = vi.spyOn(camera, 'renderFrame').mockImplementation((_active, _params, frameIndex) => frames[frameIndex]);
    const fit = vi.spyOn(fitting, 'localizeFrame').mockImplementation((frame) => frame.frameIndex === 0 ? [loc(50, 50)] : []);
    let step = 0;
    vi.spyOn(blinking, 'stepPhotoswitching').mockImplementation((states) => {
      step++;
      states[0].isOn = true;
      states[1].isOn = step === 22;
    });
    const truth = { emitters: [{ x: 50, y: 50 }, { x: 150, y: 150 }], fieldSizeNm: { width: 200, height: 200 }, label: 'preview fixture' };
    const acquisition = params({ nFrames: 2, fieldSizePx: { width: 2, height: 2 }, pixelSizeNm: 100, photonsPerCycle: 0, backgroundPerPixel: 100, driftRateNmPerFrame: 10, correctDrift: true });
    const updates: LiveUpdate[] = [];
    const result = await runSimulation(truth, acquisition, { onUpdate: (u) => updates.push(u), rng: seeded(1) });

    // A fixed 100-photon camera scale: identical counts have identical brightness across frames.
    expect(result.preview).toEqual({ width: 2, height: 2, toneMap: 'linear', cameraCeilingPhotons: 100, widefieldCeilingPhotons: 100 });
    expect(Array.from(result.cameraFrames)).toEqual([0, 26, 128, 255, 0, 77, 255, 0]);
    // The raw mean is [0, 20, 75, 100], including the first frame's clipped 200-photon pixel.
    expect(Array.from(result.widefield)).toEqual([0, 51, 191, 255]);
    expect(result.activePerFrame).toEqual([1, 2]);
    expect(result.countsPerFrame).toEqual([1, 0]);
    expect(fit.mock.calls[0][0]).toBe(frames[0]);
    expect(fit.mock.calls[1][0]).toBe(frames[1]);
    expect(Array.from(frames[0].pixels)).toEqual([0, 10, 50, 200]);
    expect(render.mock.calls[1][0]).toEqual([{ x: 60, y: 55 }, { x: 160, y: 155 }]);
    expect(updates).toHaveLength(1);
    expect(updates[0].cameraFrame).toEqual(result.cameraFrames.slice(4));
    expect(updates[0].widefield).toEqual(result.widefield);
    expect(updates[0].newFrameStats).toEqual({ startFrame: 0, activePerFrame: [1, 2], countsPerFrame: [1, 0] });
  });

  it('reports matched localization error and accounts for every fit and active emitter-frame', async () => {
    const r = await runSimulation(gt, p, { rng: seeded(12) });
    expect(r.localizations.length).toBeGreaterThan(50);
    const predicted = thompsonSigmaLoc(p.psfSigmaNm, p.photonsPerCycle, p.pixelSizeNm, p.backgroundPerPixel);
    expect(r.apparentSigmaLocNm).not.toBeNull();
    expect(r.apparentSigmaLocNm! / predicted).toBeGreaterThan(0.75);
    expect(r.apparentSigmaLocNm! / predicted).toBeLessThan(1.35);
    expect(r.metrics.rmsPerAxisErrorNm).toBeGreaterThan(0);
    expect(r.metrics.rmsPerAxisErrorNm).toBeLessThan(40);
    expect(r.metrics.detectionRecall).toBeGreaterThan(0.6);
    expect(r.metrics.detectionRecall).toBeLessThanOrEqual(1);
    expect(r.metrics.matchedCount + r.metrics.falsePositiveCount).toBe(r.localizations.length);
    expect(r.metrics.matchedCount + r.metrics.missedCount).toBe(r.metrics.activeEmitterFrames);
    expect(r.metrics.matchRadiusNm).toBe(p.psfSigmaNm);
    expect(r.rawLocalizations).toEqual(r.localizations);
  });

  it('repeats the same acquisition with an injected seeded generator', async () => {
    const first = await runSimulation(gt, p, { rng: seeded(23) });
    const second = await runSimulation(gt, p, { rng: seeded(23) });
    expect(second.rawLocalizations).toEqual(first.rawLocalizations);
    expect(second.metrics).toEqual(first.metrics);
    expect(second.cameraFrames).toEqual(first.cameraFrames);
    expect(second.widefield).toEqual(first.widefield);
    expect(second.params).toBe(p);
    expect(second.groundTruth).toBe(gt);
    expect(second.framesCompleted).toBe(p.nFrames);
  });

  it('returns localizations sorted by frame', async () => {
    const r = await runSimulation(gt, p, { rng: seeded(34) });
    for (let i = 1; i < r.localizations.length; i++) {
      expect(r.localizations[i].frameIndex).toBeGreaterThanOrEqual(r.localizations[i - 1].frameIndex);
    }
  });

  it('streams independent growing arrays and reports the final acquired frame', async () => {
    const updates: LiveUpdate[] = [];
    const acquisition = { ...p, nFrames: 123 };
    const r = await runSimulation(gt, acquisition, { onUpdate: (u) => updates.push(u), rng: seeded(45) });
    expect(updates.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i].framesCompleted).toBeGreaterThan(updates[i - 1].framesCompleted);
      expect(updates[i].localizations).not.toBe(updates[i - 1].localizations);
    }
    const last = updates[updates.length - 1];
    expect(last.framesCompleted).toBe(acquisition.nFrames);
    expect(last.localizations).toEqual(r.localizations);
    expect(updates[0].localizations.length).toBeLessThan(last.localizations.length);
    const active: number[] = [];
    const counts: number[] = [];
    for (const update of updates) {
      expect(update.newFrameStats.startFrame).toBe(active.length);
      expect(update.newFrameStats.activePerFrame.length).toBeLessThanOrEqual(50);
      expect(update.newFrameStats.countsPerFrame.length).toBe(update.newFrameStats.activePerFrame.length);
      active.push(...update.newFrameStats.activePerFrame);
      counts.push(...update.newFrameStats.countsPerFrame);
      expect(active.length).toBe(update.framesCompleted);
      const pixelsPerFrame = p.fieldSizePx.width * p.fieldSizePx.height;
      expect(update.cameraFrame).toEqual(r.cameraFrames.slice((update.framesCompleted - 1) * pixelsPerFrame, update.framesCompleted * pixelsPerFrame));
    }
    expect(active).toEqual(r.activePerFrame);
    expect(counts).toEqual(r.countsPerFrame);
    expect(counts.reduce((total, count) => total + count, 0)).toBe(r.localizations.length);
    expect(last.widefield).toEqual(r.widefield);
    expect(last.newFrameStats.activePerFrame).toHaveLength(23);
  });

  it('retains raw fits and applies known drift consistently to live and final display coordinates', async () => {
    const drifting = { ...p, nFrames: 100, driftRateNmPerFrame: 2.5 };
    const raw = await runSimulation(gt, { ...drifting, correctDrift: false }, { rng: seeded(56) });
    const updates: LiveUpdate[] = [];
    const corrected = await runSimulation(gt, { ...drifting, correctDrift: true }, {
      rng: seeded(56), onUpdate: (update) => updates.push(update),
    });
    expect(corrected.rawLocalizations).toEqual(raw.localizations);
    expect(corrected.metrics).toEqual(raw.metrics);
    expect(corrected.cameraFrames).toEqual(raw.cameraFrames);
    expect(corrected.widefield).toEqual(raw.widefield);
    expect(updates[updates.length - 1].localizations).toEqual(corrected.localizations);
    corrected.localizations.forEach((point, index) => {
      const original = corrected.rawLocalizations[index];
      expect(point.x).toBeCloseTo(original.x - point.frameIndex * 2.5, 9);
      expect(point.y).toBeCloseTo(original.y - point.frameIndex * 1.25, 9);
    });
  });

  it('does not borrow inactive truth or reuse an emitter for duplicate detections', async () => {
    let step = 0;
    vi.spyOn(blinking, 'stepPhotoswitching').mockImplementation((states) => {
      step++;
      states[0].isOn = step === 21;
      states[1].isOn = step === 22;
    });
    vi.spyOn(fitting, 'localizeFrame').mockImplementation((frame) => frame.frameIndex === 0
      ? [loc(900, 900)]
      : [loc(900, 900, { frameIndex: 1 }), loc(900, 900, { frameIndex: 1 })]);
    const truth = { emitters: [{ x: 100, y: 100 }, { x: 900, y: 900 }], fieldSizeNm: FIELD, label: 'alternating emitters' };
    const result = await runSimulation(truth, { ...p, nFrames: 2 }, { rng: seeded(67) });
    expect(result.metrics).toEqual({
      rmsPerAxisErrorNm: 0, matchedCount: 1, activeEmitterFrames: 2, missedCount: 1,
      falsePositiveCount: 2, detectionRecall: 0.5, falsePositiveRate: 2 / 3, matchRadiusNm: p.psfSigmaNm,
    });
  });

  it('stops early when aborted and measures only the acquired frames', async () => {
    const controller = new AbortController();
    const r = await runSimulation(gt, p, {
      onUpdate: (u) => u.framesCompleted >= 50 && controller.abort(),
      signal: controller.signal,
      rng: seeded(78),
    });
    expect(r.framesCompleted).toBe(50);
    expect(r.localizations.length).toBeGreaterThan(0);
    expect(r.rawLocalizations.every((point) => point.frameIndex < 50)).toBe(true);
    const sameFrames = await runSimulation(gt, { ...p, nFrames: 50 }, { rng: seeded(78) });
    expect(r.metrics).toEqual(sameFrames.metrics);
    expect(r.rawLocalizations).toEqual(sameFrames.rawLocalizations);
    expect(r.cameraFrames).toEqual(sameFrames.cameraFrames);
    expect(r.cameraFrames.buffer.byteLength).toBe(50 * p.fieldSizePx.width * p.fieldSizePx.height);
    expect(r.widefield).toEqual(sameFrames.widefield);
    expect(r.preview).toEqual(sameFrames.preview);
    expect(r.activePerFrame).toEqual(sameFrames.activePerFrame);
    expect(r.countsPerFrame).toEqual(sameFrames.countsPerFrame);
  });

  it('reports unavailable measurements when stopped before the first frame', async () => {
    const controller = new AbortController();
    controller.abort();
    const updates: LiveUpdate[] = [];
    const r = await runSimulation(gt, p, { signal: controller.signal, rng: seeded(89), onUpdate: (u) => updates.push(u) });
    expect(r.framesCompleted).toBe(0);
    expect(r.rawLocalizations).toEqual([]);
    expect(r.apparentSigmaLocNm).toBeNull();
    expect(r.metrics.rmsPerAxisErrorNm).toBeNull();
    expect(r.metrics.detectionRecall).toBeNull();
    expect(r.metrics.falsePositiveRate).toBeNull();
    expect(r.cameraFrames).toHaveLength(0);
    expect(r.cameraFrames.buffer.byteLength).toBe(0);
    expect(r.widefield).toEqual(new Uint8Array(p.fieldSizePx.width * p.fieldSizePx.height));
    expect(r.preview.widefieldCeilingPhotons).toBe(0);
    expect(r.activePerFrame).toEqual([]);
    expect(r.countsPerFrame).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0].cameraFrame).toBeNull();
    expect(updates[0].widefield).toBeNull();
    expect(updates[0].newFrameStats).toEqual({ startFrame: 0, activePerFrame: [], countsPerFrame: [] });
  });
});
