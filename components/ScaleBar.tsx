import { pickScaleBar } from '@/lib/rendering/scaleBar';
import type { ViewBox } from '@/lib/simulator/types';

/**
 * Overlay for a panel whose full width shows `view`. The outer box spans the
 * whole panel so the bar's percentage width is exact; the inner box carries
 * that width and sits in the corner.
 */
export function ScaleBar({ view }: { view: ViewBox }) {
  const { fraction, label } = pickScaleBar(view.sizeNm);
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute right-2 bottom-2 flex flex-col items-end gap-1" style={{ width: `${fraction * 100}%` }}>
        <div className="h-0.5 w-full bg-white shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
        <span className="text-xs font-medium leading-none whitespace-nowrap text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
          {label}
        </span>
      </div>
    </div>
  );
}
