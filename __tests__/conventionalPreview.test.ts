import { describe, expect, it } from 'vitest';
import { conventionalPreview } from '@/lib/rendering/conventionalPreview';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { PRESETS, viewBoxFor } from '@/lib/presets';
import type { ViewBox } from '@/lib/simulator/types';

const view: ViewBox = { x0: 0, y0: 0, sizeNm: 2000 };
const field = { width: 10240, height: 10240 };

describe('ideal conventional fluorescence preview', () => {
  it.each([80, 130, 200])('preserves a point PSF sigma of %i nm in the physical view', (sigma) => {
    const { pixels, sizePx } = conventionalPreview([{ x: 1000, y: 1000 }], view, sigma);
    let mass = 0, xMoment = 0, xVariance = 0;
    for (let y = 0; y < sizePx; y++) {
      for (let x = 0; x < sizePx; x++) {
        const weight = pixels[y * sizePx + x];
        const position = (x + 0.5) * view.sizeNm / sizePx;
        mass += weight;
        xMoment += weight * position;
        xVariance += weight * (position - 1000) ** 2;
      }
    }
    // The finite, pixel-aligned cutoff can retain one extra tail pixel on one side.
    expect(Math.abs(xMoment / mass - 1000)).toBeLessThan(0.002 * sigma);
    // Three-sigma truncation and 8-bit display quantization remove faint tails.
    expect(Math.abs(Math.sqrt(xVariance / mass) / sigma - 1)).toBeLessThan(0.025);
  });

  it('keeps the same optical image when the specimen and crop move together', () => {
    const points = [{ x: 800, y: 950 }, { x: 1400, y: 1200 }];
    const original = conventionalPreview(points, view, 130);
    const shifted = conventionalPreview(
      points.map(({ x, y }) => ({ x: x + 4845, y: y + 3240 })),
      { ...view, x0: 4845, y0: 3240 }, 130,
    );
    expect(shifted).toEqual(original);
  });

  it('includes PSF light from emitters just outside the crop without wrapping at the far edge', () => {
    const { pixels, sizePx } = conventionalPreview([{ x: -80, y: 1000 }], view, 130);
    const row = Math.floor(sizePx / 2) * sizePx;
    expect(pixels[row]).toBeGreaterThan(250);
    expect(pixels[row + 10]).toBeGreaterThan(0);
    expect(pixels[row + sizePx - 1]).toBe(0);
  });

  it('merges the 50 nm lines into a single optical band with the 130 nm PSF', () => {
    const truth = generateGroundTruth(PRESETS['two-lines'].build(1000, null)!, field);
    const { pixels, sizePx } = conventionalPreview(truth.emitters, viewBoxFor('two-lines'), 130);
    const column = Array.from({ length: sizePx }, (_, y) => pixels[y * sizePx + Math.floor(sizePx / 2)]);
    const middle = Math.floor(sizePx / 2);
    expect(column[middle]).toBe(255);
    for (let y = 1; y < middle; y++) expect(column[y]).toBeGreaterThanOrEqual(column[y - 1]);
    for (let y = middle + 1; y < sizePx; y++) expect(column[y]).toBeLessThanOrEqual(column[y - 1]);
  });

  it('shows the 60 nm ring as a filled spot, even at the 10,000-emitter UI limit', () => {
    const truth = generateGroundTruth(PRESETS.ring.build(10000, null)!, field);
    const { pixels, sizePx } = conventionalPreview(truth.emitters, viewBoxFor('ring'), 130);
    const middle = Math.floor(sizePx / 2);
    expect(pixels[middle * sizePx + middle]).toBe(255);
    expect(pixels[middle * sizePx + middle + 10]).toBeLessThan(200);
    expect(pixels).toHaveLength(sizePx ** 2);
    expect(sizePx).toBeLessThanOrEqual(512);
  });

  it('leaves empty or distant samples dark and rejects invalid optical geometry', () => {
    expect(conventionalPreview([], view, 130).pixels.every((v) => v === 0)).toBe(true);
    expect(conventionalPreview([{ x: -1e6, y: 0 }], view, 130).pixels.every((v) => v === 0)).toBe(true);
    expect(() => conventionalPreview([], view, 0)).toThrow(RangeError);
    expect(() => conventionalPreview([], { ...view, x0: NaN }, 130)).toThrow(RangeError);
    expect(() => conventionalPreview([], { ...view, sizeNm: Infinity }, 130)).toThrow(RangeError);
  });
});
