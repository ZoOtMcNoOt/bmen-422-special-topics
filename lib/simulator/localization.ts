import type { Frame, Localization, SimulationParams } from './types';
import { thompsonSigmaLoc } from './thompson';
import { gaussianPsfPixelIntegrated } from './psf';

/** Local-maximum search skips this many pixels at the frame border. */
const BORDER_PX = 2;
/** Fitting ROI is (2·ROI_HALF + 1)² pixels around each candidate. */
const ROI_HALF = 3;
/** Candidate threshold: b + DETECT_SIGMAS · √(b + 1). */
const DETECT_SIGMAS = 4;
/** Reject candidates whose background-subtracted ROI sum is below the larger of
 *  this and REJECT_SIGMAS · √(nPixels · b) — the noise floor of the ROI sum. */
const MIN_PHOTONS = 20;
const REJECT_SIGMAS = 4;
const GAUSS_NEWTON_ITERATIONS = 10;
const FD_DELTA_NM = 0.5;

/** Detect local maxima above threshold and fit each to a sub-pixel position. */
export function localizeFrame(frame: Frame, params: SimulationParams): Localization[] {
  const { pixels, width: W, height: H } = frame;
  const a = params.pixelSizeNm;
  const sigma = params.psfSigmaNm;
  const b = params.backgroundPerPixel;

  const thresh = b + DETECT_SIGMAS * Math.sqrt(b + 1);
  const candidates: { px: number; py: number }[] = [];
  for (let py = BORDER_PX; py < H - BORDER_PX; py++) {
    for (let px = BORDER_PX; px < W - BORDER_PX; px++) {
      const v = pixels[py * W + px];
      if (v < thresh) continue;
      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1 && isMax; dx++) {
          if ((dx || dy) && pixels[(py + dy) * W + (px + dx)] > v) isMax = false;
        }
      }
      if (isMax) candidates.push({ px, py });
    }
  }

  const roiPixels = (2 * ROI_HALF + 1) ** 2;
  const minPhotons = Math.max(MIN_PHOTONS, REJECT_SIGMAS * Math.sqrt(roiPixels * b));
  const locs: Localization[] = [];

  for (const { px, py } of candidates) {
    const xLow = Math.max(0, px - ROI_HALF);
    const xHigh = Math.min(W - 1, px + ROI_HALF);
    const yLow = Math.max(0, py - ROI_HALF);
    const yHigh = Math.min(H - 1, py + ROI_HALF);

    // Unbiased photon sum (negative residuals kept) and a positive-weighted centroid.
    let total = 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let y = yLow; y <= yHigh; y++) {
      for (let x = xLow; x <= xHigh; x++) {
        const r = pixels[y * W + x] - b;
        total += r;
        if (r > 0) {
          sx += r * (x + 0.5) * a;
          sy += r * (y + 0.5) * a;
          sw += r;
        }
      }
    }
    if (total < minPhotons || sw === 0) continue;
    let x0 = sx / sw;
    let y0 = sy / sw;

    if (params.rigorMode === 'rigorous') {
      // Fisher scoring on the Poisson log-likelihood for (x0, y0) with N and
      // σ held fixed:  θ += Σ(n/μ−1)∂μ / Σ(∂μ)²/μ.
      for (let it = 0; it < GAUSS_NEWTON_ITERATIONS; it++) {
        let gradX = 0;
        let gradY = 0;
        let hessX = 0;
        let hessY = 0;
        for (let y = yLow; y <= yHigh; y++) {
          const yl = y * a;
          const yh = (y + 1) * a;
          for (let x = xLow; x <= xHigh; x++) {
            const xl = x * a;
            const xh = (x + 1) * a;
            const mu = total * gaussianPsfPixelIntegrated(xl, xh, yl, yh, x0, y0, sigma) + b;
            const dmuDx =
              (total *
                (gaussianPsfPixelIntegrated(xl, xh, yl, yh, x0 + FD_DELTA_NM, y0, sigma) -
                  gaussianPsfPixelIntegrated(xl, xh, yl, yh, x0 - FD_DELTA_NM, y0, sigma))) /
              (2 * FD_DELTA_NM);
            const dmuDy =
              (total *
                (gaussianPsfPixelIntegrated(xl, xh, yl, yh, x0, y0 + FD_DELTA_NM, sigma) -
                  gaussianPsfPixelIntegrated(xl, xh, yl, yh, x0, y0 - FD_DELTA_NM, sigma))) /
              (2 * FD_DELTA_NM);
            const factor = pixels[y * W + x] / mu - 1;
            gradX += factor * dmuDx;
            gradY += factor * dmuDy;
            hessX += (dmuDx * dmuDx) / mu;
            hessY += (dmuDy * dmuDy) / mu;
          }
        }
        if (hessX > 0) x0 += gradX / hessX;
        if (hessY > 0) y0 += gradY / hessY;
      }
    }

    locs.push({
      x: x0,
      y: y0,
      sigmaLocNm: thompsonSigmaLoc(sigma, total, a, b),
      nPhotons: total,
      frameIndex: frame.frameIndex,
    });
  }

  return locs;
}
