/**
 * Thompson-Larson-Webb (2002) localization precision formula.
 *
 * σ²_loc ≈ σ²/N + a²/(12N) + 8π σ⁴ v_b / (a² N²)
 *
 * where:
 *   σ = PSF standard deviation (nm)
 *   N = total detected photons from the molecule
 *   a = pixel size (nm)
 *   v_b = background noise variance per pixel, in photon-count units
 *
 * Thompson's b is a noise standard deviation, so its b² is a variance.
 * Here the camera background is Poisson: variance equals the supplied mean
 * backgroundPerPixel. This approximation is not the exact Fisher bound;
 * finite fitting windows and overlapping emitters can give larger errors.
 *
 * Reference: Thompson, Larson, Webb, Biophys J 82:2775 (2002). DOI: 10.1016/s0006-3495(02)75618-x
 */
export function thompsonSigmaLoc(
  psfSigmaNm: number,
  photons: number,
  pixelSizeNm: number,
  backgroundPerPixel: number
): number {
  if (photons <= 0) return Infinity;
  const s = psfSigmaNm;
  const N = photons;
  const a = pixelSizeNm;
  const backgroundVariance = backgroundPerPixel;

  const shotNoise = (s * s) / N;
  const pixelation = (a * a) / (12 * N);
  const background = (8 * Math.PI * s * s * s * s * backgroundVariance) / (a * a * N * N);

  return Math.sqrt(shotNoise + pixelation + background);
}
