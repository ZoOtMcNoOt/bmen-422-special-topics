'use client';

import { useEffect, useRef, useState } from 'react';
import type { GroundTruth, ViewBox } from '@/lib/simulator/types';
import type { PreviewRequest, PreviewResponse } from './preview.worker';

type Preview = { groundTruth: Float32Array | null; diffractionLimited: Float32Array | null };
const EMPTY: Preview = { groundTruth: null, diffractionLimited: null };

/**
 * A string that changes whenever the rendered preview would. Computed purely
 * from props so the render can tell a current reply from a stale one without
 * touching a ref.
 */
function requestKey(gt: GroundTruth, view: ViewBox, renderPx: number, psfSigmaNm: number): string {
  const e = gt.emitters;
  const first = e[0];
  const last = e[e.length - 1];
  return [gt.label, e.length, first?.x, first?.y, last?.x, last?.y, view.x0, view.y0, view.sizeNm, renderPx, psfSigmaNm].join('|');
}

/** Ground-truth and diffraction-limited previews of `view`, rendered in a Worker. */
export function usePreviewWorker(
  groundTruth: GroundTruth | null,
  view: ViewBox,
  renderPx: number,
  psfSigmaNm: number
): Preview {
  const workerRef = useRef<Worker | null>(null);
  const latestKey = useRef<string | null>(null);
  const [reply, setReply] = useState<PreviewResponse | null>(null);

  useEffect(() => {
    const w = new Worker(new URL('./preview.worker.ts', import.meta.url));
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<PreviewResponse>) => {
      // Drop replies to superseded requests so a slow render can't overwrite a newer one.
      if (e.data.key === latestKey.current) setReply(e.data);
    };
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  const key = groundTruth ? requestKey(groundTruth, view, renderPx, psfSigmaNm) : null;

  useEffect(() => {
    latestKey.current = key;
    if (!workerRef.current || !groundTruth || !key) return;
    const req: PreviewRequest = { key, emitters: groundTruth.emitters, view, renderPx, psfSigmaNm };
    workerRef.current.postMessage(req);
  }, [key, groundTruth, view, renderPx, psfSigmaNm]);

  // Only a reply to the current inputs is shown; until it arrives the panels show their empty state.
  return key && reply?.key === key ? reply : EMPTY;
}
