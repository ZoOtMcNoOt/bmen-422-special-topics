import { splatGaussians } from '@/lib/simulator/splat';
import type { Emitter, ViewBox } from '@/lib/simulator/types';

/**
 * Expected fluorescence from all emitters, with the acquisition's Gaussian PSF.
 * This is an ideal optical image: no blinking, stage motion, background, shot
 * noise, or camera sampling. Intensity is normalized to the brightest point in
 * this crop, so brightness cannot be compared to the acquired camera frames.
 */
export function conventionalPreview(
  emitters: readonly Emitter[],
  view: ViewBox,
  psfSigmaNm: number,
): { pixels: Uint8Array; sizePx: number } {
  if (!Number.isFinite(psfSigmaNm) || psfSigmaNm <= 0 ||
      !Number.isFinite(view.sizeNm) || view.sizeNm <= 0 ||
      !Number.isFinite(view.x0) || !Number.isFinite(view.y0)) {
    throw new RangeError('Optical PSF and view size must be finite and positive, with finite view offsets');
  }

  // Sample the optical blur finely without tying computation to the screen DPR.
  // The bounded grid is reused during playback; interpolation only scales its
  // display. Gaussian integration also includes light from outside the crop.
  const sizePx = Math.min(512, Math.max(48, Math.ceil(8 * view.sizeNm / psfSigmaNm)));
  const intensity = splatGaussians(
    emitters.map(({ x, y }) => ({ x, y, sigmaNm: psfSigmaNm })),
    view,
    sizePx,
  );
  let peak = 0;
  for (const value of intensity) peak = Math.max(peak, value);
  const pixels = new Uint8Array(intensity.length);
  if (peak > 0) {
    for (let i = 0; i < pixels.length; i++)
      pixels[i] = Math.round(255 * intensity[i] / peak);
  }
  return { pixels, sizePx };
}
