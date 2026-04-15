import type { Localization } from './types';
import { erf } from './psf';

export type ReconstructionImage = {
  pixels: Float32Array;
  width: number;
  height: number;
  pixelSizeNm: number;
};

/**
 * Render a super-resolution image by splatting each localization as a
 * normalized Gaussian with width equal to its localization uncertainty.
 *
 * Each pixel's contribution is the **integral** of the Gaussian over the
 * pixel, computed analytically via erf:
 *
 *   ∫∫_pixel (1 / 2πσ²) exp(-(dx² + dy²) / 2σ²) dx dy
 *     = 0.5 · [erf((xHigh − x₀) / σ√2) − erf((xLow − x₀) / σ√2)]
 *     · 0.5 · [erf((yHigh − y₀) / σ√2) − erf((yLow − y₀) / σ√2)]
 *
 * This is important because SMLM localizations routinely have σ_loc much
 * smaller than the reconstruction pixel size (e.g. σ_loc ≈ 3 nm vs. a
 * 10 nm grid). Point-sampling the PDF at pixel centers loses ~95 % of the
 * mass when the Gaussian is sub-pixel and varies by ≥ 4× depending on
 * where the center falls within its pixel, producing a sparse salt-and-
 * pepper reconstruction instead of smooth density. Pixel-integration is
 * the same technique used inside the forward model (see `gaussianPsfPixelIntegrated`)
 * and matches what ThunderSTORM and similar SMLM packages do.
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
    // Guard against pathological zero-uncertainty locs (division by zero
    // inside erf's argument). Clamp to a sub-nanometer floor — any loc
    // with σ below this is effectively a delta function on our grid.
    const sigmaNm = Math.max(l.sigmaLocNm, 0.1);
    const cxPx = l.x / outputPixelSizeNm;
    const cyPx = l.y / outputPixelSizeNm;
    const sigmaPx = sigmaNm / outputPixelSizeNm;

    // Footprint: cover ±3σ, plus one pixel of slack so we catch the
    // bulk even when the center straddles a pixel boundary. When the
    // Gaussian is sub-pixel this still evaluates a 3×3 window, which is
    // enough because erf saturates quickly past the pixel containing
    // the center.
    const radius = Math.max(1, Math.ceil(3 * sigmaPx) + 1);
    const xMin = Math.max(0, Math.floor(cxPx - radius));
    const xMax = Math.min(W - 1, Math.ceil(cxPx + radius));
    const yMin = Math.max(0, Math.floor(cyPx - radius));
    const yMax = Math.min(H - 1, Math.ceil(cyPx + radius));

    // Pre-compute per-row / per-column erf differences to avoid redundant work.
    const invSqrt2Sigma = 1 / (sigmaPx * Math.SQRT2);
    const xErf: number[] = new Array(xMax - xMin + 2);
    for (let px = xMin; px <= xMax + 1; px++) {
      xErf[px - xMin] = erf((px - cxPx) * invSqrt2Sigma);
    }
    const yErf: number[] = new Array(yMax - yMin + 2);
    for (let py = yMin; py <= yMax + 1; py++) {
      yErf[py - yMin] = erf((py - cyPx) * invSqrt2Sigma);
    }

    for (let py = yMin; py <= yMax; py++) {
      const ey = 0.5 * (yErf[py - yMin + 1] - yErf[py - yMin]);
      if (ey <= 0) continue;
      const row = py * W;
      for (let px = xMin; px <= xMax; px++) {
        const ex = 0.5 * (xErf[px - xMin + 1] - xErf[px - xMin]);
        pixels[row + px] += ex * ey;
      }
    }
  }

  return { pixels, width: W, height: H, pixelSizeNm: outputPixelSizeNm };
}
