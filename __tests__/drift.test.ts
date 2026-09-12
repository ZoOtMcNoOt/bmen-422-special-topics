import { describe, expect, it } from 'vitest';
import { applyDriftToEmitter, computeDriftAtFrame, correctLocalizationDrift } from '@/lib/simulator/drift';
import { loc } from './fixtures';

describe('known simulated drift', () => {
  it('grows linearly with the zero-based camera frame index', () => {
    expect(computeDriftAtFrame(0, 2)).toEqual({ x: 0, y: 0 });
    expect(computeDriftAtFrame(100, 2)).toEqual({ x: 200, y: 100 });
  });

  it('shifts emitter positions without modifying the source', () => {
    const emitter = { x: 100, y: 200 };
    expect(applyDriftToEmitter(emitter, { x: 5, y: -3 })).toEqual({ x: 105, y: 197 });
    expect(emitter).toEqual({ x: 100, y: 200 });
  });

  it('subtracts the exact simulated displacement while retaining fit residuals and metadata', () => {
    const raw = [loc(101, 198), loc(256, 284, { frameIndex: 100, sigmaLocNm: 8, nPhotons: 1200 })];
    const original = structuredClone(raw);
    const corrected = correctLocalizationDrift(raw, 1.5);
    expect(corrected).toEqual([loc(101, 198), loc(106, 209, { frameIndex: 100, sigmaLocNm: 8, nPhotons: 1200 })]);
    expect(raw).toEqual(original);
  });

  it('does not infer drift from different stationary emitters appearing at different times', () => {
    const original = [loc(100, 500), loc(900, 500, { frameIndex: 100 })];
    expect(correctLocalizationDrift(original, 0)).toEqual(original);
  });

  it('corrects a single late observation without requiring a population for regression', () => {
    expect(correctLocalizationDrift([loc(110, 205, { frameIndex: 10 })], 1)).toEqual([
      loc(100, 200, { frameIndex: 10 }),
    ]);
    expect(correctLocalizationDrift([], 1)).toEqual([]);
  });

  it.each([[-1, 1], [1.5, 1], [1, Infinity], [1, NaN]])('rejects frame %s and rate %s', (frame, rate) => {
    expect(() => computeDriftAtFrame(frame, rate)).toThrow(/finite rate/);
  });
});
