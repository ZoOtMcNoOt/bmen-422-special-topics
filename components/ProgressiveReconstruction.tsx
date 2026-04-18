'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { drawPixelBufferToCanvas } from '@/lib/rendering/canvas';
import { hot, type Colormap } from '@/lib/rendering/colormap';
import { WebGPUReconstructor, cpuReconstruct } from '@/lib/rendering/webgpu-renderer';
import { ScaleBar } from './ScaleBar';
import type { Localization } from '@/lib/simulator/types';

const asNumber = (v: number | readonly number[]): number =>
  (Array.isArray(v) ? v[0] : v) as number;

export type ProgressiveReconstructionProps = {
  /** Localizations to render — grows live during acquisition, final after. */
  localizations: Localization[];
  fieldSizeNm: { width: number; height: number };
  outputPixelSizeNm: number;
  colormap?: Colormap;
  totalFrames: number;
  /** Current frame index — advances live during acquisition. */
  currentFrameIndex: number;
  /** True while runSimulation is running. */
  isRunning: boolean;
};

const PLAYBACK_FPS = 24;
const PLAYBACK_INTERVAL = 1000 / PLAYBACK_FPS;

export function ProgressiveReconstruction({
  localizations,
  fieldSizeNm,
  outputPixelSizeNm,
  colormap = hot,
  totalFrames,
  currentFrameIndex,
  isRunning,
}: ProgressiveReconstructionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<WebGPUReconstructor | null>(null);
  const renderIdRef = useRef(0);

  // During acquisition: slider tracks the live frame. After: user controls it.
  const [userSlider, setUserSlider] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [gpuReady, setGpuReady] = useState(false);

  const outW = Math.round(fieldSizeNm.width / outputPixelSizeNm);
  const outH = Math.round(fieldSizeNm.height / outputPixelSizeNm);

  // During acquisition the slider tracks live progress. After acquisition the
  // user owns it (defaults to the final frame).
  const sliderFrame = isRunning
    ? currentFrameIndex
    : (userSlider ?? totalFrames);

  // Build a lookup: for each camera frame, how many locs exist up to that frame.
  const locCountAtFrame = useMemo(() => {
    if (localizations.length === 0) return new Uint32Array(totalFrames + 1);
    const arr = new Uint32Array(totalFrames + 1);
    let li = 0;
    for (let f = 0; f <= totalFrames; f++) {
      while (li < localizations.length && localizations[li].frameIndex < f) li++;
      arr[f] = li;
    }
    arr[totalFrames] = localizations.length;
    return arr;
  }, [localizations, totalFrames]);

  const nLocsToRender = isRunning
    ? localizations.length // during acquisition: render everything we have
    : locCountAtFrame[Math.min(sliderFrame, totalFrames)];

  // Init WebGPU (best-effort; falls back to CPU if unavailable)
  useEffect(() => {
    let disposed = false;
    WebGPUReconstructor.create().then((gpu) => {
      if (disposed || !gpu) return;
      gpuRef.current = gpu;
      setGpuReady(true);
    });
    return () => {
      disposed = true;
      gpuRef.current?.dispose();
      gpuRef.current = null;
    };
  }, []);

  // Upload loc data to GPU when localizations change
  useEffect(() => {
    if (localizations.length === 0) return;
    gpuRef.current?.uploadLocalizations(localizations, fieldSizeNm, outputPixelSizeNm);
  }, [localizations, fieldSizeNm, outputPixelSizeNm, gpuReady]);

  // Re-render the reconstruction whenever nLocsToRender or data changes
  useEffect(() => {
    const id = ++renderIdRef.current;
    const canvas = canvasRef.current;
    if (!canvas || nLocsToRender === 0) return;

    const gpu = gpuRef.current;
    if (gpu) {
      gpu.render(nLocsToRender).then((pixels) => {
        if (renderIdRef.current !== id) return;
        drawPixelBufferToCanvas(canvas, pixels, outW, outH, colormap);
      }).catch(() => {
        // GPU failed — fall back to CPU this frame
        if (renderIdRef.current !== id) return;
        const { pixels, width, height } = cpuReconstruct(
          localizations, nLocsToRender, fieldSizeNm, outputPixelSizeNm,
        );
        drawPixelBufferToCanvas(canvas, pixels, width, height, colormap);
      });
    } else {
      const { pixels, width, height } = cpuReconstruct(
        localizations, nLocsToRender, fieldSizeNm, outputPixelSizeNm,
      );
      drawPixelBufferToCanvas(canvas, pixels, width, height, colormap);
    }
  }, [nLocsToRender, outW, outH, colormap, localizations, fieldSizeNm, outputPixelSizeNm, gpuReady]);

  // Auto-play: advance slider every PLAYBACK_INTERVAL ms (post-acquisition only).
  // When the slider reaches totalFrames the updater pins it and the interval
  // becomes a no-op until the user restarts. Cleanup fires when `playing`
  // toggles or the component unmounts.
  useEffect(() => {
    if (!playing || isRunning) return;
    const step = Math.max(1, Math.round(totalFrames / 200));
    const timer = setInterval(() => {
      setUserSlider((prev) =>
        Math.min((prev ?? 0) + step, totalFrames)
      );
    }, PLAYBACK_INTERVAL);
    return () => clearInterval(timer);
  }, [playing, isRunning, totalFrames]);

  const togglePlay = useCallback(() => {
    if (!playing) {
      if (sliderFrame >= totalFrames) setUserSlider(0);
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, [playing, sliderFrame, totalFrames]);

  const restart = useCallback(() => {
    setPlaying(false);
    setUserSlider(0);
  }, []);

  const hasData = localizations.length > 0;
  const headline = isRunning
    ? `Acquiring · frame ${currentFrameIndex + 1} / ${totalFrames}`
    : hasData
    ? `${totalFrames} frames · ${localizations.length.toLocaleString()} localizations`
    : 'Waiting for acquisition';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-2"
    >
      <div className="text-sm font-medium text-slate-300">STORM reconstruction</div>
      <div className="relative w-full max-w-[256px] aspect-square">
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-md border border-slate-800 bg-slate-900"
          style={{ imageRendering: 'pixelated' }}
        />
        {!hasData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-600">
            (waiting)
          </div>
        )}
        <ScaleBar fieldWidthNm={fieldSizeNm.width} />
      </div>

      {/* ── Timeline controls ── */}
      <div className="flex w-full max-w-[256px] flex-col gap-1.5">
        {/* Progress bar during acquisition / scrub bar after */}
        <div className="flex items-center gap-1.5">
          {!isRunning && hasData && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
          )}
          <Slider
            value={[sliderFrame]}
            min={0}
            max={totalFrames || 1}
            step={1}
            onValueChange={(v) => {
              if (!isRunning) {
                setUserSlider(asNumber(v));
                if (playing) setPlaying(false);
              }
            }}
            disabled={isRunning || !hasData}
            className="flex-1"
            aria-label="Reconstruction timeline"
          />
          {!isRunning && hasData && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={restart}
              aria-label="Restart"
            >
              <RotateCcw />
            </Button>
          )}
        </div>
        <div className="flex items-baseline justify-between px-0.5 text-[10px] tabular-nums">
          <span className="text-slate-400">{headline}</span>
          <span className={`font-medium ${gpuReady ? 'text-green-500' : 'text-slate-600'}`}>
            {gpuReady ? 'GPU' : 'CPU'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
