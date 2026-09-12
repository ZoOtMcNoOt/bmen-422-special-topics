import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/simulator/defaults';
import { decodeState, encodeState, type ShareableState } from '@/lib/url-state';

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
  densityPerUm2: 125,
};

describe('url-state', () => {
  it.each(['-1', '1000000000', 'Infinity', '1e309', '200oops', '200.5'])('rejects unsafe frame count %s', value => {
    expect(decodeState(`?frames=${value}`, DEFAULT_PARAMS).params.nFrames).toBe(DEFAULT_PARAMS.nFrames);
  });

  it('bounds noise, photons, density, drift and transition probabilities', () => {
    const decoded = decodeState('?N=-20&b=-1&density=999999&drift=99&duty=5', DEFAULT_PARAMS);
    expect(decoded.params).toEqual(DEFAULT_PARAMS);
    expect(decoded.densityPerUm2).toBe(250);
  });
  it('round-trips every field, including zeros and full float precision', () => {
    expect(decodeState(encodeState(state), DEFAULT_PARAMS)).toEqual(state);
  });

  it('falls back to defaults for missing fields', () => {
    const d = decodeState('', { ...DEFAULT_PARAMS, correctDrift: false });
    expect(d.params).toEqual({ ...DEFAULT_PARAMS, correctDrift: false });
    expect(d.preset).toBe('two-lines');
    expect(d.densityPerUm2).toBe(250);
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
    expect([...q.keys()].sort()).toEqual(['N', 'b', 'correct', 'density', 'drift', 'duty', 'frames', 'preset', 'rigor']);
  });
});
