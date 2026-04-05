import type { Emitter, Frame, SimulationParams } from './types';
import { gaussianPsfPixelIntegrated, gaussianPsfPoint } from './psf';
import { samplePoisson } from './poisson';

/**
 * Render a single camera frame given the active emitters and simulation parameters.
 *
 * The expected photon count at pixel i from emitter j is:
 *   μ_{ij} = N * ∫∫_{pixel i} PSF(x - x_j, y - y_j) dx dy
 * Plus a uniform background b. Each pixel is then Poisson-sampled.
 */
export function renderFrame(
  activeEmitters: Emitter[],
  params: SimulationParams,
  frameIndex: number
): Frame {
  const { width: W, height: H } = params.fieldSizePx;
  const a = params.pixelSizeNm;
  const sigma = params.psfSigmaNm;
  const N = params.photonsPerCycle;
  const b = params.backgroundPerPixel;
  const expected = new Float64Array(W * H);

  // Accumulate expected photons per pixel from each emitter
  // Only iterate over pixels within a bounding box of ±3σ around the emitter for speed
  const halfBox = Math.ceil((3 * sigma) / a) + 1;

  for (const emitter of activeEmitters) {
    const pxFloat = emitter.x / a;
    const pyFloat = emitter.y / a;
    const pxCenter = Math.floor(pxFloat);
    const pyCenter = Math.floor(pyFloat);
    const xMin = Math.max(0, pxCenter - halfBox);
    const xMax = Math.min(W - 1, pxCenter + halfBox);
    const yMin = Math.max(0, pyCenter - halfBox);
    const yMax = Math.min(H - 1, pyCenter + halfBox);

    for (let py = yMin; py <= yMax; py++) {
      for (let px = xMin; px <= xMax; px++) {
        let weight: number;
        if (params.rigorMode === 'rigorous') {
          weight = gaussianPsfPixelIntegrated(
            px * a,
            (px + 1) * a,
            py * a,
            (py + 1) * a,
            emitter.x,
            emitter.y,
            sigma
          );
        } else {
          const cxNm = (px + 0.5) * a;
          const cyNm = (py + 0.5) * a;
          weight =
            gaussianPsfPoint(cxNm - emitter.x, cyNm - emitter.y, sigma) * (a * a);
        }
        expected[py * W + px] += N * weight;
      }
    }
  }

  // Add background and Poisson-sample every pixel
  const pixels = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const lambda = expected[i] + b;
    pixels[i] = samplePoisson(lambda);
  }

  return { pixels, width: W, height: H, frameIndex };
}
