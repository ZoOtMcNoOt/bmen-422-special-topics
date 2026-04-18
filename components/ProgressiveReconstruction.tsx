'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { drawPixelBufferToCanvas } from '@/lib/rendering/canvas';
import { hot, type Colormap } from '@/lib/rendering/colormap';
import { WebGPUReconstructor, cpuReconstruct } from '@/lib/rendering/webgpu-renderer';
import type { Localization } from '@/lib/simulator/types';

const asNumber = (v: number | readonly number[]): number =>
  (Array.isArray(v) ? v[0] : v) as number;

export type ProgressiveReconstructionProps = {
  localizations: Localization[];
  fieldSizeNm: { width: number; height: number };
  outputPixelSizeNm: number;
  colormap?: Colormap;
  totalFrames: number;
};

const PLAYBACK_FPS = 24;
const PLAYBACK_INTERVAL = 1000 / PLAYBACK_FPS;

export function ProgressiveReconstruction({
  localizations,
  fieldSizeNm,
  outputPixelSizeNm,
  colormap = hot,
  totalFrames,
}: ProgressiveReconstructionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<WebGPUReconstructor | null>(null);
  const renderIdRef = useRef(0);

  const [sliderFrame, setSliderFrame] = useState(totalFrames);
  const [playing, setPlaying] = useState(false);
  const [gpuReady, setGpuReady] = useState(false);

  const outW = Math.round(fieldSizeNm.width / outputPixelSizeNm);
  const outH = Math.round(fieldSizeNm.height / outputPixelSizeNm);

  // Build a lookup: for each camera frame index, how many sorted locs exist
  // up to (and including) that frame. Localizations arrive pre-sorted by
  // frameIndex from the simulation.
  const locCountAtFrame = useMemo(() => {
    const arr = new Uint32Array(totalFrames + 1);
    let li = 0;
    for (let f = 0; f <= totalFrames; f++) {
      while (li < localizations.length && localizations[li].frameIndex < f) li++;
      arr[f] = li;
    }
    arr[totalFrames] = localizations.length;
    return arr;
  }, [localizations, totalFrames]);

  const nLocsToRender = locCountAtFrame[Math.min(sliderFrame, totalFrames)];

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
    gpuRef.current?.uploadLocalizations(localizations, fieldSizeNm, outputPixelSizeNm);
  }, [localizations, fieldSizeNm, outputPixelSizeNm, gpuReady]);

  // Re-render whenever nLocsToRender changes (slider drag, play advance, etc.)
  useEffect(() => {
    const id = ++renderIdRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gpu = gpuRef.current;
    if (gpu) {
      gpu.render(nLocsToRender).then((pixels) => {
        if (renderIdRef.current !== id) return;
        drawPixelBufferToCanvas(canvas, pixels, outW, outH, colormap);
      });
    } else {
      const { pixels, width, height } = cpuReconstruct(
        localizations,
        nLocsToRender,
        fieldSizeNm,
        outputPixelSizeNm,
      );
      drawPixelBufferToCanvas(canvas, pixels, width, height, colormap);
    }
  }, [nLocsToRender, outW, outH, colormap, localizations, fieldSizeNm, outputPixelSizeNm, gpuReady]);

  // Auto-play: advance slider every PLAYBACK_INTERVAL ms
  useEffect(() => {
    if (!playing) return;
    const step = Math.max(1, Math.round(totalFrames / 200));
    const timer = setInterval(() => {
      setSliderFrame((prev) => {
        const next = prev + step;
        if (next >= totalFrames) {
          setPlaying(false);
          return totalFrames;
        }
        return next;
      });
    }, PLAYBACK_INTERVAL);
    return () => clearInterval(timer);
  }, [playing, totalFrames]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && sliderFrame >= totalFrames) setSliderFrame(0);
      return !p;
    });
  }, [sliderFrame, totalFrames]);

  const restart = useCallback(() => {
    setPlaying(false);
    setSliderFrame(0);
  }, []);

  const pct = totalFrames > 0 ? ((sliderFrame / totalFrames) * 100).toFixed(0) : '0';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-2"
    >
      <div className="text-sm font-medium text-slate-300">STORM reconstruction</div>
      <canvas
        ref={canvasRef}
        className="rounded-md border border-slate-800 bg-slate-900"
        style={{ width: 256, height: 256, imageRendering: 'pixelated' }}
      />
      {/* ── YouTube-style controls ── */}
      <div className="flex w-[256px] flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Slider
            value={[sliderFrame]}
            min={0}
            max={totalFrames}
            step={1}
            onValueChange={(v) => {
              setSliderFrame(asNumber(v));
              if (playing) setPlaying(false);
            }}
            className="flex-1"
            aria-label="Reconstruction timeline"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={restart}
            aria-label="Restart"
          >
            <RotateCcw />
          </Button>
        </div>
        <div className="flex items-baseline justify-between px-0.5 text-[10px] tabular-nums">
          <span className="text-slate-500">
            frame {sliderFrame} / {totalFrames}
          </span>
          <span className="text-slate-500">
            {nLocsToRender.toLocaleString()} locs · {pct}%
          </span>
          <span className={`font-medium ${gpuReady ? 'text-green-500' : 'text-slate-600'}`}>
            {gpuReady ? 'WebGPU' : 'CPU'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
