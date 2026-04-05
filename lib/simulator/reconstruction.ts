import type { Localization } from './types';

export type ReconstructionImage = {
  pixels: Float32Array;
  width: number;
  height: number;
  pixelSizeNm: number;
};

/**
 * Render a super-resolution image by splatting each localization as a normalized Gaussian
 * with width equal to its localization uncertainty.
 */
export function reconstructImage(
  locs: Localization[],
  options: {
    fieldSizeNm: { width: number; height: number };
    outputPixelSizeNm: number;
  }
): ReconstructionImage {
  const { fieldSizeNm, outputPixelSizeNm } = options;
  const W = Math.round(fieldSizeNm.width / outputPixelSizeNm);
  const H = Math.round(fieldSizeNm.height / outputPixelSizeNm);
  const pixels = new Float32Array(W * H);

  for (const l of locs) {
    const sigmaPx = l.sigmaLocNm / outputPixelSizeNm;
    const cx = l.x / outputPixelSizeNm;
    const cy = l.y / outputPixelSizeNm;
    const radius = Math.ceil(3 * sigmaPx) + 1;
    const xMin = Math.max(0, Math.floor(cx - radius));
    const xMax = Math.min(W - 1, Math.ceil(cx + radius));
    const yMin = Math.max(0, Math.floor(cy - radius));
    const yMax = Math.min(H - 1, Math.ceil(cy + radius));
    const norm = 1 / (2 * Math.PI * sigmaPx * sigmaPx);
    for (let py = yMin; py <= yMax; py++) {
      for (let px = xMin; px <= xMax; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const r2 = dx * dx + dy * dy;
        pixels[py * W + px] += norm * Math.exp(-r2 / (2 * sigmaPx * sigmaPx));
      }
    }
  }

  return { pixels, width: W, height: H, pixelSizeNm: outputPixelSizeNm };
}
