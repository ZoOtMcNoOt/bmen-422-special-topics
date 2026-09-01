import type { ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';
import type { ViewBox } from '@/lib/simulator/types';
import { ScaleBar } from './ScaleBar';

type Props = {
  step: number;
  title: string;
  caption: string;
  view: ViewBox;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Shown over the canvas when there is nothing to draw yet. */
  emptyText: string | null;
  /** Highlight this panel as the one to look at. */
  emphasized?: boolean;
  className?: string;
  /** Extra overlays (controls, badges) drawn over the image. */
  children?: ReactNode;
};

/** Shared chrome for the three comparison panels: numbered title, square canvas, caption. */
export function PanelFrame({ step, title, caption, view, canvasRef, emptyText, emphasized, className, children }: Props) {
  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <figcaption className="flex items-baseline gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs text-muted-foreground">
          {step}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </figcaption>
      <div
        className={cn(
          'relative aspect-square w-full overflow-hidden rounded-lg border bg-black transition-shadow',
          emphasized ? 'border-storm/60 ring-2 ring-storm/25' : 'border-border'
        )}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {emptyText && (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        )}
        {children}
        <ScaleBar view={view} />
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{caption}</p>
    </figure>
  );
}
