import { describe, expect, it } from 'vitest';
import { pickScaleBar } from '@/lib/rendering/scaleBar';

describe('pickScaleBar', () => {
  it.each([
    [500, 100, '100 nm'],
    [1000, 200, '200 nm'],
    [2000, 500, '500 nm'],
    [10_240, 2000, '2 µm'],
    [60, 20, '20 nm'],
    [25, 5, '5 nm'],
  ])('view %d nm → %d nm bar labelled %s', (view, barNm, label) => {
    const bar = pickScaleBar(view);
    expect(bar.barNm).toBe(barNm);
    expect(bar.label).toBe(label);
  });

  it('never exceeds a third of the view, at any scale', () => {
    for (let view = 3; view < 1e6; view *= 1.37) {
      const { fraction, barNm } = pickScaleBar(view);
      expect(fraction).toBeLessThanOrEqual(1 / 3 + 1e-12);
      expect(fraction).toBeGreaterThan(1 / 15); // a 1/2/5 ladder never leaves a gap wider than 5×
      expect([1, 2, 5]).toContain(barNm / 10 ** Math.floor(Math.log10(barNm)));
    }
  });
});
