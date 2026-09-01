import { describe, expect, it } from 'vitest';
import { reconstructImage } from '@/lib/simulator/reconstruction';
import type { ViewBox } from '@/lib/simulator/types';
import { argmax, loc, sum } from './fixtures';

const view: ViewBox = { x0: 0, y0: 0, sizeNm: 5000 };
const renderPx = 500; // 10 nm per render pixel
const at = (x: number, y: number, sigmaLocNm = 10) => loc(x, y, { sigmaLocNm });

describe('reconstructImage', () => {
  it('produces a renderPx × renderPx image with the peak under the localization', () => {
    const img = reconstructImage([at(2500, 2500)], view, renderPx);
    expect(img).toHaveLength(renderPx * renderPx);
    const peak = argmax(img);
    expect(Math.abs((peak % renderPx) - 250)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.floor(peak / renderPx) - 250)).toBeLessThanOrEqual(1);
  });

  it('deposits unit mass per localization (to within the 3σ footprint cutoff)', () => {
    const locs = Array.from({ length: 100 }, (_, i) => at(1000 + i * 30, 2500));
    expect(sum(reconstructImage(locs, view, renderPx))).toBeCloseTo(100, 1);
  });

  it('conserves unit mass for a sub-pixel σ at every sub-pixel offset', () => {
    // σ = 3 nm on a 10 nm grid: point sampling would vary by ≥ 4× here.
    const masses = Array.from({ length: 10 }, (_, k) => sum(reconstructImage([at(2500 + k, 2500 + k * 0.7, 3)], view, renderPx)));
    for (const m of masses) expect(m).toBeCloseTo(1, 3);
    expect(Math.max(...masses) / Math.min(...masses)).toBeLessThan(1.001);
  });

  it('respects the view box: localizations outside contribute nothing and never throw', () => {
    const outside = [at(-500, 2500), at(5500, 2500), at(2500, -500), at(2500, 5500), at(1e6, 1e6)];
    expect(sum(reconstructImage(outside, view, renderPx))).toBe(0);
  });

  it('offsets by the view origin', () => {
    const cropped: ViewBox = { x0: 2000, y0: 2000, sizeNm: 1000 };
    const peak = argmax(reconstructImage([at(2500, 2500)], cropped, 100));
    expect(Math.abs((peak % 100) - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.floor(peak / 100) - 50)).toBeLessThanOrEqual(1);
  });

  it('returns all zeros for no localizations', () => {
    expect(sum(reconstructImage([], view, renderPx))).toBe(0);
  });
});
