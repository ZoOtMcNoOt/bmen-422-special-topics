import type { Frame, Localization, SimulationParams } from './types';
import { thompsonSigmaLoc } from './thompson';
import { gaussianPsfPixelIntegrated } from './psf';

/**
 * Find local maxima above a threshold, then fit each spot's center.
 * Returns a list of Localization records.
 */
export function localizeFrame(frame: Frame, params: SimulationParams): Localization[] {
  const { pixels, width: W, height: H } = frame;
  const a = params.pixelSizeNm;
  const sigma = params.psfSigmaNm;

  // Simple threshold: b + 4·sqrt(b+1). The `+1` inside the sqrt avoids a
  // zero threshold when backgroundPerPixel is exactly 0.
  const thresh = params.backgroundPerPixel + 4 * Math.sqrt(params.backgroundPerPixel + 1);

  const candidates: { px: number; py: number }[] = [];
  const roi = 2; // pixels around each candidate to check for local max
  for (let py = roi; py < H - roi; py++) {
    for (let px = roi; px < W - roi; px++) {
      const v = pixels[py * W + px];
      if (v < thresh) continue;
      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1 && isMax; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (pixels[(py + dy) * W + (px + dx)] > v) isMax = false;
        }
      }
      if (isMax) candidates.push({ px, py });
    }
  }

  const locs: Localization[] = [];
  const roiHalf = 3;
  for (const { px, py } of candidates) {
    const xLow = Math.max(0, px - roiHalf);
    const xHigh = Math.min(W - 1, px + roiHalf);
    const yLow = Math.max(0, py - roiHalf);
    const yHigh = Math.min(H - 1, py + roiHalf);

    // Background-subtracted ROI
    let totalPhotons = 0;
    for (let y = yLow; y <= yHigh; y++) {
      for (let x = xLow; x <= xHigh; x++) {
        totalPhotons += Math.max(0, pixels[y * W + x] - params.backgroundPerPixel);
      }
    }
    if (totalPhotons < 20) continue;

    let xEst: number;
    let yEst: number;

    if (params.rigorMode === 'pedagogical') {
      // Intensity-weighted centroid
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let y = yLow; y <= yHigh; y++) {
        for (let x = xLow; x <= xHigh; x++) {
          const w = Math.max(0, pixels[y * W + x] - params.backgroundPerPixel);
          sx += w * (x + 0.5) * a;
          sy += w * (y + 0.5) * a;
          sw += w;
        }
      }
      xEst = sx / sw;
      yEst = sy / sw;
    } else {
      // Rigorous: Gauss-Newton MLE on Poisson log-likelihood.
      // Initialize from the centroid.
      let x0 = 0;
      let y0 = 0;
      let s0 = 0;
      for (let y = yLow; y <= yHigh; y++) {
        for (let x = xLow; x <= xHigh; x++) {
          const w = Math.max(0, pixels[y * W + x] - params.backgroundPerPixel);
          x0 += w * (x + 0.5) * a;
          y0 += w * (y + 0.5) * a;
          s0 += w;
        }
      }
      x0 /= s0;
      y0 /= s0;

      // A few Gauss-Newton iterations on the Poisson log-likelihood assuming
      // fixed total photons and fixed sigma. Parameters: (x0, y0).
      const iter = 10;
      for (let it = 0; it < iter; it++) {
        let gradX = 0;
        let gradY = 0;
        let hessX = 0;
        let hessY = 0;
        for (let y = yLow; y <= yHigh; y++) {
          for (let x = xLow; x <= xHigh; x++) {
            const mu =
              totalPhotons *
                gaussianPsfPixelIntegrated(
                  x * a,
                  (x + 1) * a,
                  y * a,
                  (y + 1) * a,
                  x0,
                  y0,
                  sigma
                ) +
              params.backgroundPerPixel;
            const n = pixels[y * W + x];
            // Derivatives of mu w.r.t. x0, y0 (via finite difference, small delta)
            const delta = 0.5; // nm
            const muXp = totalPhotons *
              gaussianPsfPixelIntegrated(x * a, (x + 1) * a, y * a, (y + 1) * a, x0 + delta, y0, sigma);
            const muXm = totalPhotons *
              gaussianPsfPixelIntegrated(x * a, (x + 1) * a, y * a, (y + 1) * a, x0 - delta, y0, sigma);
            const muYp = totalPhotons *
              gaussianPsfPixelIntegrated(x * a, (x + 1) * a, y * a, (y + 1) * a, x0, y0 + delta, sigma);
            const muYm = totalPhotons *
              gaussianPsfPixelIntegrated(x * a, (x + 1) * a, y * a, (y + 1) * a, x0, y0 - delta, sigma);
            const dmuDx = (muXp - muXm) / (2 * delta);
            const dmuDy = (muYp - muYm) / (2 * delta);
            const factor = (n / mu - 1);
            gradX += factor * dmuDx;
            gradY += factor * dmuDy;
            hessX += (dmuDx * dmuDx) / mu;
            hessY += (dmuDy * dmuDy) / mu;
          }
        }
        if (hessX > 0) x0 += gradX / hessX;
        if (hessY > 0) y0 += gradY / hessY;
      }
      xEst = x0;
      yEst = y0;
    }

    const sigmaLoc = thompsonSigmaLoc(sigma, totalPhotons, a, params.backgroundPerPixel);
    locs.push({
      x: xEst,
      y: yEst,
      sigmaLocNm: sigmaLoc,
      nPhotons: totalPhotons,
      frameIndex: frame.frameIndex,
    });
  }

  return locs;
}
