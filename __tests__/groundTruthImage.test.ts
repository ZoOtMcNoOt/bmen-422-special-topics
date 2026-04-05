import { describe, it, expect } from 'vitest';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';

function makeGradientImageData(width: number, height: number): ImageData {
  // Left half black, right half white — simple bimodal
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const v = x < width / 2 ? 0 : 255;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('generateGroundTruth — image', () => {
  it('produces the requested number of emitters', () => {
    const img = makeGradientImageData(64, 64);
    const gt = generateGroundTruth(
      { kind: 'image', imageData: img, nEmitters: 500 },
      { width: 10000, height: 10000 }
    );
    expect(gt.emitters.length).toBe(500);
  });

  it('emitters are sampled preferentially from bright regions', () => {
    const img = makeGradientImageData(64, 64); // left half black, right half white
    const gt = generateGroundTruth(
      { kind: 'image', imageData: img, nEmitters: 1000 },
      { width: 10000, height: 10000 }
    );
    // Count emitters in right half of field
    const rightCount = gt.emitters.filter((e) => e.x > 5000).length;
    expect(rightCount).toBeGreaterThan(950); // nearly all should be on the bright side
  });

  it('all emitters fall within the field of view', () => {
    const img = makeGradientImageData(64, 64);
    const gt = generateGroundTruth(
      { kind: 'image', imageData: img, nEmitters: 200 },
      { width: 10000, height: 10000 }
    );
    for (const e of gt.emitters) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(10000);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeLessThanOrEqual(10000);
    }
  });
});
