import type { Frame, Localization, SimulationParams } from './types';
import { thompsonSigmaLoc } from './thompson';
import { gaussianPsfPixelIntegrated, gaussianPsfPixelIntegratedGradient, gaussianPsfPoint } from './psf';

/** Local-maximum search skips this many pixels at the frame border. */
const BORDER_PX = 2;
/** Circular ROI inside at least a 5×5 box, with a two-sigma radius for wider
 * PSFs, rounded outward by half a camera pixel. Finite capture is modeled below.
 * Excluding distant square corners
 * avoids rejecting clean central spots because a neighbor lights up a corner. */
const ROI_SIGMAS = 2;
/** Candidate threshold: b + DETECT_SIGMAS · √(b + 1). */
const DETECT_SIGMAS = 4;
/** Reject candidates whose background-subtracted ROI sum is below the larger of
 *  this and REJECT_SIGMAS · √(nPixels · b) — the noise floor of the ROI sum. */
const MIN_PHOTONS = 20;
const REJECT_SIGMAS = 4;
const FISHER_SCORING_ITERATIONS = 10;
/** One camera spot may have multiple equal or noise-split maxima. */
const MIN_SEPARATION_PX = 2;
/** Two-tail brightness screening budget over all candidate pixels in a frame. */
const BRIGHTNESS_FALSE_ALARM = 0.001;
/** Normal quantile for the approximate 0.1% upper-tail chi-square shape test. */
const SHAPE_Z = 3.090232306;
type RoiPixel = { x: number; y: number; count: number };

/** Twice the Poisson log-likelihood ratio against a saturated pixel model. */
function poissonDeviance(observed: number, expected: number): number {
  if (expected <= 0) return observed === 0 ? 0 : Infinity;
  if (observed === 0) return 2 * expected;
  return Math.max(0, 2 * (observed * Math.log(observed / expected) - observed + expected));
}

/** Pixel integration conserves at most one PSF's photon mass. Point sampling
 * can exceed one: bound its infinite lattice sum using the Gaussian's Fourier
 * series, with exp(-c k²) <= exp(-c k). This keeps the educational mode's
 * sampling approximation from being mistaken for excess emitter brightness. */
function photonMassBound(sigma: number, pixelSize: number, rigorous: boolean): number {
  if (rigorous) return 1;
  const exponent = 2 * Math.PI ** 2 * (sigma / pixelSize) ** 2;
  const denominator = -Math.expm1(-exponent);
  return ((2 - denominator) / denominator) ** 2;
}

function hasCompatibleShape(deviance: number, pixels: number): boolean {
  // Wilson-Hilferty approximation to chi-square's upper 0.1% quantile.
  // Keep all pixel degrees of freedom (do not deduct fitted parameters): the
  // photon estimate is a moment estimate, and centroid mode is not an MLE.
  // This is a conservative model-consistency screen, not a resolution test.
  const threshold = pixels * (1 - 2 / (9 * pixels) + SHAPE_Z * Math.sqrt(2 / (9 * pixels))) ** 3;
  return Number.isFinite(deviance) && deviance <= threshold;
}

