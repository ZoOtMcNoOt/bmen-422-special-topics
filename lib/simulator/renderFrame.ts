import type { Emitter, Frame, SimulationParams } from './types';
import { gaussianPsfPixelIntegrated, gaussianPsfPoint } from './psf';
import { samplePoisson } from './poisson';
import { PSF_CUTOFF_SIGMAS } from './defaults';

/**
 * Render one camera frame: μ_i = N · ∫_pixel PSF + b, then Poisson-sample.
 * Pixel i spans [i·a, (i+1)·a] in nm — the same convention localization.ts uses.
 */
export function renderFrame(
  activeEmitters: Emitter[],
  params: SimulationParams,
  frameIndex: number,
  rng: () => number = Math.random
): Frame {
  const { width: W, height: H } = params.fieldSizePx;
  const a = params.pixelSizeNm;
  const sigma = params.psfSigmaNm;
  const N = params.photonsPerCycle;
  const b = params.backgroundPerPixel;
  const rigorous = params.rigorMode === 'rigorous';

  const expected = new Float64Array(W * H);
  const halfBox = Math.ceil((PSF_CUTOFF_SIGMAS * sigma) / a) + 1;

  for (const e of activeEmitters) {
    const cx = Math.floor(e.x / a);
    const cy = Math.floor(e.y / a);
    const xMin = Math.max(0, cx - halfBox);
    const xMax = Math.min(W - 1, cx + halfBox);
    const yMin = Math.max(0, cy - halfBox);
    const yMax = Math.min(H - 1, cy + halfBox);

    for (let py = yMin; py <= yMax; py++) {
      for (let px = xMin; px <= xMax; px++) {
        const w = rigorous
          ? gaussianPsfPixelIntegrated(px * a, (px + 1) * a, py * a, (py + 1) * a, e.x, e.y, sigma)
          : gaussianPsfPoint((px + 0.5) * a - e.x, (py + 0.5) * a - e.y, sigma) * a * a;
        expected[py * W + px] += N * w;
      }
    }
  }

  const pixels = new Float32Array(W * H);
  for (let i = 0; i < pixels.length; i++) pixels[i] = samplePoisson(expected[i] + b, rng);

  return { pixels, width: W, height: H, frameIndex };
}
