import { describe, expect, it } from 'vitest';
import { generateGroundTruth, imageBounds, imageHasSignal } from '@/lib/simulator/groundTruth';
import { CENTER_NM, FIELD, blackImage, halfWhiteImage } from './fixtures';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Evenly spaced distribution draws, followed by the two pixel-center draws. */
function quantiles(count: number): () => number {
  let call = 0;
  return () => {
    const index = call++;
    return index % 3 === 0 ? (Math.floor(index / 3) + 0.5) / count : 0.5;
  };
}

describe('generateGroundTruth', () => {
  describe('two-lines', () => {
    const gt = generateGroundTruth({ kind: 'two-lines', separationNm: 50, lengthNm: 2000, nPerLine: 100 }, FIELD);

    it('produces 2 × nPerLine emitters', () => {
      expect(gt.emitters).toHaveLength(200);
    });
    it('puts them on two lines exactly separationNm apart, centred on the field', () => {
      const ys = [...new Set(gt.emitters.map((e) => e.y))].sort((a, b) => a - b);
      expect(ys).toEqual([CENTER_NM - 25, CENTER_NM + 25]);
    });
    it('spans lengthNm in x', () => {
      const xs = gt.emitters.map((e) => e.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2000, 6);
    });
  });

  describe('ring', () => {
    it('places every emitter on a circle of the given diameter', () => {
      const gt = generateGroundTruth({ kind: 'ring', diameterNm: 60, nEmitters: 100 }, FIELD);
      expect(gt.emitters).toHaveLength(100);
      for (const e of gt.emitters) expect(Math.hypot(e.x - CENTER_NM, e.y - CENTER_NM)).toBeCloseTo(30, 8);
    });
  });

  describe('actin', () => {
    it('lays out nRungs rungs at periodNm spacing', () => {
      const gt = generateGroundTruth({ kind: 'actin', periodNm: 190, rungLengthNm: 400, nRungs: 10, nPerRung: 20 }, FIELD);
      expect(gt.emitters).toHaveLength(200);
      const xs = [...new Set(gt.emitters.map((e) => e.x))].sort((a, b) => a - b);
      expect(xs).toHaveLength(10);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(190, 8);
    });
  });

  describe('image', () => {
    it('samples the requested count, only from bright pixels, inside the field', () => {
      const gt = generateGroundTruth({ kind: 'image', imageData: halfWhiteImage(64, 64), nEmitters: 1000 }, FIELD);
      expect(gt.emitters).toHaveLength(1000);
      for (const e of gt.emitters) {
        expect(e.x).toBeGreaterThan(CENTER_NM); // the white half
        expect(e.x).toBeLessThanOrEqual(FIELD.width);
        expect(e.y).toBeGreaterThanOrEqual(0);
        expect(e.y).toBeLessThanOrEqual(FIELD.height);
      }
    });

    it('letterboxes a non-square image, preserving aspect ratio', () => {
      // 128 wide × 32 tall: the image spans the full field width and is centred vertically.
      const gt = generateGroundTruth({ kind: 'image', imageData: halfWhiteImage(128, 32), nEmitters: 2000 }, FIELD);
      const ys = gt.emitters.map((e) => e.y);
      const bandNm = FIELD.width / 4; // 32/128 of the width
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(CENTER_NM - bandNm / 2);
      expect(Math.max(...ys)).toBeLessThanOrEqual(CENTER_NM + bandNm / 2);
    });

    it('throws on an all-black image', () => {
      expect(() => generateGroundTruth({ kind: 'image', imageData: blackImage(8, 8), nEmitters: 10 }, FIELD)).toThrow(
        /no bright pixels/
      );
    });

    it('ignores RGB values under full transparency, including zero-weight CDF boundaries', () => {
      const imageData = new ImageData(new Uint8ClampedArray([
        255, 255, 255, 0,
        0, 0, 255, 255,
        255, 255, 255, 0,
        0, 0, 0, 255,
      ]), 4, 1);
      const gt = generateGroundTruth({ kind: 'image', imageData, nEmitters: 20 }, FIELD, () => 0);
      expect(imageHasSignal(imageData)).toBe(true);
      expect(gt.emitters).toHaveLength(20);
      for (const e of gt.emitters) {
        expect(e).toEqual({ x: FIELD.width / 4, y: (FIELD.height - FIELD.width / 4) / 2 });
      }
    });

    it('rejects a fully transparent white image as having no signal', () => {
      const imageData = new ImageData(new Uint8ClampedArray([255, 255, 255, 0]), 1, 1);
      expect(imageHasSignal(imageData)).toBe(false);
      expect(imageHasSignal(blackImage(8, 8))).toBe(false);
      expect(() => generateGroundTruth({ kind: 'image', imageData, nEmitters: 10 }, FIELD)).toThrow(/no bright pixels/);
    });

    it('weights equal RGB pixels in proportion to their visible alpha', () => {
      const imageData = new ImageData(new Uint8ClampedArray([
        255, 255, 255, 64,
        255, 255, 255, 192,
      ]), 2, 1);
      const gt = generateGroundTruth({ kind: 'image', imageData, nEmitters: 1000 }, FIELD, quantiles(1000));
      expect(gt.emitters.filter((e) => e.x < FIELD.width / 2)).toHaveLength(250);
      expect(gt.emitters.filter((e) => e.x > FIELD.width / 2)).toHaveLength(750);
    });

    it('weights opaque color pixels by luminance rather than an RGB average', () => {
      const imageData = new ImageData(new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
      ]), 3, 1);
      const gt = generateGroundTruth({ kind: 'image', imageData, nEmitters: 10000 }, FIELD, quantiles(10000));
      const counts = [0, 0, 0];
      for (const e of gt.emitters) counts[Math.floor(e.x / FIELD.width * 3)]++;
      expect(counts).toEqual([2126, 7152, 722]);
    });

    it('always supplies the requested labels from one bright pixel in a sparse image', () => {
      const width = 512;
      const data = new Uint8ClampedArray(width * width * 4);
      data.set([255, 255, 255, 255], (235 * width + 499) * 4);
      const imageData = new ImageData(data, width, width);
      const input = { kind: 'image', imageData, nEmitters: 1000 } as const;
      const first = generateGroundTruth(input, FIELD, seeded(871));
      const repeat = generateGroundTruth(input, FIELD, seeded(871));
      expect(first.emitters).toHaveLength(1000);
      expect(repeat).toEqual(first);
      for (const e of first.emitters) {
        expect(e.x).toBeGreaterThanOrEqual(499 / width * FIELD.width);
        expect(e.x).toBeLessThan(500 / width * FIELD.width);
        expect(e.y).toBeGreaterThanOrEqual(235 / width * FIELD.height);
        expect(e.y).toBeLessThan(236 / width * FIELD.height);
      }
    });

    it.each([
      [{ width: 10000, height: 1 }, 512, 1, { x0: 0, y0: 2999.5, width: 10000, height: 1 }],
      [{ width: 1, height: 10000 }, 1, 512, { x0: 4999.7, y0: 0, width: 0.6, height: 6000 }],
    ])('retains original physical aspect ratio after extreme downsampling (%j)', (sourceSize, width, height, expected) => {
      const field = { width: 10000, height: 6000 };
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      const imageData = new ImageData(data, width, height);
      const gt = generateGroundTruth({ kind: 'image', imageData, sourceSize, nEmitters: 100 }, field, seeded(492));
      expect(imageBounds(sourceSize, field)).toEqual(expected);
      for (const e of gt.emitters) {
        expect(e.x).toBeGreaterThanOrEqual(expected.x0);
        expect(e.x).toBeLessThan(expected.x0 + expected.width);
        expect(e.y).toBeGreaterThanOrEqual(expected.y0);
        expect(e.y).toBeLessThan(expected.y0 + expected.height);
      }
    });

    it.each([-1, 1.5, NaN])('rejects an invalid requested count: %s', (nEmitters) => {
      expect(() => generateGroundTruth({ kind: 'image', imageData: halfWhiteImage(2, 1), nEmitters }, FIELD)).toThrow(/emitter count/);
    });

    it.each([-0.1, 1, NaN])('rejects invalid random draws instead of creating out-of-bounds labels: %s', (value) => {
      expect(() => generateGroundTruth({ kind: 'image', imageData: halfWhiteImage(2, 1), nEmitters: 1 }, FIELD, () => value)).toThrow(/random generator/);
    });
  });
});
