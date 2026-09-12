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
  | {
    kind: 'image';
    imageData: ImageData;
    nEmitters: number;
    /** Original dimensions retain the source aspect ratio after pixel downsampling. */
    sourceSize?: { width: number; height: number };
  };

// ─── Acquisition ───────────────────────────────────────────────────────────

export type RigorMode = 'pedagogical' | 'rigorous';

export type SimulationParams = {
  photonsPerCycle: number;    // N — mean photons per active emitter per camera frame
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

export type LocalizationMetrics = {
  /** sqrt(sum(dx² + dy²) / (2 * matches)), against active truth in each camera frame.
   *  This measures matched localization error, independently of display drift correction.
   *  It is neither a precision bound nor a measurement of image resolution. */
  rmsPerAxisErrorNm: number | null;
  matchedCount: number;
  /** Number of active emitter centers inside the sensor, summed across acquired frames. */
  activeEmitterFrames: number;
  missedCount: number;
  falsePositiveCount: number;
  /** Matches / active emitter-frames; null when none were observable. */
  detectionRecall: number | null;
  /** Unmatched accepted fits / all accepted fits; null when there were no fits. */
  falsePositiveRate: number | null;
  /** Inclusive Euclidean gate, fixed to one configured PSF sigma during acquisition. */
  matchRadiusNm: number;
};

/** Linear 8-bit previews for display only; neither image is localization input. */
export type SimulationPreviewMetadata = {
  width: number;
  height: number;
  toneMap: 'linear';
  /** One fixed acquisition-wide ceiling: b + 1.5 N times the centered pixel PSF mass.
   *  A value of 1 is used if that expression is smaller than one photon. */
  cameraCeilingPhotons: number;
  /** Maximum raw mean pixel count across all acquired frames; zero for an empty image. */
  widefieldCeilingPhotons: number;
};

export type SimulationResult = {
  /** The parameters this result was acquired with — the UI compares against
   *  live params to flag stale results. */
  params: SimulationParams;
  groundTruth: GroundTruth;
  /** Frames actually acquired — less than params.nFrames if aborted. */
  framesCompleted: number;
  /** Acquired camera frames, frame-major then row-major, linearly scaled and clipped to 0..255.
   *  Includes simulated drift. Use preview.cameraCeilingPhotons to interpret display scaling. */
  cameraFrames: Uint8Array;
  /** All-frame mean of the actual raw camera counts, scaled by its maximum to 0..255.
   *  Includes simulated drift; empty acquisitions produce an all-zero image. */
  widefield: Uint8Array;
  preview: SimulationPreviewMetadata;
  /** Switched-ON emitter count in each acquired frame, including centers outside the sensor. */
  activePerFrame: number[];
  /** Accepted localization count in each acquired frame. */
  countsPerFrame: number[];
  /** Display coordinates; known drift is subtracted only when requested. */
  localizations: Localization[];
  /** Unmodified accepted fits in camera coordinates, in the same order as localizations. */
  rawLocalizations: Localization[];
  /** Median of each loc's own Thompson estimate. Optimistic when molecules
   *  overlap, because the fitter attributes the merged photon count to one
   *  molecule. */
  apparentSigmaLocNm: number | null;
  metrics: LocalizationMetrics;
};
