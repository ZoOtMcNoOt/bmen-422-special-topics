// Emitter — a single fluorophore's nominal position (nm, in sample coordinates)
export type Emitter = {
  x: number;
  y: number;
};

// Per-emitter photoswitching state, updated every frame
export type EmitterState = {
  isOn: boolean;
  bleached: boolean;
};

// Ground truth: a collection of emitters inside a defined field of view
export type GroundTruth = {
  emitters: Emitter[];
  fieldSizeNm: { width: number; height: number };
  label: string;
};

// Input spec for ground truth generation
export type GroundTruthInput =
  | { kind: 'two-lines'; separationNm: number; length: number; nPerLine: number }
  | { kind: 'microtubule-ring'; diameterNm: number; nEmitters: number }
  | { kind: 'actin-periodic'; periodNm: number; lengthNm: number; nRungs: number; nPerRung: number }
  | { kind: 'image'; imageData: ImageData; nEmitters: number };

// Full set of simulation parameters
export type SimulationParams = {
  photonsPerCycle: number;        // N (photons emitted during one ON event)
  backgroundPerPixel: number;     // b (photons)
  dutyCycle: number;              // fraction ON at steady state
  nFrames: number;
  driftRateNmPerFrame: number;
  correctDrift: boolean;
  rigorMode: 'pedagogical' | 'rigorous';
  pixelSizeNm: number;            // e.g. 160 nm
  psfSigmaNm: number;             // e.g. 130 nm (≈ 0.21 λ / NA)
  fieldSizePx: { width: number; height: number };
};

// A single rendered camera frame
export type Frame = {
  pixels: Float32Array;           // photons per pixel, row-major
  width: number;
  height: number;
  frameIndex: number;
};

// A single-molecule localization
export type Localization = {
  x: number;                      // nm
  y: number;                      // nm
  sigmaLocNm: number;             // estimated uncertainty
  nPhotons: number;
  frameIndex: number;
};

// Result of a full simulation run
export type SimulationResult = {
  groundTruth: GroundTruth;
  localizations: Localization[];
  reconstruction: Float32Array;
  reconstructionSize: { width: number; height: number };
  // Sum projection of every rendered camera frame — what a long-exposure
  // (non-switching) acquisition of the same sample would look like. Same
  // shape as the camera (W × H, Float32 photons). Useful as a sanity check:
  // dividing the integrated PSFs from this image should reproduce the
  // ground-truth emitter map smeared by the diffraction limit.
  summedFramesPixels: Float32Array;
  summedFramesSize: { width: number; height: number };
  // Median of the per-localization Thompson prediction (σ computed from
  // each loc's apparent photon count). Labelled "measured" in the UI for
  // historical reasons; this is really an inverse-variance proxy, NOT a
  // direct ground-truth measurement.
  measuredSigmaLocNm: number;
  // Thompson prediction evaluated at the currently-selected photonsPerCycle.
  predictedSigmaLocNm: number;
  // Direct ground-truth measurement: median Euclidean distance from each
  // localization to its nearest true emitter. Captures crowding artefacts
  // the Thompson formula is blind to.
  empiricalPrecisionNm: number;
  empiricalPrecisionP90Nm: number;
  // Localizations divided by total ON-emitter-frame events. A value < 1
  // means the local-max detector merged simultaneously-on neighbouring
  // molecules into a single detection.
  detectionEfficiency: number;
};
