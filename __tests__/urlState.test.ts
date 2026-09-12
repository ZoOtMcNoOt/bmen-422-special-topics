import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/simulator/defaults';
import { decodeState, encodeState, type ShareableState } from '@/lib/url-state';
import { PRESETS } from '@/lib/presets';
import { DEFAULT_SEED } from '@/lib/simulator/random';

const state: ShareableState = {
  params: {
    ...DEFAULT_PARAMS,
    photonsPerCycle: 1234,
    backgroundPerPixel: 0,
    nFrames: 777,
    dutyCycle: 0.0012345,
    driftRateNmPerFrame: 0,
    correctDrift: false,
    rigorMode: 'pedagogical',
  },
  preset: 'ring',
  moleculeCount: 120,
  seed: 20260912,
};

describe('url-state', () => {
  it.each(['-1', '1000000000', 'Infinity', '1e309', '200oops', '200.5'])('rejects unsafe frame count %s', value => {
    expect(decodeState(`?frames=${value}`, DEFAULT_PARAMS).params.nFrames).toBe(DEFAULT_PARAMS.nFrames);
  });

  it('bounds noise, photons, label count, seed, drift and transition probabilities', () => {
    const decoded = decodeState('?N=-20&b=-1&emitters=999999&seed=4294967296&drift=99&duty=5', DEFAULT_PARAMS);
    expect(decoded.params).toEqual(DEFAULT_PARAMS);
    expect(decoded.moleculeCount).toBe(PRESETS['two-lines'].defaultEmitters);
    expect(decoded.seed).toBe(DEFAULT_SEED);
  });
  it('round-trips every field, including zeros and full float precision', () => {
    expect(decodeState(encodeState(state), DEFAULT_PARAMS)).toEqual(state);
  });

  it('falls back to defaults for missing fields', () => {
    const d = decodeState('', { ...DEFAULT_PARAMS, correctDrift: false });
    expect(d.params).toEqual({ ...DEFAULT_PARAMS, correctDrift: false });
    expect(d.preset).toBe('two-lines');
    expect(d.moleculeCount).toBe(PRESETS['two-lines'].defaultEmitters);
    expect(d.seed).toBe(DEFAULT_SEED);
  });

  it('rejects malformed values rather than passing them through', () => {
    const d = decodeState('?rigor=banana&preset=nope&N=abc&b=&duty=NaN', DEFAULT_PARAMS);
    expect(d.params.rigorMode).toBe(DEFAULT_PARAMS.rigorMode);
    expect(d.preset).toBe('two-lines');
    expect(d.params.photonsPerCycle).toBe(DEFAULT_PARAMS.photonsPerCycle);
    expect(d.params.backgroundPerPixel).toBe(DEFAULT_PARAMS.backgroundPerPixel);
    expect(d.params.dutyCycle).toBe(DEFAULT_PARAMS.dutyCycle);
  });

  it('never encodes camera geometry (it is not user-adjustable)', () => {
    const q = new URLSearchParams(encodeState(state));
    expect([...q.keys()].sort()).toEqual(['N', 'b', 'correct', 'drift', 'duty', 'emitters', 'frames', 'preset', 'rigor', 'seed']);
  });

  it.each(['19', '21', '125', '10001', 'NaN'])('rejects label counts the controls cannot represent: %s', (count) => {
    expect(decodeState(`?preset=ring&emitters=${count}`, DEFAULT_PARAMS).moleculeCount).toBe(PRESETS.ring.defaultEmitters);
  });

  it('migrates old density links to sample defaults while preserving acquisition settings', () => {
    const decoded = decodeState('?preset=ring&density=250&N=5000&b=20&frames=2000&duty=0.001&drift=0&correct=1&rigor=rigorous', DEFAULT_PARAMS);
    expect(decoded.moleculeCount).toBe(120);
    expect(decoded.params).toEqual({ ...DEFAULT_PARAMS, photonsPerCycle: 5000, backgroundPerPixel: 20, nFrames: 2000, dutyCycle: 0.001, driftRateNmPerFrame: 0, correctDrift: true, rigorMode: 'rigorous' });
    expect(new URLSearchParams(encodeState(decoded)).has('density')).toBe(false);
  });

  it.each([0, 4294967295])('preserves a seed at the unsigned boundary %s', (seed) => {
    expect(decodeState(`?seed=${seed}`, DEFAULT_PARAMS).seed).toBe(seed);
  });
});
