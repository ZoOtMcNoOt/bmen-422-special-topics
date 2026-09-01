/** Round mantissas for scale-bar lengths, longest first. */
const MANTISSAS = [5, 2, 1] as const;

/** The longest 1/2/5 × 10ⁿ bar that fits within a third of the view. */
export function pickScaleBar(viewSizeNm: number): { barNm: number; fraction: number; label: string } {
  const target = viewSizeNm / 3;
  const decade = 10 ** Math.floor(Math.log10(target));
  const barNm = MANTISSAS.map((m) => m * decade).find((b) => b <= target) ?? decade;
  const label = barNm >= 1000 ? `${barNm / 1000} µm` : `${barNm} nm`;
  return { barNm, fraction: barNm / viewSizeNm, label };
}