/** Detect local maxima above threshold and fit each to a sub-pixel position. */
export function localizeFrame(frame: Frame, params: SimulationParams): Localization[] {
  const { pixels, width: W, height: H } = frame;
  const a = params.pixelSizeNm;
  const sigma = params.psfSigmaNm;
  const b = params.backgroundPerPixel;
  const meanPhotons = params.photonsPerCycle;
  const rigorous = params.rigorMode === 'rigorous';
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(sigma) || sigma <= 0 ||
      !Number.isFinite(b) || b < 0 || !Number.isFinite(meanPhotons) || meanPhotons <= 0) {
    throw new RangeError('Localization requires positive finite pixel/PSF sizes and photon yield, and non-negative finite background');
  }
  // A raw centroid needs the wider square window to avoid truncation bias;
  // rigorous fitting explicitly models the smaller window's lost PSF mass.
  const roiHalf = Math.max(2, Math.ceil((rigorous ? ROI_SIGMAS : 3) * sigma / a));
  const singlePhotonBound = meanPhotons * photonMassBound(sigma, a, rigorous);
  const brightnessLimit = Math.log(2 * W * H / BRIGHTNESS_FALSE_ALARM);

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
    const xLow = Math.max(0, px - roiHalf);
    const xHigh = Math.min(W - 1, px + roiHalf);
    const yLow = Math.max(0, py - roiHalf);
    const yHigh = Math.min(H - 1, py + roiHalf);
    const roi: RoiPixel[] = [];
    for (let y = yLow; y <= yHigh; y++) {
      for (let x = xLow; x <= xHigh; x++) {
        if (!rigorous || (x - px) ** 2 + (y - py) ** 2 <= (roiHalf + 0.5) ** 2) roi.push({ x, y, count: pixels[y * W + x] });
      }
    }
    const roiPixels = roi.length;
    const minPhotons = Math.max(MIN_PHOTONS, REJECT_SIGMAS * Math.sqrt(roiPixels * b));

    // Unbiased photon sum (negative residuals kept) and a positive-weighted centroid.
    let total = 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    let valid = true;
    for (const { x, y, count } of roi) {
      if (!Number.isFinite(count) || count < 0) {
        valid = false;
        continue;
      }
      const r = count - b;
      total += r;
      if (r > 0) {
        sx += r * (x + 0.5) * a;
        sy += r * (y + 0.5) * a;
        sw += r;
      }
    }
    if (!valid || total < minPhotons || sw === 0) continue;
    const observedCounts = total + roiPixels * b;
    const singleCountsBound = singlePhotonBound + roiPixels * b;
    // Fits stay within one pixel of the candidate center. The central 3×3
    // pixels are always included, so this is a position-independent lower
    // capture bound. It rejects dim noise/tail fits of a calibrated bright dye.
    const minimumMass = rigorous
      ? gaussianPsfPixelIntegrated(-1.5 * a, 1.5 * a, -1.5 * a, 1.5 * a, a, a, sigma)
      : gaussianPsfPoint(a / 2, a / 2, sigma) * a * a;
    const minimumSingleCounts = meanPhotons * minimumMass + roiPixels * b;
    // The simulator gives every molecule the same calibrated mean photon yield.
    // A Poisson Chernoff bound rejects counts incompatible with ONE such molecule.
    // Using full PSF mass is conservative for every position and cropped ROI;
    // the frame-pixel budget covers data-dependent choice of a candidate ROI.
    // This cannot be applied unchanged to experimentally variable brightness.
    if (observedCounts > singleCountsBound &&
        poissonDeviance(observedCounts, singleCountsBound) / 2 > brightnessLimit) continue;
    if (observedCounts < minimumSingleCounts &&
        poissonDeviance(observedCounts, minimumSingleCounts) / 2 > brightnessLimit) continue;
    let x0 = sx / sw;
    let y0 = sy / sw;
    let photons = total;
    const insideRoi = (x: number, y: number) =>
      Number.isFinite(x) && Number.isFinite(y) &&
      Math.abs(x - (px + 0.5) * a) <= a && Math.abs(y - (py + 0.5) * a) <= a;
    const capturedFraction = (x: number, y: number) => {
      let mass = 0;
      for (const pixel of roi) {
        mass += gaussianPsfPixelIntegrated(pixel.x * a, (pixel.x + 1) * a, pixel.y * a, (pixel.y + 1) * a, x, y, sigma);
      }
      return mass;
    };

    if (rigorous) {
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
        for (const { x, y, count } of roi) {
          const yl = y * a;
          const yh = (y + 1) * a;
          const xl = x * a;
          const xh = (x + 1) * a;
          const psf = gaussianPsfPixelIntegratedGradient(xl, xh, yl, yh, x0, y0, sigma);
          const mu = photons * psf.value + b;
          // Exact zero-probability pixels carry no information when also empty.
          if (mu <= 0 && count === 0) continue;
          if (!Number.isFinite(mu) || mu <= 0) {
            valid = false;
            break;
          }
          const dmuDx = photons * psf.dx;
          const dmuDy = photons * psf.dy;
          const factor = count / mu - 1;
          gradX += factor * dmuDx;
          gradY += factor * dmuDy;
          hessX += (dmuDx * dmuDx) / mu;
          hessY += (dmuDy * dmuDy) / mu;
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
    } else {
      let fraction = 0;
      for (const { x, y } of roi) {
        fraction += gaussianPsfPoint((x + 0.5) * a - x0, (y + 0.5) * a - y0, sigma) * a * a;
      }
      photons = total / fraction;
    }

    const sigmaLocNm = thompsonSigmaLoc(sigma, photons, a, b);
    if (!valid || !insideRoi(x0, y0) || !Number.isFinite(photons) || photons <= 0 || !Number.isFinite(sigmaLocNm)) continue;
    let deviance = 0;
    for (const { x, y, count } of roi) {
      const mass = rigorous
        ? gaussianPsfPixelIntegrated(x * a, (x + 1) * a, y * a, (y + 1) * a, x0, y0, sigma)
        : gaussianPsfPoint((x + 0.5) * a - x0, (y + 0.5) * a - y0, sigma) * a * a;
      deviance += poissonDeviance(count, photons * mass + b);
    }
    if (!hasCompatibleShape(deviance, roiPixels)) continue;
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
