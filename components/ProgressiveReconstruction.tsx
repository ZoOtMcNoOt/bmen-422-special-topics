'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { drawPixelBufferToCanvas } from '@/lib/rendering/canvas';
import { hot, type Colormap } from '@/lib/rendering/colormap';
import { reconstructImage } from '@/lib/simulator/reconstruction';
import { ScaleBar } from './ScaleBar';
import type { Localization } from '@/lib/simulator/types';

const asNumber = (v: number | readonly number[]): number =>
  (Array.isArray(v) ? v[0] : v) as number;

export type ProgressiveReconstructionProps = {
  localizations: Localization[];
  fieldSizeNm: { width: number; height: number };
  outputPixelSizeNm: number;
  colormap?: Colormap;
  totalFrames: number;
  currentFrameIndex: number;
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
  const renderIdRef = useRef(0);

  const [userSlider, setUserSlider] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const sliderFrame = isRunning
    ? currentFrameIndex
    : (userSlider ?? totalFrames);

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
    ? localizations.length
    : locCountAtFrame[Math.min(sliderFrame, totalFrames)];

  // Render reconstruction — plain JS, ~5 ms for 1k locs at 1000×1000.
  // No WebGPU/WASM needed; the erf-based pixel integration only touches
  // ~9 pixels per localization so even 10k locs finish in <20 ms.
  useEffect(() => {
    const id = ++renderIdRef.current;
    const canvas = canvasRef.current;
    if (!canvas || nLocsToRender === 0) return;

    const subset = nLocsToRender >= localizations.length
      ? localizations
      : localizations.slice(0, nLocsToRender);
    const r = reconstructImage(subset, { fieldSizeNm, outputPixelSizeNm });

    if (renderIdRef.current === id) {
      drawPixelBufferToCanvas(canvas, r.pixels, r.width, r.height, colormap);
    }
  }, [nLocsToRender, colormap, localizations, fieldSizeNm, outputPixelSizeNm]);

  // Auto-play
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

      <div className="flex w-full max-w-[256px] flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          {!isRunning && hasData && (
            <Button variant="ghost" size="icon-xs" onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}>
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
            <Button variant="ghost" size="icon-xs" onClick={restart}
              aria-label="Restart">
              <RotateCcw />
            </Button>
          )}
        </div>
        <div className="px-0.5 text-[10px] text-slate-400 tabular-nums">
          {headline}
        </div>
      </div>
    </motion.div>
  );
}
