/**
 * Thompson-Larson-Webb (2002) localization precision formula.
 *
 * σ²_loc = σ²/N + a²/(12N) + 8π σ⁴ b² / (a² N²)
 *
 * where:
 *   σ = PSF standard deviation (nm)
 *   N = total detected photons from the molecule
 *   a = pixel size (nm)
 *   b = background photons per pixel
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
  const b = backgroundPerPixel;

  const shotNoise = (s * s) / N;
  const pixelation = (a * a) / (12 * N);
  const background = (8 * Math.PI * s * s * s * s * b * b) / (a * a * N * N);

  return Math.sqrt(shotNoise + pixelation + background);
}
