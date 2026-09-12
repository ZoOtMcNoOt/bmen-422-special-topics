import { describe, expect, it } from 'vitest';
import { localizationCsv } from '@/lib/export';
import { runSimulation } from '@/lib/simulator/runSimulation';
import { DEFAULT_PARAMS } from '@/lib/simulator/defaults';

const field = { width: 10240, height: 10240 };
const sample = {
  emitters: [{ x: 5120.123, y: 5120.456 }],
  fieldSizeNm: field,
  label: 'One emitter',
};

describe('quantitative CSV', () => {
  it('exports actual raw and corrected results with acquisition metadata', async () => {
    const result = await runSimulation(
      sample,
      { ...DEFAULT_PARAMS, nFrames: 4, dutyCycle: 0.5, driftRateNmPerFrame: 2 },
      { rng: () => 0.37 },
    );
    expect(result.localizations.length).toBeGreaterThan(0);
    const [header, ...rows] = localizationCsv(result).trim().split('\r\n');
    const keys = header.split(',');
    expect(rows.length).toBe(result.localizations.length);
    const last = Object.fromEntries(
      rows
        .at(-1)!
        .split(',')
        .map((v, i) => [keys[i], Number(v)]),
    );
    expect(last.raw_x_nm).toBe(result.rawLocalizations.at(-1)!.x);
    expect(last.corrected_x_nm).toBe(result.localizations.at(-1)!.x);
    expect(last.raw_x_nm - last.corrected_x_nm).toBeCloseTo(last.frame * 2, 10);
    expect(last.frames_acquired).toBe(4);
    expect(last.molecules_in_sample).toBe(1);
    expect(last.activation_fraction).toBe(0.5);
    const seededRows = localizationCsv(result, 0).trim().split('\r\n');
    const metadata = Object.fromEntries(seededRows[1].split(',').map((value, i) => [keys[i], value]));
    expect(metadata.random_seed).toBe('0');
    expect(metadata.fit_method).toBe(result.params.rigorMode);
    expect(rows[0].split(',')[keys.indexOf('random_seed')]).toBe('');
    expect(
      localizationCsv({
        ...result,
        params: { ...result.params, correctDrift: false },
      }),
    ).toBe(localizationCsv(result));
  });

  it('exports only a header when there are no accepted fits', async () => {
    const result = await runSimulation(
      { ...sample, emitters: [] },
      { ...DEFAULT_PARAMS, nFrames: 0 },
    );
    expect(localizationCsv(result).trim().split('\r\n')).toHaveLength(1);
  });
});
