'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { drawPixelBufferToCanvas } from '@/lib/rendering/canvas';
import { fire } from '@/lib/rendering/colormap';

export type CameraViewProps = {
  // Live camera frame — non-null while a simulation is running, becomes the
  // last rendered frame when the simulation finishes, and is null before
  // anything has been acquired.
  framePixels: Float32Array | null;
  // Cumulative sum of every frame rendered so far. Same shape as framePixels.
  cumulativePixels: Float32Array | null;
  width: number;
  height: number;
  frameIndex: number; // 0-based; 0 with no data
  totalFrames: number; // 0 with no data
  nLocalizationsSoFar: number;
  isRunning: boolean;
};

export function CameraView({
  framePixels,
  cumulativePixels,
  width,
  height,
  frameIndex,
  totalFrames,
  nLocalizationsSoFar,
  isRunning,
}: CameraViewProps) {
  const liveRef = useRef<HTMLCanvasElement>(null);
  const sumRef = useRef<HTMLCanvasElement>(null);

  // The camera is monochrome detector — `fire` colormap reads cleanly on
  // a dark background and matches the diffraction-limited preview panel.
  useEffect(() => {
    if (!liveRef.current || !framePixels) return;
    drawPixelBufferToCanvas(liveRef.current, framePixels, width, height, fire);
  }, [framePixels, width, height]);

  useEffect(() => {
    if (!sumRef.current || !cumulativePixels) return;
    drawPixelBufferToCanvas(sumRef.current, cumulativePixels, width, height, fire);
  }, [cumulativePixels, width, height]);

  const hasData = framePixels !== null;
  const progressPct = totalFrames > 0 ? Math.min(100, ((frameIndex + 1) / totalFrames) * 100) : 0;
  const headline = !hasData
    ? 'Press "Start Acquisition" to begin'
    : isRunning
    ? `Acquiring · frame ${frameIndex + 1} / ${totalFrames}`
    : `Acquisition complete · ${totalFrames} frames`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
    >
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div className="text-sm font-medium text-slate-300">Camera timeline</div>
        <div className="font-mono text-[10px] text-slate-500 tabular-nums">
          {hasData
            ? `${nLocalizationsSoFar.toLocaleString()} loc${nLocalizationsSoFar === 1 ? '' : 's'} so far`
            : 'no acquisition yet'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CameraPanel
          canvasRef={liveRef}
          title={isRunning ? 'Live frame' : 'Last frame'}
          subtitle={
            hasData
              ? `frame #${frameIndex + 1} — sparse single-molecule blinks`
              : 'one camera exposure (~10 ms equivalent)'
          }
          empty={!hasData}
        />
        <CameraPanel
          canvasRef={sumRef}
          title="Sum projection"
          subtitle={
            hasData
              ? `Σ of ${frameIndex + 1} frame${frameIndex === 0 ? '' : 's'} — what a long exposure would capture`
              : 'cumulative integration of every frame'
          }
          empty={!hasData}
        />
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-300">{headline}</span>
          <span className="font-mono text-slate-500 tabular-nums">
            {hasData ? `${progressPct.toFixed(0)}%` : ''}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-150 ease-out ${
              isRunning ? 'bg-orange-500' : 'bg-slate-600'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function CameraPanel({
  canvasRef,
  title,
  subtitle,
  empty,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  title: string;
  subtitle: string;
  empty: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-medium text-slate-300">{title}</div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="rounded-md border border-slate-800 bg-slate-900"
          style={{ width: 256, height: 256, imageRendering: 'pixelated' }}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-600">
            (waiting)
          </div>
        )}
      </div>
      <div className="px-1 text-center text-[10px] leading-snug text-slate-500">{subtitle}</div>
    </div>
  );
}
