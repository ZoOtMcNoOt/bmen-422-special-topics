// ─── Sample ────────────────────────────────────────────────────────────────

/** A single fluorophore's position in sample coordinates (nm). */
export type Emitter = { x: number; y: number };

export type EmitterState = { isOn: boolean };

export type GroundTruth = {
  emitters: Emitter[];
  fieldSizeNm: { width: number; height: number };
  label: string;
};

export type GroundTruthInput =
  | { kind: 'two-lines'; separationNm: number; lengthNm: number; nPerLine: number }
  | { kind: 'ring'; diameterNm: number; nEmitters: number }
  | { kind: 'actin'; periodNm: number; rungLengthNm: number; nRungs: number; nPerRung: number }
  | { kind: 'image'; imageData: ImageData; nEmitters: number };

// ─── Acquisition ───────────────────────────────────────────────────────────

export type RigorMode = 'pedagogical' | 'rigorous';

export type SimulationParams = {
  photonsPerCycle: number;    // N — photons detected per ON event
  backgroundPerPixel: number; // b — photons per camera pixel per frame
  dutyCycle: number;          // fraction of molecules ON at steady state
  nFrames: number;
  driftRateNmPerFrame: number;
  correctDrift: boolean;
  rigorMode: RigorMode;
  pixelSizeNm: number;        // a — camera pixel pitch projected to the sample
  psfSigmaNm: number;         // σ of the Gaussian PSF
  fieldSizePx: { width: number; height: number };
};

export type Frame = {
  pixels: Float32Array; // photons per pixel, row-major
  width: number;
  height: number;
  frameIndex: number;
};

// ─── Analysis ──────────────────────────────────────────────────────────────

export type Localization = {
  x: number;          // nm
  y: number;          // nm
  sigmaLocNm: number; // Thompson estimate from this loc's photon count
  nPhotons: number;
  frameIndex: number;
};

/**
 * A square window onto the sample, in nm. Every rendered panel crops to the
 * same view box so scale bars and features are directly comparable.
 */
export type ViewBox = { x0: number; y0: number; sizeNm: number };

export type SimulationResult = {
  /** The parameters this result was acquired with — the UI compares against
   *  live params to flag stale results. */
  params: SimulationParams;
  groundTruth: GroundTruth;
  /** Frames actually acquired — less than params.nFrames if aborted. */
  framesCompleted: number;
  localizations: Localization[];
  /** Median of each loc's own Thompson estimate. Optimistic when molecules
   *  overlap, because the fitter attributes the merged photon count to one
   *  molecule. */
  apparentSigmaLocNm: number;
  /** Median distance from each localization to the nearest true emitter.
   *  The honest, ground-truth-referenced precision. */
  empiricalPrecisionNm: number;
  empiricalPrecisionP90Nm: number;
  /** Localizations ÷ ON-emitter-frame events. Drops below 1 when the
   *  detector merges simultaneously-on neighbours. */
  detectionEfficiency: number;
};
