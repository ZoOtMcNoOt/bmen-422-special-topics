'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SimulatorCanvas } from '@/components/SimulatorCanvas';
import { ControlPanel } from '@/components/ControlPanel';
import { PresetPicker } from '@/components/PresetPicker';
import { ThompsonPlot } from '@/components/ThompsonPlot';
import { encodeParamsToQuery } from '@/lib/url-state';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { runSimulation } from '@/lib/simulator/runSimulation';
import type {
  GroundTruthInput,
  SimulationParams,
  SimulationResult,
} from '@/lib/simulator/types';

const FIELD_SIZE_NM = { width: 10000, height: 10000 }; // 10 μm × 10 μm
const FIELD_AREA_UM2 = 100;

const DEFAULT_PARAMS: SimulationParams = {
  photonsPerCycle: 3000,
  backgroundPerPixel: 10,
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
      return { kind: 'microtubule-ring', diameterNm: 25, nEmitters: total };
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

export default function Page() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [preset, setPreset] = useState<PresetKind>('two-lines');
  const [densityPerUm2, setDensityPerUm2] = useState(250);
  const [uploadedImage, setUploadedImage] = useState<ImageData | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  const groundTruth = useMemo(() => {
    const input = buildInput(preset, densityPerUm2, uploadedImage);
    if (!input) return null;
    return generateGroundTruth(input, FIELD_SIZE_NM);
  }, [preset, densityPerUm2, uploadedImage]);

  // High-resolution previews (20 nm/pixel — 8× finer than camera, fast enough for useMemo)
  const GT_PIXEL_NM = 20;
  const gtSize = useMemo(
    () => ({
      width: Math.round(FIELD_SIZE_NM.width / GT_PIXEL_NM),
      height: Math.round(FIELD_SIZE_NM.height / GT_PIXEL_NM),
    }),
    []
  );
  const groundTruthPixels = useMemo(() => {
    if (!groundTruth) return null;
    const { width, height } = gtSize;
    const px = new Float32Array(width * height);
    // Splat each emitter as a small Gaussian (sigma ~15nm) so points are visible
    const sigmaPx = 15 / GT_PIXEL_NM; // 0.75 pixels
    const radius = Math.ceil(3 * sigmaPx) + 1;
    const norm = 1 / (2 * Math.PI * sigmaPx * sigmaPx);
    for (const e of groundTruth.emitters) {
      const cx = e.x / GT_PIXEL_NM;
      const cy = e.y / GT_PIXEL_NM;
      const xMin = Math.max(0, Math.floor(cx - radius));
      const xMax = Math.min(width - 1, Math.ceil(cx + radius));
      const yMin = Math.max(0, Math.floor(cy - radius));
      const yMax = Math.min(height - 1, Math.ceil(cy + radius));
      for (let py = yMin; py <= yMax; py++) {
        for (let pxI = xMin; pxI <= xMax; pxI++) {
          const dx = pxI + 0.5 - cx;
          const dy = py + 0.5 - cy;
          px[py * width + pxI] += norm * Math.exp(-(dx * dx + dy * dy) / (2 * sigmaPx * sigmaPx));
        }
      }
    }
    return px;
  }, [groundTruth, gtSize]);

  // Diffraction-limited preview: high-res rendering with PSF blur (no Poisson noise)
  const diffractionLimitedPixels = useMemo(() => {
    if (!groundTruth) return null;
    const { width, height } = gtSize;
    const px = new Float32Array(width * height);
    const sigmaPx = params.psfSigmaNm / GT_PIXEL_NM; // PSF in high-res pixels
    const radius = Math.ceil(3 * sigmaPx) + 1;
    const norm = 1 / (2 * Math.PI * sigmaPx * sigmaPx);
    for (const e of groundTruth.emitters) {
      const cx = e.x / GT_PIXEL_NM;
      const cy = e.y / GT_PIXEL_NM;
      const xMin = Math.max(0, Math.floor(cx - radius));
      const xMax = Math.min(width - 1, Math.ceil(cx + radius));
      const yMin = Math.max(0, Math.floor(cy - radius));
      const yMax = Math.min(height - 1, Math.ceil(cy + radius));
      for (let py = yMin; py <= yMax; py++) {
        for (let pxI = xMin; pxI <= xMax; pxI++) {
          const dx = pxI + 0.5 - cx;
          const dy = py + 0.5 - cy;
          px[py * width + pxI] += norm * Math.exp(-(dx * dx + dy * dy) / (2 * sigmaPx * sigmaPx));
        }
      }
    }
    return px;
  }, [groundTruth, gtSize, params.psfSigmaNm]);

  // Reconstruction canvas pixels (from last simulation result)
  const reconstructionPixels = useMemo(() => result?.reconstruction ?? null, [result]);
  const reconstructionSize = result?.reconstructionSize ?? params.fieldSizePx;

  const runningRef = useRef(false);

  const onStart = useCallback(async () => {
    if (!groundTruth || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProgress(0);
    try {
      const r = await runSimulation(groundTruth, params, {
        onProgress: (f) => setProgress(f),
      });
      setResult(r);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [groundTruth, params]);

  const onReset = useCallback(() => {
    setResult(null);
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
              width={gtSize.width}
              height={gtSize.height}
              title="Ground truth"
              colormap="grayscale"
            />
            <SimulatorCanvas
              pixels={diffractionLimitedPixels}
              width={gtSize.width}
              height={gtSize.height}
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
          />
        </div>

        <div>
          <ControlPanel params={params} onChange={setParams} />
        </div>
      </div>
    </main>
  );
}
