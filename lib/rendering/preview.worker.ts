/**
 * Web Worker that renders high-resolution preview images off the main thread.
 *
 * Accepts emitter positions and renders:
 *   1. Ground truth — each emitter splatted as a tiny Gaussian (σ = 15 nm)
 *   2. Diffraction-limited — each emitter convolved with the microscope PSF
 *
 * Both are rendered at 10 nm/pixel (matching the STORM reconstruction grid)
 * so all three panels can be compared at the same scale.
 */

export type PreviewRequest = {
  emitters: { x: number; y: number }[];
  fieldSizeNm: { width: number; height: number };
  psfSigmaNm: number;
  outputPixelSizeNm: number;
};

export type PreviewResponse = {
  groundTruth: Float32Array;
  diffractionLimited: Float32Array;
  width: number;
  height: number;
};

function renderPreview(req: PreviewRequest): PreviewResponse {
  const { emitters, fieldSizeNm, psfSigmaNm, outputPixelSizeNm } = req;
  const W = Math.round(fieldSizeNm.width / outputPixelSizeNm);
  const H = Math.round(fieldSizeNm.height / outputPixelSizeNm);

  const gt = new Float32Array(W * H);
  const dl = new Float32Array(W * H);

  // Ground truth: tiny Gaussian per emitter (σ = 15 nm)
  const gtSigmaNm = 15;
  const gtSigmaPx = gtSigmaNm / outputPixelSizeNm;
  const gtRadius = Math.ceil(3 * gtSigmaPx) + 1;
  const gtNorm = 1 / (2 * Math.PI * gtSigmaPx * gtSigmaPx);

  // Diffraction-limited: PSF Gaussian per emitter
  const dlSigmaPx = psfSigmaNm / outputPixelSizeNm;
  const dlRadius = Math.ceil(3 * dlSigmaPx) + 1;
  const dlNorm = 1 / (2 * Math.PI * dlSigmaPx * dlSigmaPx);

  for (const e of emitters) {
    const cx = e.x / outputPixelSizeNm;
    const cy = e.y / outputPixelSizeNm;

    // Ground truth splat
    const gtXMin = Math.max(0, Math.floor(cx - gtRadius));
    const gtXMax = Math.min(W - 1, Math.ceil(cx + gtRadius));
    const gtYMin = Math.max(0, Math.floor(cy - gtRadius));
    const gtYMax = Math.min(H - 1, Math.ceil(cy + gtRadius));
    for (let py = gtYMin; py <= gtYMax; py++) {
      for (let px = gtXMin; px <= gtXMax; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        gt[py * W + px] += gtNorm * Math.exp(-(dx * dx + dy * dy) / (2 * gtSigmaPx * gtSigmaPx));
      }
    }

    // Diffraction-limited splat
    const dlXMin = Math.max(0, Math.floor(cx - dlRadius));
    const dlXMax = Math.min(W - 1, Math.ceil(cx + dlRadius));
    const dlYMin = Math.max(0, Math.floor(cy - dlRadius));
    const dlYMax = Math.min(H - 1, Math.ceil(cy + dlRadius));
    for (let py = dlYMin; py <= dlYMax; py++) {
      for (let px = dlXMin; px <= dlXMax; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        dl[py * W + px] += dlNorm * Math.exp(-(dx * dx + dy * dy) / (2 * dlSigmaPx * dlSigmaPx));
      }
    }
  }

  return { groundTruth: gt, diffractionLimited: dl, width: W, height: H };
}

self.onmessage = (e: MessageEvent<PreviewRequest>) => {
  const result = renderPreview(e.data);
  // Transfer the buffers so there's no copy overhead
  self.postMessage(result, [result.groundTruth.buffer, result.diffractionLimited.buffer] as never);
};
