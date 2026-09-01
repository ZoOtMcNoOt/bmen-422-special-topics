'use client';

import { useEffect, useRef } from 'react';
import { clearCanvas, drawPixelBufferToCanvas } from '@/lib/rendering/canvas';
import { hot } from '@/lib/rendering/colormap';
import { RENDER_PX } from '@/lib/simulator/defaults';
import type { ViewBox } from '@/lib/simulator/types';
import { PanelFrame } from './PanelFrame';

type Props = {
  step: number;
  title: string;
  caption: string;
  pixels: Float32Array | null;
  view: ViewBox;
  emptyText: string;
  className?: string;
};

/** A static comparison panel drawn from a precomputed pixel buffer. */
export function ImagePanel({ step, title, caption, pixels, view, emptyText, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (pixels) drawPixelBufferToCanvas(canvas, pixels, RENDER_PX, hot);
    else clearCanvas(canvas);
  }, [pixels]);

  return (
    <PanelFrame
      step={step}
      title={title}
      caption={caption}
      view={view}
      canvasRef={canvasRef}
      emptyText={pixels ? null : emptyText}
      className={className}
    />
  );
}
