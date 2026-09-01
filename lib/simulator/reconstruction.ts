import { RECON_SIGMA_FLOOR_NM } from './defaults';
import { splatGaussians } from './splat';
import type { Localization, ViewBox } from './types';

/** Super-resolution image: each localization is a unit-mass Gaussian of width σ_loc. */
export function reconstructImage(
  localizations: readonly Localization[],
  view: ViewBox,
  renderPx: number
): Float32Array {
  return splatGaussians(
    localizations.map((l) => ({ x: l.x, y: l.y, sigmaNm: Math.max(l.sigmaLocNm, RECON_SIGMA_FLOOR_NM) })),
    view,
    renderPx
  );
}
