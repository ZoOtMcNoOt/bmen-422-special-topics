'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { clearCanvas, drawPixelBufferToCanvas } from '@/lib/rendering/canvas';
import { hot } from '@/lib/rendering/colormap';
import { RENDER_PX } from '@/lib/simulator/defaults';
import { reconstructImage } from '@/lib/simulator/reconstruction';
import { locsThroughFrame } from '@/lib/timeline';
import { sliderValue } from '@/lib/utils';
import type { Localization, ViewBox } from '@/lib/simulator/types';
import { PanelFrame } from './PanelFrame';

type Props = {
  step: number;
  title: string;
  caption: string;
  localizations: readonly Localization[];
  view: ViewBox;
  /** Frames acquired so far; after a run ends this is the result's framesCompleted. */
  framesCompleted: number;
  isRunning: boolean;
  className?: string;
};

const PLAYBACK_MS = 1000 / 24;
/** A full replay takes about this many steps regardless of acquisition length. */
const PLAYBACK_STEPS = 200;

/**
 * The STORM panel. Builds up live during acquisition; afterwards the user can
 * scrub or replay the buildup frame by frame. The timeline spans the frames
 * that were actually acquired, not the live slider. Remount (via `key`) per
 * run so scrub state never carries over.
 */
export function ReconstructionPanel({
  step, title, caption, localizations, view, framesCompleted, isRunning, className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // null = follow framesCompleted (the live edge / the finished result). The ref
  // mirrors the state so the playback interval can advance without a stale closure.
  const [scrubFrame, setScrubFrame] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const setFrame = (f: number | null) => {
    scrubRef.current = f;
    setScrubFrame(f);
  };

  const hasData = localizations.length > 0;
  const shownFrame = isRunning ? framesCompleted : scrubFrame ?? framesCompleted;

  const counts = useMemo(
    () => (isRunning ? null : locsThroughFrame(localizations, framesCompleted)),
    [localizations, framesCompleted, isRunning]
  );
  const nShown = counts ? counts[Math.min(shownFrame, framesCompleted)] : localizations.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (nShown === 0) {
      clearCanvas(canvas);
      return;
    }
    const subset = nShown === localizations.length ? localizations : localizations.slice(0, nShown);
    drawPixelBufferToCanvas(canvas, reconstructImage(subset, view, RENDER_PX), RENDER_PX, hot);
  }, [localizations, nShown, view]);

  useEffect(() => {
    if (!playing) return;
    const stride = Math.max(1, Math.round(framesCompleted / PLAYBACK_STEPS));
    const timer = setInterval(() => {
      const next = Math.min((scrubRef.current ?? 0) + stride, framesCompleted);
      setFrame(next);
      if (next >= framesCompleted) setPlaying(false);
    }, PLAYBACK_MS);
    return () => clearInterval(timer);
  }, [playing, framesCompleted]);

  const atEnd = shownFrame >= framesCompleted;
  const togglePlay = () => {
    if (!playing && atEnd) setFrame(0);
    setPlaying((p) => !p);
  };

  return (
    <PanelFrame
      step={step}
      title={title}
      caption={caption}
      view={view}
      canvasRef={canvasRef}
      emptyText={hasData || isRunning ? null : 'Your STORM image appears here'}
      emphasized={isRunning}
      className={className}
    >
      {hasData && !isRunning && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/80 to-transparent px-2 pt-6 pb-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={togglePlay}
            aria-label={playing ? 'Pause replay' : 'Replay buildup'}
            className="text-white hover:bg-white/10"
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Slider
            value={[Math.min(shownFrame, framesCompleted)]}
            min={0}
            max={framesCompleted}
            step={1}
            onValueChange={(v) => {
              setPlaying(false);
              setFrame(sliderValue(v));
            }}
            aria-label="Frames shown"
            className="flex-1"
          />
          <span className="w-24 text-right font-mono text-xs text-white tabular-nums">
            {shownFrame.toLocaleString()} fr
          </span>
        </div>
      )}
    </PanelFrame>
  );
}
