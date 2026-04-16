'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SimulatorCanvas } from '@/components/SimulatorCanvas';
import { ControlPanel } from '@/components/ControlPanel';
import { PresetPicker } from '@/components/PresetPicker';
import { ThompsonPlot } from '@/components/ThompsonPlot';
import { CameraView } from '@/components/CameraView';
import { decodeQueryToParams, encodeParamsToQuery } from '@/lib/url-state';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { runSimulation } from '@/lib/simulator/runSimulation';
import { usePreviewWorker } from '@/lib/rendering/usePreviewWorker';
import type {
  GroundTruthInput,
  SimulationParams,
  SimulationResult,
} from '@/lib/simulator/types';

type LiveCameraState = {
  framePixels: Float32Array;
  cumulativePixels: Float32Array;
  width: number;
  height: number;
  frameIndex: number;
  totalFrames: number;
  nLocalizationsSoFar: number;
};

const FIELD_SIZE_NM = { width: 10000, height: 10000 }; // 10 μm × 10 μm
const FIELD_AREA_UM2 = 100;

// Defaults calibrated against Alexa Fluor 647 — the canonical dSTORM dye.
// - photonsPerCycle: 5000 is the photon count per detected ON event
//   commonly reported in dSTORM literature (Dempsey et al. Nat Methods 2011
//   report ~6000 for AF647 in MEA buffer; we pick a conservative 5000 so the
//   Thompson curve sits comfortably inside the well-behaved regime).
// - backgroundPerPixel: 20 ≈ 1 / 50 × photons-per-molecule, a standard
//   assumption in SMLM simulation benchmarks when no explicit value is
//   quoted (SMLM-2016 challenge data use 15–40 photons/px).
// - dutyCycle 0.001: AF647 spends ~0.1% of the time fluorescing at steady
//   state in optimised dSTORM buffer (Dempsey 2011).
// - pixelSize 160 nm, psfSigma 130 nm: a 1.4-NA 100× objective imaging
//   ~670 nm emission projected onto a 16 µm camera pixel (≈ Nyquist for a
//   230 nm FWHM PSF).
const DEFAULT_PARAMS: SimulationParams = {
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

type PresetKind = 'two-lines' | 'ring' | 'actin' | 'image';

function buildInput(
  kind: PresetKind,
  densityPerUm2: number,
  uploadedImage: ImageData | null
): GroundTruthInput | null {
  const total = Math.min(10000, Math.round(densityPerUm2 * FIELD_AREA_UM2));
  switch (kind) {
    case 'two-lines':
      return {
        kind: 'two-lines',
        separationNm: 50,
        length: 3000,
        nPerLine: Math.max(2, Math.floor(total / 2)),
      };
    case 'ring':
      // Native microtubule outer diameter is 25 nm, but primary + secondary
      // antibody stacks used in dSTORM add ~17.5 nm per side, so immuno-
      // labelled microtubules appear as ~60 nm hollow cylinders (Dempsey et
      // al., Weber et al.). 60 nm is the standard benchmark resolution target.
      return { kind: 'microtubule-ring', diameterNm: 60, nEmitters: total };
    case 'actin':
      return {
        kind: 'actin-periodic',
        periodNm: 190,
        lengthNm: 400,
        nRungs: 10,
        nPerRung: Math.max(1, Math.floor(total / 10)),
      };
    case 'image':
      if (!uploadedImage) return null;
      return { kind: 'image', imageData: uploadedImage, nEmitters: total };
  }
}

const VALID_PRESETS: readonly PresetKind[] = ['two-lines', 'ring', 'actin', 'image'];
const isPresetKind = (v: string): v is PresetKind =>
  (VALID_PRESETS as readonly string[]).includes(v);

export default function Page() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [preset, setPreset] = useState<PresetKind>('two-lines');
  const [densityPerUm2, setDensityPerUm2] = useState(250);
  const [uploadedImage, setUploadedImage] = useState<ImageData | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [liveCamera, setLiveCamera] = useState<LiveCameraState | null>(null);

  // Restore state from the URL on mount so shared links actually round-trip.
  // Runs once; we intentionally don't sync back to the URL on every state
  // change — the user triggers that explicitly with the "Share URL" button.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    const decoded = decodeQueryToParams(window.location.search, DEFAULT_PARAMS);
    setParams(decoded.params);
    if (isPresetKind(decoded.preset)) setPreset(decoded.preset);
    if (Number.isFinite(decoded.density) && decoded.density > 0) {
      setDensityPerUm2(decoded.density);
    }
  }, []);

  const groundTruth = useMemo(() => {
    const input = buildInput(preset, densityPerUm2, uploadedImage);
    if (!input) return null;
    return generateGroundTruth(input, FIELD_SIZE_NM);
  }, [preset, densityPerUm2, uploadedImage]);

  // High-resolution previews rendered off-thread at 10 nm/pixel (matches reconstruction)
  const preview = usePreviewWorker(groundTruth, params.psfSigmaNm);
  const groundTruthPixels = preview.groundTruth;
  const diffractionLimitedPixels = preview.diffractionLimited;
  const previewSize = { width: preview.width, height: preview.height };

  // Reconstruction canvas pixels (from last simulation result)
  const reconstructionPixels = useMemo(() => result?.reconstruction ?? null, [result]);
  const reconstructionSize = result?.reconstructionSize ?? params.fieldSizePx;

  const runningRef = useRef(false);

  const onStart = useCallback(async () => {
    if (!groundTruth || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProgress(0);
    setLiveCamera(null);
    setResult(null);
    try {
      const r = await runSimulation(groundTruth, params, {
        onProgress: (f) => setProgress(f),
        onFrame: (u) => setLiveCamera(u),
      });
      setResult(r);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [groundTruth, params]);

  const onReset = useCallback(() => {
    setResult(null);
    setLiveCamera(null);
    setProgress(0);
  }, []);

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">STORM: Breaking the Diffraction Limit</h1>
        <p className="text-slate-400 mt-2">
          An interactive super-resolution microscopy simulator.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SimulatorCanvas
              pixels={groundTruthPixels}
              width={previewSize.width}
              height={previewSize.height}
              title="Ground truth"
              colormap="grayscale"
            />
            <SimulatorCanvas
              pixels={diffractionLimitedPixels}
              width={previewSize.width}
              height={previewSize.height}
              title="Diffraction-limited"
              colormap="fire"
            />
            <SimulatorCanvas
              pixels={reconstructionPixels}
              width={reconstructionSize.width}
              height={reconstructionSize.height}
              title="STORM reconstruction"
              colormap="hot"
            />
          </div>

          <CameraView
            framePixels={liveCamera?.framePixels ?? null}
            cumulativePixels={liveCamera?.cumulativePixels ?? null}
            width={liveCamera?.width ?? params.fieldSizePx.width}
            height={liveCamera?.height ?? params.fieldSizePx.height}
            frameIndex={liveCamera?.frameIndex ?? 0}
            totalFrames={liveCamera?.totalFrames ?? 0}
            nLocalizationsSoFar={liveCamera?.nLocalizationsSoFar ?? 0}
            isRunning={running}
          />

          <PresetPicker
            value={preset}
            onValueChange={setPreset}
            onImageLoaded={setUploadedImage}
          />

          <div className="flex items-center gap-4">
            <Button onClick={onStart} disabled={running || !groundTruth}>
              {running ? `Running… ${Math.round(progress * 100)}%` : '▶ Start Acquisition'}
            </Button>
            <Button variant="outline" onClick={onReset} disabled={running}>
              Reset
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const q = encodeParamsToQuery(params, preset, densityPerUm2);
                const url = `${window.location.origin}${window.location.pathname}?${q}`;
                navigator.clipboard.writeText(url);
                alert('URL copied to clipboard!');
              }}
            >
              Share URL
            </Button>
          </div>

          <ThompsonPlot
            psfSigmaNm={params.psfSigmaNm}
            pixelSizeNm={params.pixelSizeNm}
            backgroundPerPixel={params.backgroundPerPixel}
            currentPhotons={params.photonsPerCycle}
            measuredSigmaLocNm={result?.measuredSigmaLocNm ?? null}
            empiricalPrecisionNm={result?.empiricalPrecisionNm ?? null}
            detectionEfficiency={result?.detectionEfficiency ?? null}
          />
        </div>

        <div>
          <ControlPanel params={params} onChange={setParams} />
        </div>
      </div>
    </main>
  );
}
