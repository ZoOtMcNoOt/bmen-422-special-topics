/**
 * Physical scale-bar overlay for microscopy images. The bar width is set
 * as a percentage of its parent container (which must represent the full
 * imaging field). All panels using the same fieldWidthNm produce bars at
 * the same physical scale — so a "2 μm" bar in the ground-truth panel is
 * the same CSS width as in the reconstruction, guaranteeing visual
 * comparability.
 */
export function ScaleBar({ fieldWidthNm }: { fieldWidthNm: number }) {
  const barNm = fieldWidthNm >= 8000 ? 2000 : 1000;
  const pct = (barNm / fieldWidthNm) * 100;
  const label = barNm >= 1000 ? `${barNm / 1000} μm` : `${barNm} nm`;
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 flex flex-col items-end gap-0.5">
      <div
        className="h-[2px] bg-white shadow-[0_0_3px_rgba(0,0,0,0.8)]"
        style={{ width: `${pct}%` }}
      />
      <span className="text-[9px] font-medium leading-none text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
        {label}
      </span>
    </div>
  );
}
