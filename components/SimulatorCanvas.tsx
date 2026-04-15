'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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

const colormaps: Record<'grayscale' | 'hot' | 'fire', Colormap> = {
  grayscale,
  hot,
  fire,
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.5;
const WHEEL_SENSITIVITY = 0.0025;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Base UI's Slider types its value as `number | readonly number[]`; we use
// single-thumb sliders only, so narrow to scalar at the callback boundary.
const asNumber = (v: number | readonly number[]): number =>
  (Array.isArray(v) ? v[0] : v) as number;

export function SimulatorCanvas({
  pixels,
  width,
  height,
  title,
  colormap = 'fire',
  className = '',
}: SimulatorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // zoom = 1 means no magnification. Focal point is normalized [0,1]
  // and determines the CSS transform-origin — when the cursor hovers
  // the image it tracks the cursor (product-photo style); otherwise it
  // stays at the last position (or centered by default).
  const [zoom, setZoom] = useState(1);
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5 });
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !pixels) return;
    drawPixelBufferToCanvas(canvasRef.current, pixels, width, height, colormaps[colormap]);
  }, [pixels, width, height, colormap]);

  const setZoomClamped = useCallback((next: number) => {
    setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    setFocal({ x, y });
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Only hijack the wheel when the user is actively hovering the image.
      if (!hovering) return;
      e.preventDefault();
      setZoomClamped(zoom * Math.exp(-e.deltaY * WHEEL_SENSITIVITY));
    },
    [hovering, zoom, setZoomClamped]
  );

  const reset = useCallback(() => {
    setZoom(1);
    setFocal({ x: 0.5, y: 0.5 });
  }, []);

  const hasPixels = pixels != null;
  const isZoomed = zoom > 1.0001;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`flex flex-col items-center gap-2 ${className}`}
    >
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-md border border-slate-800 bg-slate-900"
        style={{ width: 256, height: 256 }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
        onDoubleClick={reset}
      >
        <canvas
          ref={canvasRef}
          className="block select-none will-change-transform"
          style={{
            width: 256,
            height: 256,
            imageRendering: 'pixelated',
            transformOrigin: `${focal.x * 100}% ${focal.y * 100}%`,
            transform: `scale(${zoom})`,
            transition: hovering ? 'none' : 'transform 120ms ease-out',
            cursor: isZoomed ? 'zoom-out' : 'zoom-in',
          }}
        />
        {isZoomed && (
          <div className="pointer-events-none absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">
            {zoom.toFixed(1)}×
          </div>
        )}
      </div>

      <div className="flex w-[256px] items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setZoomClamped(zoom - ZOOM_STEP)}
          disabled={!hasPixels || zoom <= MIN_ZOOM}
          aria-label={`Zoom out ${title}`}
        >
          <ZoomOut />
        </Button>
        <Slider
          value={[zoom]}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.1}
          onValueChange={(v) => setZoomClamped(asNumber(v))}
          disabled={!hasPixels}
          aria-label={`Zoom level for ${title}`}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setZoomClamped(zoom + ZOOM_STEP)}
          disabled={!hasPixels || zoom >= MAX_ZOOM}
          aria-label={`Zoom in ${title}`}
        >
          <ZoomIn />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={reset}
          disabled={!hasPixels || (zoom === 1 && focal.x === 0.5 && focal.y === 0.5)}
          aria-label={`Reset zoom for ${title}`}
        >
          <Maximize2 />
        </Button>
      </div>
    </motion.div>
  );
}
