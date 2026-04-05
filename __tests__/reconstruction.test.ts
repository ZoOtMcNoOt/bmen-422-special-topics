import { describe, it, expect } from 'vitest';
import { reconstructImage } from '@/lib/simulator/reconstruction';
import type { Localization } from '@/lib/simulator/types';

describe('reconstructImage', () => {
  it('places a bright peak where a localization exists', () => {
    const locs: Localization[] = [
      { x: 2500, y: 2500, sigmaLocNm: 10, nPhotons: 3000, frameIndex: 0 },
    ];
    const out = reconstructImage(locs, {
      fieldSizeNm: { width: 5000, height: 5000 },
      outputPixelSizeNm: 10,
    });
    // Expected output: 500x500
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    // Peak should be near (250, 250) in output
    let maxVal = 0;
    let maxIdx = 0;
    for (let i = 0; i < out.pixels.length; i++) {
      if (out.pixels[i] > maxVal) {
        maxVal = out.pixels[i];
        maxIdx = i;
      }
    }
    const peakX = maxIdx % 500;
    const peakY = Math.floor(maxIdx / 500);
    expect(Math.abs(peakX - 250)).toBeLessThanOrEqual(2);
    expect(Math.abs(peakY - 250)).toBeLessThanOrEqual(2);
  });

  it('many localizations accumulate', () => {
    const locs: Localization[] = [];
    for (let i = 0; i < 100; i++) {
      locs.push({ x: 2500, y: 2500, sigmaLocNm: 10, nPhotons: 3000, frameIndex: i });
    }
    const out = reconstructImage(locs, {
      fieldSizeNm: { width: 5000, height: 5000 },
      outputPixelSizeNm: 10,
    });
    let total = 0;
    for (let i = 0; i < out.pixels.length; i++) total += out.pixels[i];
    // Each localization contributes mass 1, so total ≈ 100
    expect(total).toBeGreaterThan(90);
    expect(total).toBeLessThan(110);
  });

  it('empty localization list produces an all-zero image', () => {
    const out = reconstructImage([], {
      fieldSizeNm: { width: 1000, height: 1000 },
      outputPixelSizeNm: 10,
    });
    for (let i = 0; i < out.pixels.length; i++) expect(out.pixels[i]).toBe(0);
  });
});
