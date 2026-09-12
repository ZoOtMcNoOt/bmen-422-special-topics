import { describe, expect, it } from 'vitest';
import { FIELD_SIZE_NM } from '@/lib/simulator/defaults';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import type { GroundTruthInput } from '@/lib/simulator/types';
import { MAX_EMITTERS, PRESETS, PRESET_KINDS, isPresetKind, viewBoxFor } from '@/lib/presets';
import { FIELD, halfWhiteImage } from './fixtures';

function build(kind: (typeof PRESET_KINDS)[number], n: number, image: ImageData | null = null): GroundTruthInput {
  const input = PRESETS[kind].build(n, image ? { pixels: image, width: image.width, height: image.height } : null);
  if (!input) throw new Error(`${kind} produced no input`);
  return input;
}

describe('presets', () => {
  it('every preset produces exactly its displayed default molecule count', () => {
    for (const kind of PRESET_KINDS) {
      const n = PRESETS[kind].defaultEmitters;
      expect(generateGroundTruth(build(kind, n, halfWhiteImage(16, 16)), FIELD).emitters).toHaveLength(n);
    }
  });

  it('the image preset needs an image', () => {
    expect(PRESETS.image.build(100, null)).toBeNull();
  });

  it('changing the count changes the actual labels without a hidden camera-area multiplier', () => {
    for (const kind of PRESET_KINDS) {
      for (const n of [20, 100, 250, 500, MAX_EMITTERS]) {
        expect(generateGroundTruth(build(kind, n, halfWhiteImage(16, 16)), FIELD).emitters).toHaveLength(n);
      }
    }
  });

  it('fixed view boxes are square, centred, and inside the field', () => {
    for (const kind of PRESET_KINDS) {
      const v = viewBoxFor(kind);
      expect(v.x0).toBe(v.y0);
      expect(v.x0 + v.sizeNm / 2).toBeCloseTo(FIELD_SIZE_NM / 2, 6);
      expect(v.x0).toBeGreaterThanOrEqual(0);
      expect(v.x0 + v.sizeNm).toBeLessThanOrEqual(FIELD_SIZE_NM);
    }
  });

  it('every built-in structure fits inside its view box', () => {
    for (const kind of ['two-lines', 'ring', 'actin'] as const) {
      const gt = generateGroundTruth(build(kind, 1000), FIELD);
      const v = viewBoxFor(kind);
      for (const axis of ['x', 'y'] as const) {
        const coordinates = gt.emitters.map((e) => e[axis]);
        const origin = axis === 'x' ? v.x0 : v.y0;
        expect(Math.min(...coordinates)).toBeGreaterThan(origin);
        expect(Math.max(...coordinates)).toBeLessThan(origin + v.sizeNm);
      }
    }
  });

  it('keeps the entire source image in view, including unlabelled regions', () => {
    expect(viewBoxFor('image')).toEqual({ x0: 0, y0: 0, sizeNm: FIELD_SIZE_NM });
  });

  it('isPresetKind guards the union', () => {
    expect(isPresetKind('ring')).toBe(true);
    expect(isPresetKind('microtubule-ring')).toBe(false);
    expect(isPresetKind(null)).toBe(false);
  });
});
