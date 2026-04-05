/**
 * Error function (Abramowitz & Stegun approximation 7.1.26, max error ~1.5e-7)
 */
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

/**
 * Point-sampled 2D Gaussian PSF (pedagogical mode).
 * Returns the probability density at offset (dx, dy) from the emitter.
 */
export function gaussianPsfPoint(dx: number, dy: number, sigmaNm: number): number {
  const r2 = dx * dx + dy * dy;
  const norm = 1.0 / (2 * Math.PI * sigmaNm * sigmaNm);
  return norm * Math.exp(-r2 / (2 * sigmaNm * sigmaNm));
}

/**
 * Pixel-integrated 2D Gaussian PSF (rigorous mode).
 * Integrates the Gaussian over the rectangular pixel [xLow, xHigh] x [yLow, yHigh],
 * centered at emitter position (x0, y0). Returns the fraction of total photons
 * (between 0 and 1) that fall in this pixel for a unit-normalized Gaussian.
 */
export function gaussianPsfPixelIntegrated(
  xLow: number,
  xHigh: number,
  yLow: number,
  yHigh: number,
  x0: number,
  y0: number,
  sigmaNm: number
): number {
  const norm = sigmaNm * Math.SQRT2;
  const ex = 0.5 * (erf((xHigh - x0) / norm) - erf((xLow - x0) / norm));
  const ey = 0.5 * (erf((yHigh - y0) / norm) - erf((yLow - y0) / norm));
  return ex * ey;
}
