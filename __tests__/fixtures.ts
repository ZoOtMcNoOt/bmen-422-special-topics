import { DEFAULT_PARAMS, FIELD_SIZE_NM } from '@/lib/simulator/defaults';
import type { Localization, SimulationParams } from '@/lib/simulator/types';

export const FIELD = { width: FIELD_SIZE_NM, height: FIELD_SIZE_NM };
export const CENTER_NM = FIELD_SIZE_NM / 2;

/** Bright, low-background, single-frame defaults for unit tests; override as needed. */
export const params = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
  ...DEFAULT_PARAMS,
  photonsPerCycle: 5000,
  backgroundPerPixel: 2,
  nFrames: 1,
  correctDrift: false,
  ...overrides,
});

export const loc = (x: number, y: number, extra: Partial<Localization> = {}): Localization => ({
  x,
  y,
  sigmaLocNm: 3,
  nPhotons: 3000,
  frameIndex: 0,
  ...extra,
});

export const distance = (l: { x: number; y: number }, x: number, y: number) => Math.hypot(l.x - x, l.y - y);

export const nearestTo = <T extends { x: number; y: number }>(points: readonly T[], x: number, y: number): T =>
  points.reduce((best, p) => (distance(p, x, y) < distance(best, x, y) ? p : best));

export const sum = (a: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
};

/** Index of the largest element. */
export const argmax = (a: ArrayLike<number>) => {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
};

/** Left half black, right half white. */
export function halfWhiteImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = x < width / 2 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

export function blackImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return new ImageData(data, width, height);
}
