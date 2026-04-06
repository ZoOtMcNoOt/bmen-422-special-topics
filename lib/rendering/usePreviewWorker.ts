'use client';

import { useEffect, useRef, useState } from 'react';
import type { GroundTruth } from '@/lib/simulator/types';
import type { PreviewRequest, PreviewResponse } from './preview.worker';

export type PreviewResult = {
  groundTruth: Float32Array | null;
  diffractionLimited: Float32Array | null;
  width: number;
  height: number;
};

const OUTPUT_PIXEL_SIZE_NM = 10;

/**
 * Hook that runs ground-truth and diffraction-limited rendering in a Web Worker
 * at full reconstruction resolution (10 nm/pixel).
 */
export function usePreviewWorker(
  groundTruth: GroundTruth | null,
  psfSigmaNm: number
): PreviewResult {
  const workerRef = useRef<Worker | null>(null);
  const [result, setResult] = useState<PreviewResult>({
    groundTruth: null,
    diffractionLimited: null,
    width: 0,
    height: 0,
  });

  // Spin up the worker once
  useEffect(() => {
    const w = new Worker(new URL('./preview.worker.ts', import.meta.url));
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<PreviewResponse>) => {
      setResult({
        groundTruth: e.data.groundTruth,
        diffractionLimited: e.data.diffractionLimited,
        width: e.data.width,
        height: e.data.height,
      });
    };
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  // Post new work whenever inputs change
  useEffect(() => {
    if (!workerRef.current || !groundTruth) return;
    const req: PreviewRequest = {
      emitters: groundTruth.emitters,
      fieldSizeNm: groundTruth.fieldSizeNm,
      psfSigmaNm,
      outputPixelSizeNm: OUTPUT_PIXEL_SIZE_NM,
    };
    workerRef.current.postMessage(req);
  }, [groundTruth, psfSigmaNm]);

  return result;
}
