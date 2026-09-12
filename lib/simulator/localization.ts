import type { Frame, Localization, SimulationParams } from './types';
import { thompsonSigmaLoc } from './thompson';
import { gaussianPsfPixelIntegrated, gaussianPsfPixelIntegratedGradient } from './psf';

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
const FISHER_SCORING_ITERATIONS = 10;
/** One camera spot may have multiple equal or noise-split maxima. */
const MIN_SEPARATION_PX = 2;

/** Detect local maxima above threshold and fit each to a sub-pixel position. */
export function localizeFrame(frame: Frame, params: SimulationParams): Localization[] {
  const { pixels, width: W, height: H } = frame;
  const a = params.pixelSizeNm;
  const sigma = params.psfSigmaNm;
  const b = params.backgroundPerPixel;
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(sigma) || sigma <= 0 || !Number.isFinite(b) || b < 0) {
    throw new RangeError('Localization requires positive finite pixel/PSF sizes and non-negative finite background');
  }

  const thresh = b + DETECT_SIGMAS * Math.sqrt(b + 1);
  const candidates: { px: number; py: number }[] = [];
  for (let py = BORDER_PX; py < H - BORDER_PX; py++) {
    for (let px = BORDER_PX; px < W - BORDER_PX; px++) {
      const v = pixels[py * W + px];
      if (!Number.isFinite(v) || v < thresh) continue;
      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1 && isMax; dx++) {
          if ((dx || dy) && pixels[(py + dy) * W + (px + dx)] > v) isMax = false;
        }
      }
      if (isMax) candidates.push({ px, py });
    }
  }

  candidates.sort((first, second) =>
    pixels[second.py * W + second.px] - pixels[first.py * W + first.px] || first.py - second.py || first.px - second.px
  );
  const separated: typeof candidates = [];
  for (const candidate of candidates) {
    if (separated.every((other) =>
      (candidate.px - other.px) ** 2 + (candidate.py - other.py) ** 2 >= MIN_SEPARATION_PX ** 2
    )) separated.push(candidate);
  }
  const locs: Localization[] = [];

  for (const { px, py } of separated) {
    const xLow = Math.max(0, px - ROI_HALF);
    const xHigh = Math.min(W - 1, px + ROI_HALF);
    const yLow = Math.max(0, py - ROI_HALF);
    const yHigh = Math.min(H - 1, py + ROI_HALF);
    const roiPixels = (xHigh - xLow + 1) * (yHigh - yLow + 1);
    const minPhotons = Math.max(MIN_PHOTONS, REJECT_SIGMAS * Math.sqrt(roiPixels * b));

    // Unbiased photon sum (negative residuals kept) and a positive-weighted centroid.
    let total = 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    let valid = true;
    for (let y = yLow; y <= yHigh; y++) {
      for (let x = xLow; x <= xHigh; x++) {
        if (!Number.isFinite(pixels[y * W + x]) || pixels[y * W + x] < 0) {
          valid = false;
          continue;
        }
        const r = pixels[y * W + x] - b;
        total += r;
        if (r > 0) {
          sx += r * (x + 0.5) * a;
          sy += r * (y + 0.5) * a;
          sw += r;
        }
      }
    }
    if (!valid || total < minPhotons || sw === 0) continue;
    let x0 = sx / sw;
    let y0 = sy / sw;
    let photons = total;
    const insideRoi = (x: number, y: number) =>
      Number.isFinite(x) && Number.isFinite(y) &&
      x >= xLow * a && x < (xHigh + 1) * a && y >= yLow * a && y < (yHigh + 1) * a;
    const capturedFraction = (x: number, y: number) =>
      gaussianPsfPixelIntegrated(xLow * a, (xHigh + 1) * a, yLow * a, (yHigh + 1) * a, x, y, sigma);

    if (params.rigorMode === 'rigorous') {
      // Position-only Fisher scoring with known background and PSF width.
      // The ROI sum measures captured photons; calibrate it to the whole PSF
      // at each position. This remains a moment estimate of N, not a joint MLE.
      for (let it = 0; it < FISHER_SCORING_ITERATIONS; it++) {
        const fraction = capturedFraction(x0, y0);
        if (!Number.isFinite(fraction) || fraction <= 0) {
          valid = false;
          break;
        }
        photons = total / fraction;
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
            const psf = gaussianPsfPixelIntegratedGradient(xl, xh, yl, yh, x0, y0, sigma);
            const mu = photons * psf.value + b;
            // Exact zero-probability pixels carry no information when also empty.
            if (mu <= 0 && pixels[y * W + x] === 0) continue;
            if (!Number.isFinite(mu) || mu <= 0) {
              valid = false;
              break;
            }
            const dmuDx = photons * psf.dx;
            const dmuDy = photons * psf.dy;
            const factor = pixels[y * W + x] / mu - 1;
            gradX += factor * dmuDx;
            gradY += factor * dmuDy;
            hessX += (dmuDx * dmuDx) / mu;
            hessY += (dmuDy * dmuDy) / mu;
          }
        }
        if (!valid || !Number.isFinite(hessX) || !Number.isFinite(hessY) || hessX <= 0 || hessY <= 0) {
          valid = false;
          break;
        }
        x0 += gradX / hessX;
        y0 += gradY / hessY;
        if (!insideRoi(x0, y0)) {
          valid = false;
          break;
        }
      }
      photons = total / capturedFraction(x0, y0);
    }

    const sigmaLocNm = thompsonSigmaLoc(sigma, photons, a, b);
    if (!valid || !insideRoi(x0, y0) || !Number.isFinite(photons) || photons <= 0 || !Number.isFinite(sigmaLocNm)) continue;
    // Separate noisy maxima may still converge to the same emitter within a frame.
    if (locs.some((previous) => Math.hypot(previous.x - x0, previous.y - y0) < 0.5 * a)) continue;
    locs.push({
      x: x0,
      y: y0,
      sigmaLocNm,
      nPhotons: photons,
      frameIndex: frame.frameIndex,
    });
  }

  return locs;
}
