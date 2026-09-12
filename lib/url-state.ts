import type { RigorMode, SimulationParams } from './simulator/types';
import {
  DEFAULT_DENSITY_PER_UM2,
  DEFAULT_PRESET,
  isPresetKind,
  type PresetKind,
} from './presets';

export type ShareableState = {
  params: SimulationParams;
  preset: PresetKind;
  densityPerUm2: number;
};

export function encodeState({
  params,
  preset,
  densityPerUm2,
}: ShareableState): string {
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
export function decodeState(
  query: string,
  defaults: SimulationParams,
): ShareableState {
  const q = new URLSearchParams(query);
  const rigor = q.get('rigor');
  const preset = q.get('preset');
  return {
    params: {
      ...defaults,
      photonsPerCycle: bounded(
        q.get('N'),
        defaults.photonsPerCycle,
        200,
        10_000,
        true,
      ),
      backgroundPerPixel: bounded(
        q.get('b'),
        defaults.backgroundPerPixel,
        0,
        100,
      ),
      nFrames: bounded(q.get('frames'), defaults.nFrames, 200, 10_000, true),
      dutyCycle: bounded(q.get('duty'), defaults.dutyCycle, 0.0001, 0.01),
      driftRateNmPerFrame: bounded(
        q.get('drift'),
        defaults.driftRateNmPerFrame,
        0,
        5,
      ),
      correctDrift: q.has('correct')
        ? q.get('correct') === '1'
        : defaults.correctDrift,
      rigorMode: isRigorMode(rigor) ? rigor : defaults.rigorMode,
    },
    preset: isPresetKind(preset) ? preset : DEFAULT_PRESET,
    densityPerUm2: bounded(q.get('density'), DEFAULT_DENSITY_PER_UM2, 25, 500),
  };
}

const isRigorMode = (v: unknown): v is RigorMode =>
  v === 'pedagogical' || v === 'rigorous';

// Shared links must obey the same work limits as the controls.
function bounded(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
    ? value
    : fallback;
}
