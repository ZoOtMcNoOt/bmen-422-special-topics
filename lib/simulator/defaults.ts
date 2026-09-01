import type { SimulationParams } from './types';

/**
 * Calibrated to Alexa Fluor 647 in MEA buffer, the canonical dSTORM dye:
 * ~5000 detected photons per ON event and a ~0.1 % steady-state duty cycle
 * (Dempsey et al., Nat Methods 2011), with ~20 background photons per pixel
 * per frame. 160 nm pixels and a 130 nm PSF σ describe a 1.4-NA objective
 * imaging ~670 nm emission onto 16 µm camera pixels at 100×.
 */
export const DEFAULT_PARAMS: SimulationParams = {
  photonsPerCycle: 5000,
  backgroundPerPixel: 20,
  dutyCycle: 0.001,
  nFrames: 2000,
  driftRateNmPerFrame: 0,
  correctDrift: true,
  rigorMode: 'rigorous',
  pixelSizeNm: 160,
  psfSigmaNm: 130,
  fieldSizePx: { width: 64, height: 64 },
};

/** The sample field is exactly what the camera sees. */
export const FIELD_SIZE_NM = DEFAULT_PARAMS.fieldSizePx.width * DEFAULT_PARAMS.pixelSizeNm;

/** Upper bound of the brightness slider and the precision chart's x-axis. */
export const MAX_PHOTONS_PER_CYCLE = 10_000;

/** Every rendered panel is this many pixels across, regardless of view box. */
export const RENDER_PX = 320;

/** Localizations with σ below this are treated as delta functions. */
export const RECON_SIGMA_FLOOR_NM = 0.1;

/** Gaussian footprints are evaluated out to this many σ. */
export const PSF_CUTOFF_SIGMAS = 3;

/** PSF full-width at half-maximum ≈ the classical resolution limit. */
export const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.log(2)); // 2.3548

/** The diffraction limit at the default PSF, for copy that quotes a number. */
export const DIFFRACTION_LIMIT_NM = Math.round(FWHM_PER_SIGMA * DEFAULT_PARAMS.psfSigmaNm);
