import type { Emitter, ViewBox } from '@/lib/simulator/types';
import { splatGaussians } from '@/lib/simulator/splat';

export type PreviewRequest = {
  /** Identifies the inputs; echoed back so the hook can match replies to requests. */
  key: string;
  emitters: Emitter[];
  view: ViewBox;
  renderPx: number;
  psfSigmaNm: number;
};

export type PreviewResponse = {
  key: string;
  groundTruth: Float32Array;
  diffractionLimited: Float32Array;
};

/** Ground truth is drawn with dots ~1.2 render pixels wide at any zoom. */
const GT_SIGMA_PX = 1.2;

self.onmessage = (e: MessageEvent<PreviewRequest>) => {
  const { key, emitters, view, renderPx, psfSigmaNm } = e.data;
  const gtSigmaNm = (GT_SIGMA_PX * view.sizeNm) / renderPx;

  const groundTruth = splatGaussians(emitters.map((p) => ({ ...p, sigmaNm: gtSigmaNm })), view, renderPx);
  const diffractionLimited = splatGaussians(emitters.map((p) => ({ ...p, sigmaNm: psfSigmaNm })), view, renderPx);

  const response: PreviewResponse = { key, groundTruth, diffractionLimited };
  self.postMessage(response, { transfer: [groundTruth.buffer, diffractionLimited.buffer] });
};
