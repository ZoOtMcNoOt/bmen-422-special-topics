import { describe, expect, it } from 'vitest';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { CENTER_NM, FIELD, blackImage, halfWhiteImage } from './fixtures';

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
  });
});
