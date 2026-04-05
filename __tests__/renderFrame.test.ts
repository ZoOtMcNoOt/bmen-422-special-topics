import { describe, it, expect } from 'vitest';
import { renderFrame } from '@/lib/simulator/renderFrame';
import type { Emitter, SimulationParams } from '@/lib/simulator/types';

const baseParams: SimulationParams = {
  photonsPerCycle: 3000,
  backgroundPerPixel: 0,
  dutyCycle: 0.001,
  nFrames: 1,
  driftRateNmPerFrame: 0,
  correctDrift: false,
  rigorMode: 'rigorous',
  pixelSizeNm: 160,
  psfSigmaNm: 130,
  fieldSizePx: { width: 64, height: 64 },
};

describe('renderFrame', () => {
  it('empty emitters list produces a pure background frame', () => {
    const frame = renderFrame([], baseParams, 0);
    expect(frame.pixels.length).toBe(64 * 64);
    for (let i = 0; i < frame.pixels.length; i++) {
      expect(frame.pixels[i]).toBe(0);
    }
  });

  it('single emitter produces a localized bright spot', () => {
    const fieldCenterNm = (64 * 160) / 2;
    const emitters: Emitter[] = [{ x: fieldCenterNm, y: fieldCenterNm }];
    const frame = renderFrame(emitters, { ...baseParams, backgroundPerPixel: 0 }, 0);

    // Center pixel should have the highest count
    let maxVal = 0;
    let maxIdx = 0;
    for (let i = 0; i < frame.pixels.length; i++) {
      if (frame.pixels[i] > maxVal) {
        maxVal = frame.pixels[i];
        maxIdx = i;
      }
    }
    const cx = maxIdx % 64;
    const cy = Math.floor(maxIdx / 64);
    expect(Math.abs(cx - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(cy - 32)).toBeLessThanOrEqual(1);
  });

  it('total photons in frame approximately equals N (shot noise)', () => {
    const fieldCenterNm = (64 * 160) / 2;
    const emitters: Emitter[] = [{ x: fieldCenterNm, y: fieldCenterNm }];
    const params = { ...baseParams, photonsPerCycle: 5000, backgroundPerPixel: 0 };
    const frame = renderFrame(emitters, params, 0);
    let total = 0;
    for (let i = 0; i < frame.pixels.length; i++) total += frame.pixels[i];
    // Should be near 5000, with Poisson sqrt-N noise
    expect(total).toBeGreaterThan(4600);
    expect(total).toBeLessThan(5400);
  });
});
