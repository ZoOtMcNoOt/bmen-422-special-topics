'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SimulatorCanvas } from '@/components/SimulatorCanvas';
import { ControlPanel } from '@/components/ControlPanel';
import { PresetPicker } from '@/components/PresetPicker';
import { ThompsonPlot } from '@/components/ThompsonPlot';
import { CameraView } from '@/components/CameraView';
import { ProgressiveReconstruction } from '@/components/ProgressiveReconstruction';
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

  const hasReconstruction = result !== null;

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
    <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 max-w-7xl mx-auto pb-24 lg:pb-6">
      <header className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">STORM: Breaking the Diffraction Limit</h1>
        <p className="text-slate-400 mt-1 text-sm sm:text-base">
          An interactive super-resolution microscopy simulator.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
          {/* ── Image panels: horizontal scroll on mobile, 3-col grid on md+ ── */}
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-3 md:overflow-visible">
            <div className="min-w-[72vw] snap-center md:min-w-0">
              <SimulatorCanvas
                pixels={groundTruthPixels}
                width={previewSize.width}
                height={previewSize.height}
                title="Ground truth"
                colormap="grayscale"
              />
            </div>
            <div className="min-w-[72vw] snap-center md:min-w-0">
              <SimulatorCanvas
                pixels={diffractionLimitedPixels}
                width={previewSize.width}
                height={previewSize.height}
                title="Diffraction-limited"
                colormap="fire"
              />
            </div>
            <div className="min-w-[72vw] snap-center md:min-w-0">
              {hasReconstruction ? (
                <ProgressiveReconstruction
                  localizations={result.localizations}
                  fieldSizeNm={result.groundTruth.fieldSizeNm}
                  outputPixelSizeNm={10}
                  totalFrames={params.nFrames}
                />
              ) : (
                <SimulatorCanvas
                  pixels={null}
                  width={params.fieldSizePx.width}
                  height={params.fieldSizePx.height}
                  title="STORM reconstruction"
                  colormap="hot"
                />
              )}
            </div>
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

          {/* Action buttons — sticky bottom bar on mobile */}
          <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-center gap-3 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-sm lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:justify-start lg:backdrop-blur-none">
            <Button onClick={onStart} disabled={running || !groundTruth}>
              {running ? `Running… ${Math.round(progress * 100)}%` : '▶ Start'}
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
              Share
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

        {/* ── Controls: collapsible on mobile, always-visible on lg ── */}
        <div>
          <details className="group lg:open" open>
            <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-semibold text-slate-300 lg:hidden">
              Simulation parameters
              <span className="text-xs text-slate-500 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="lg:block">
              <ControlPanel params={params} onChange={setParams} />
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
