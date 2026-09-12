import type { RigorMode, SimulationParams } from './simulator/types';
import {
  DEFAULT_PRESET,
  PRESETS, MIN_EMITTERS, MAX_EMITTERS, EMITTER_STEP,
  isPresetKind,
  type PresetKind,
} from './presets';
import { DEFAULT_SEED } from './simulator/random';

export type ShareableState = {
  params: SimulationParams;
  preset: PresetKind;
  moleculeCount: number;
  seed: number;
};

export function encodeState({
  params,
  preset,
  moleculeCount,
  seed,
}: ShareableState): string {
  const q = new URLSearchParams();
  q.set('preset', preset);
  q.set('emitters', String(moleculeCount));
  q.set('seed', String(seed));
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
  const requestedPreset = q.get('preset');
  const preset = isPresetKind(requestedPreset) ? requestedPreset : DEFAULT_PRESET;
  const defaultCount = PRESETS[preset].defaultEmitters;
  const count = bounded(q.get('emitters'), defaultCount, MIN_EMITTERS, MAX_EMITTERS, true);
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
    preset,
    moleculeCount: count % EMITTER_STEP === 0 ? count : defaultCount,
    seed: bounded(q.get('seed'), DEFAULT_SEED, 0, 2 ** 32 - 1, true),
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
