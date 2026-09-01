import type { Localization } from './simulator/types';

/**
 * For k in 0..nFrames, the number of localizations acquired in the first k
 * frames (frameIndex < k). Requires input sorted by frameIndex, which
 * runSimulation guarantees. Drives the reconstruction scrubber.
 */
export function locsThroughFrame(localizations: readonly Localization[], nFrames: number): Uint32Array {
  const counts = new Uint32Array(nFrames + 1);
  let i = 0;
  for (let k = 0; k <= nFrames; k++) {
    while (i < localizations.length && localizations[i].frameIndex < k) i++;
    counts[k] = i;
  }
  return counts;
}
