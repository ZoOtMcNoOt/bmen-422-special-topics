import { correctLocalizationDrift } from './simulator/drift';
import type { SimulationResult } from './simulator/types';

/** Full acquisition with raw/known-drift-corrected positions and zero-based frame indices. */
export function localizationCsv(result: SimulationResult, seed?: number): string {
  const header = [
    'frame',
    'raw_x_nm',
    'raw_y_nm',
    'corrected_x_nm',
    'corrected_y_nm',
    'thompson_sigma_nm',
    'photons',
    'photon_yield_per_active_frame',
    'background_mean_per_pixel',
    'pixel_size_nm',
    'psf_sigma_nm',
    'drift_nm_per_frame',
    'frames_acquired',
    'molecules_in_sample',
    'activation_fraction',
    'random_seed',
    'fit_method',
  ];
  const p = result.params;
  const corrected = correctLocalizationDrift(
    result.rawLocalizations,
    p.driftRateNmPerFrame,
  );
  const rows = corrected.map((loc, i) => {
    const raw = result.rawLocalizations[i];
    return [
      loc.frameIndex,
      raw.x,
      raw.y,
      loc.x,
      loc.y,
      loc.sigmaLocNm,
      loc.nPhotons,
      p.photonsPerCycle,
      p.backgroundPerPixel,
      p.pixelSizeNm,
      p.psfSigmaNm,
      p.driftRateNmPerFrame,
      result.framesCompleted,
      result.groundTruth.emitters.length,
      p.dutyCycle,
      seed ?? '',
      p.rigorMode,
    ].join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
