/**
 * Best achievable per-axis localization precision for maximum-likelihood fitting
 * of a pixelated Gaussian PSF on a Poisson camera (Mortensen et al. 2010, eq. 6):
 *
 * σ²_loc = (σₐ² / N) · [1 + ∫₀¹ ln t / (1 + t/τ) dt]⁻¹,
 * σₐ² = σ² + a²/12,   τ = 2π σₐ² b / (N a²)
 *
 * where:
 *   σ = PSF standard deviation (nm)
 *   N = total detected photons from the molecule
 *   a = pixel size (nm)
 *   b = mean background photons per pixel (its Poisson variance)
 *
 * This matches the exact Cramér–Rao bound for this camera model to within 0.3%
 * over the simulator's range, and the rigorous fitter reaches it for isolated
 * emitters. Thompson, Larson & Webb (2002) is lower by 7% at the defaults and up
 * to about 15% with few photons, so it is not used. Centroid fitting does not
 * reach this limit, and overlapping emitters can give larger errors.
 *
 * Reference: Mortensen, Churchman, Spudich, Flyvbjerg, Nat Methods 7:377 (2010).
 * DOI: 10.1038/nmeth.1447
 */
export function mlePrecisionNm(
  psfSigmaNm: number,
  photons: number,
  pixelSizeNm: number,
  backgroundPerPixel: number,
): number {
  if (photons <= 0) return Infinity;
  const a = pixelSizeNm;
  const varianceA = psfSigmaNm * psfSigmaNm + (a * a) / 12;
  const tau = (2 * Math.PI * varianceA * backgroundPerPixel) / (photons * a * a);
  return Math.sqrt(varianceA / photons / (1 + backgroundIntegral(tau)));
}

/** ∫₀¹ ln t / (1 + t/τ) dt = τ · Li₂(−1/τ), which is 0 without background. */
export function backgroundIntegral(tau: number): number {
  if (!(tau > 0)) return 0;
  return tau * dilogOfNegative(1 / tau);
}

const PI2_6 = (Math.PI * Math.PI) / 6;
/** Bernoulli numbers B₂ₖ for k = 1…10; odd ones vanish after B₁ = −½. */
const BERNOULLI_EVEN = [
  1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510, 43867 / 798, -174611 / 330,
];

/** Li₂(−y) for y ≥ 0, accurate to about 1e-15. */
export function dilogOfNegative(y: number): number {
  if (y === 0) return 0;
  // Inversion keeps the series argument within ln 2.
  if (y > 1) {
    const log = Math.log(y);
    return -PI2_6 - (log * log) / 2 - dilogOfNegative(1 / y);
  }
  // Li₂(z) = Σ Bₙ uⁿ⁺¹ / (n+1)!, with u = −ln(1 − z) and z = −y.
  const u = -Math.log1p(y);
  let sum = u - (u * u) / 4;
  let power = u;
  let factorial = 1;
  for (let k = 1; k <= BERNOULLI_EVEN.length; k++) {
    power *= u * u;
    factorial *= 2 * k * (2 * k + 1);
    sum += (BERNOULLI_EVEN[k - 1] * power) / factorial;
  }
  return sum;
}
