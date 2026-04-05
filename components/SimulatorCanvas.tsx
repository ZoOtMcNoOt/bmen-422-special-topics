'use client';

import { useEffect, useRef } from 'react';
import { drawPixelBufferToCanvas } from '@/lib/rendering/canvas';
import { fire, grayscale, hot, type Colormap } from '@/lib/rendering/colormap';

export type SimulatorCanvasProps = {
  pixels: Float32Array | null;
  width: number;
  height: number;
  title: string;
  colormap?: 'grayscale' | 'hot' | 'fire';
  className?: string;
};

const colormaps: Record<string, Colormap> = { grayscale, hot, fire };

export function SimulatorCanvas({
  pixels,
  width,
  height,
  title,
  colormap = 'fire',
  className = '',
}: SimulatorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !pixels) return;
    drawPixelBufferToCanvas(canvasRef.current, pixels, width, height, colormaps[colormap]);
  }, [pixels, width, height, colormap]);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <canvas
        ref={canvasRef}
        className="rounded-md border border-slate-800 bg-slate-900"
        style={{ width: 256, height: 256, imageRendering: 'pixelated' }}
      />
    </div>
  );
}
