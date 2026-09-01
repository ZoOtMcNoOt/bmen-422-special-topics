import { describe, expect, it } from 'vitest';
import { FIELD_SIZE_NM } from '@/lib/simulator/defaults';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import type { GroundTruthInput } from '@/lib/simulator/types';
import { MAX_EMITTERS, PRESETS, PRESET_KINDS, emitterCount, isPresetKind, viewBoxFor } from '@/lib/presets';
import { FIELD, halfWhiteImage } from './fixtures';

function build(kind: (typeof PRESET_KINDS)[number], n: number, image: ImageData | null = null): GroundTruthInput {
  const input = PRESETS[kind].build(n, image);
  if (!input) throw new Error(`${kind} produced no input`);
  return input;
}

describe('presets', () => {
  it('every preset builds a ground truth with emitters', () => {
    for (const kind of PRESET_KINDS) {
      expect(generateGroundTruth(build(kind, emitterCount(250), halfWhiteImage(16, 16)), FIELD).emitters.length).toBeGreaterThan(0);
    }
  });

  it('the image preset needs an image', () => {
    expect(PRESETS.image.build(100, null)).toBeNull();
  });

  it('caps the emitter count', () => {
    expect(emitterCount(1e6)).toBe(MAX_EMITTERS);
    expect(emitterCount(0)).toBe(0);
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
      // Lines are longer than the view on purpose; check the axis that matters.
      const ys = gt.emitters.map((e) => e.y);
      expect(Math.min(...ys)).toBeGreaterThan(v.y0);
      expect(Math.max(...ys)).toBeLessThan(v.y0 + v.sizeNm);
    }
  });

  it('fits the image view to the molecules, padded, square, and inside the field', () => {
    const emitters = [{ x: 3000, y: 4000 }, { x: 5000, y: 4000 }, { x: 4000, y: 4500 }];
    const v = viewBoxFor('image', emitters);
    expect(v.sizeNm).toBeCloseTo(2000 * 1.2, 6);
    for (const e of emitters) {
      expect(e.x).toBeGreaterThan(v.x0);
      expect(e.x).toBeLessThan(v.x0 + v.sizeNm);
      expect(e.y).toBeGreaterThan(v.y0);
      expect(e.y).toBeLessThan(v.y0 + v.sizeNm);
    }
    // A single point never zooms below the floor, and clusters at the edge stay inside the field.
    expect(viewBoxFor('image', [{ x: 5000, y: 5000 }]).sizeNm).toBe(500);
    const edge = viewBoxFor('image', [{ x: 10, y: 10 }, { x: 40, y: 40 }]);
    expect(edge.x0).toBe(0);
    expect(edge.y0).toBe(0);
  });

  it('isPresetKind guards the union', () => {
    expect(isPresetKind('ring')).toBe(true);
    expect(isPresetKind('microtubule-ring')).toBe(false);
    expect(isPresetKind(null)).toBe(false);
  });
});
