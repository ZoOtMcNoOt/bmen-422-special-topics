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
import { renderFrame } from '@/lib/simulator/renderFrame';
import type {
  GroundTruthInput,
  SimulationParams,
  SimulationResult,
  Emitter,
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

  // Ground truth preview (each emitter as one pixel)
  const groundTruthPixels = useMemo(() => {
    if (!groundTruth) return null;
    const { width, height } = params.fieldSizePx;
    const px = new Float32Array(width * height);
    const a = params.pixelSizeNm;
    for (const e of groundTruth.emitters) {
      const x = Math.floor(e.x / a);
      const y = Math.floor(e.y / a);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        px[y * width + x] += 1;
      }
    }
    return px;
  }, [groundTruth, params.fieldSizePx, params.pixelSizeNm]);

  // Diffraction-limited preview: one frame with ALL emitters ON at high N
  const diffractionLimitedPixels = useMemo(() => {
    if (!groundTruth) return null;
    const allOn: Emitter[] = groundTruth.emitters;
    const frame = renderFrame(
      allOn,
      { ...params, photonsPerCycle: 50, backgroundPerPixel: 0 },
      0
    );
    return frame.pixels;
  }, [groundTruth, params.fieldSizePx, params.pixelSizeNm, params.psfSigmaNm, params.rigorMode]);

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
              width={params.fieldSizePx.width}
              height={params.fieldSizePx.height}
              title="Ground truth"
              colormap="grayscale"
            />
            <SimulatorCanvas
              pixels={diffractionLimitedPixels}
              width={params.fieldSizePx.width}
              height={params.fieldSizePx.height}
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
