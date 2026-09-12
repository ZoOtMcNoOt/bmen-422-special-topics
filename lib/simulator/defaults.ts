import type { SimulationParams } from './types';

/** Illustrative microscopy settings, not a calibration to a particular dye or instrument.
 * Photon yield is per active molecule per camera frame. */
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
export const FIELD_SIZE_NM =
  DEFAULT_PARAMS.fieldSizePx.width * DEFAULT_PARAMS.pixelSizeNm;

/** Upper bound of the brightness slider and the precision chart's x-axis. */
export const MAX_PHOTONS_PER_CYCLE = 10_000;

/** Localizations with σ below this are treated as delta functions. */
export const RECON_SIGMA_FLOOR_NM = 0.1;

/** Gaussian footprints are evaluated out to this many σ. */
export const PSF_CUTOFF_SIGMAS = 3;
