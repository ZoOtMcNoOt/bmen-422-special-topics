import type { SimulationParams } from './simulator/types';

export function encodeParamsToQuery(
  params: SimulationParams,
  preset: string,
  density: number
): string {
  const p = new URLSearchParams();
  p.set('preset', preset);
  p.set('density', density.toString());
  p.set('N', params.photonsPerCycle.toString());
  p.set('b', params.backgroundPerPixel.toString());
  p.set('frames', params.nFrames.toString());
  p.set('duty', params.dutyCycle.toExponential(2));
  p.set('drift', params.driftRateNmPerFrame.toString());
  p.set('correct', params.correctDrift ? '1' : '0');
  p.set('rigor', params.rigorMode);
  return p.toString();
}

export function decodeQueryToParams(
  query: string,
  defaults: SimulationParams
): { params: SimulationParams; preset: string; density: number } {
  const p = new URLSearchParams(query);
  const params: SimulationParams = {
    ...defaults,
    photonsPerCycle: parseInt(p.get('N') ?? '') || defaults.photonsPerCycle,
    backgroundPerPixel: parseFloat(p.get('b') ?? '') || defaults.backgroundPerPixel,
    nFrames: parseInt(p.get('frames') ?? '') || defaults.nFrames,
    dutyCycle: parseFloat(p.get('duty') ?? '') || defaults.dutyCycle,
    driftRateNmPerFrame: parseFloat(p.get('drift') ?? '') || defaults.driftRateNmPerFrame,
    correctDrift: p.get('correct') !== '0',
    rigorMode: (p.get('rigor') as 'pedagogical' | 'rigorous') ?? defaults.rigorMode,
  };
  return {
    params,
    preset: p.get('preset') ?? 'two-lines',
    density: parseFloat(p.get('density') ?? '') || 250,
  };
}
