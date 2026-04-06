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

// NaN-aware numeric parse: `||` treats 0 as falsy, which silently
// corrupts valid zero values for backgroundPerPixel and driftRateNmPerFrame.
function numOr(raw: string | null, fallback: number): number {
  const v = parseFloat(raw ?? '');
  return Number.isNaN(v) ? fallback : v;
}
function intOr(raw: string | null, fallback: number): number {
  const v = parseInt(raw ?? '', 10);
  return Number.isNaN(v) ? fallback : v;
}

export function decodeQueryToParams(
  query: string,
  defaults: SimulationParams
): { params: SimulationParams; preset: string; density: number } {
  const p = new URLSearchParams(query);
  const params: SimulationParams = {
    ...defaults,
    photonsPerCycle: intOr(p.get('N'), defaults.photonsPerCycle),
    backgroundPerPixel: numOr(p.get('b'), defaults.backgroundPerPixel),
    nFrames: intOr(p.get('frames'), defaults.nFrames),
    dutyCycle: numOr(p.get('duty'), defaults.dutyCycle),
    driftRateNmPerFrame: numOr(p.get('drift'), defaults.driftRateNmPerFrame),
    correctDrift: p.get('correct') !== '0',
    rigorMode: (p.get('rigor') as 'pedagogical' | 'rigorous') ?? defaults.rigorMode,
  };
  return {
    params,
    preset: p.get('preset') ?? 'two-lines',
    density: numOr(p.get('density'), 250),
  };
}
