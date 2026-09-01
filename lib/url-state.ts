import type { RigorMode, SimulationParams } from './simulator/types';
import { DEFAULT_DENSITY_PER_UM2, DEFAULT_PRESET, isPresetKind, type PresetKind } from './presets';

export type ShareableState = {
  params: SimulationParams;
  preset: PresetKind;
  densityPerUm2: number;
};

export function encodeState({ params, preset, densityPerUm2 }: ShareableState): string {
  const q = new URLSearchParams();
  q.set('preset', preset);
  q.set('density', String(densityPerUm2));
  q.set('N', String(params.photonsPerCycle));
  q.set('b', String(params.backgroundPerPixel));
  q.set('frames', String(params.nFrames));
  q.set('duty', String(params.dutyCycle));
  q.set('drift', String(params.driftRateNmPerFrame));
  q.set('correct', params.correctDrift ? '1' : '0');
  q.set('rigor', params.rigorMode);
  return q.toString();
}

/** Restore state from a query string; any missing or malformed field falls back to `defaults`. */
export function decodeState(query: string, defaults: SimulationParams): ShareableState {
  const q = new URLSearchParams(query);
  const rigor = q.get('rigor');
  const preset = q.get('preset');
  return {
    params: {
      ...defaults,
      photonsPerCycle: intOr(q.get('N'), defaults.photonsPerCycle),
      backgroundPerPixel: numOr(q.get('b'), defaults.backgroundPerPixel),
      nFrames: intOr(q.get('frames'), defaults.nFrames),
      dutyCycle: numOr(q.get('duty'), defaults.dutyCycle),
      driftRateNmPerFrame: numOr(q.get('drift'), defaults.driftRateNmPerFrame),
      correctDrift: q.has('correct') ? q.get('correct') === '1' : defaults.correctDrift,
      rigorMode: isRigorMode(rigor) ? rigor : defaults.rigorMode,
    },
    preset: isPresetKind(preset) ? preset : DEFAULT_PRESET,
    densityPerUm2: numOr(q.get('density'), DEFAULT_DENSITY_PER_UM2),
  };
}

const isRigorMode = (v: unknown): v is RigorMode => v === 'pedagogical' || v === 'rigorous';

// `||` would treat a legitimate 0 as missing; check NaN explicitly.
function numOr(raw: string | null, fallback: number): number {
  const v = parseFloat(raw ?? '');
  return Number.isFinite(v) ? v : fallback;
}
function intOr(raw: string | null, fallback: number): number {
  const v = parseInt(raw ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}
