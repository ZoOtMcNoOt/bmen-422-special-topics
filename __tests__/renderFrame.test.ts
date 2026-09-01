import { describe, expect, it } from 'vitest';
import { renderFrame } from '@/lib/simulator/renderFrame';
import { CENTER_NM, argmax, params, sum } from './fixtures';

describe('renderFrame', () => {
  it('is all zeros with no emitters and no background', () => {
    const frame = renderFrame([], params({ backgroundPerPixel: 0 }), 0);
    expect(frame.pixels).toHaveLength(64 * 64);
    expect(sum(frame.pixels)).toBe(0);
  });

  it('puts the brightest pixel under the emitter', () => {
    const frame = renderFrame([{ x: CENTER_NM + 80, y: CENTER_NM + 80 }], params({ backgroundPerPixel: 0 }), 0);
    const peak = argmax(frame.pixels);
    expect(peak % 64).toBe(Math.floor((CENTER_NM + 80) / 160));
    expect(Math.floor(peak / 64)).toBe(Math.floor((CENTER_NM + 80) / 160));
  });

  it.each(['rigorous', 'pedagogical'] as const)('conserves photons in %s mode (total ≈ N)', (rigorMode) => {
    const frame = renderFrame([{ x: CENTER_NM + 37, y: CENTER_NM - 21 }], params({ backgroundPerPixel: 0, rigorMode }), 0);
    // Poisson: 5000 ± 71; ±400 is 5.7σ.
    expect(sum(frame.pixels)).toBeGreaterThan(4600);
    expect(sum(frame.pixels)).toBeLessThan(5400);
  });

  it('adds b photons per pixel of background on average', () => {
    const frame = renderFrame([], params({ backgroundPerPixel: 20 }), 0);
    expect(sum(frame.pixels) / frame.pixels.length).toBeCloseTo(20, 0); // ±0.5; SE is 0.07
  });
});
