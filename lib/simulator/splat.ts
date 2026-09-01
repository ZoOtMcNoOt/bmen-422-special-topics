import { PSF_CUTOFF_SIGMAS } from './defaults';
import { erf } from './psf';
import type { ViewBox } from './types';

type GaussianPoint = { x: number; y: number; sigmaNm: number };

/**
 * Render unit-mass 2D Gaussians onto a square grid covering `view`, integrating
 * each over every pixel it touches via separable erf. Points whose footprint
 * lies entirely outside the view are skipped.
 */
export function splatGaussians(
  points: readonly GaussianPoint[],
  view: ViewBox,
  renderPx: number
): Float32Array {
  const pxNm = view.sizeNm / renderPx;
  const out = new Float32Array(renderPx * renderPx);

  for (const p of points) {
    const cx = (p.x - view.x0) / pxNm;
    const cy = (p.y - view.y0) / pxNm;
    const sPx = p.sigmaNm / pxNm;
    const radius = Math.max(1, Math.ceil(PSF_CUTOFF_SIGMAS * sPx) + 1);

    const xMin = Math.max(0, Math.floor(cx - radius));
    const xMax = Math.min(renderPx - 1, Math.ceil(cx + radius));
    const yMin = Math.max(0, Math.floor(cy - radius));
    const yMax = Math.min(renderPx - 1, Math.ceil(cy + radius));
    if (xMax < xMin || yMax < yMin) continue;

    const inv = 1 / (sPx * Math.SQRT2);
    const nx = xMax - xMin + 2;
    const ny = yMax - yMin + 2;
    const ex = new Float64Array(nx);
    const ey = new Float64Array(ny);
    for (let i = 0; i < nx; i++) ex[i] = erf((xMin + i - cx) * inv);
    for (let j = 0; j < ny; j++) ey[j] = erf((yMin + j - cy) * inv);

    for (let py = yMin; py <= yMax; py++) {
      const wy = 0.5 * (ey[py - yMin + 1] - ey[py - yMin]);
      if (wy <= 0) continue;
      const row = py * renderPx;
      for (let px = xMin; px <= xMax; px++) {
        out[row + px] += wy * 0.5 * (ex[px - xMin + 1] - ex[px - xMin]);
      }
    }
  }
  return out;
}
