import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/simulator/random';

describe('repeatable simulation randomness', () => {
  it.each([0, 42, 2 ** 32 - 1])('repeats an independent stream for seed %s', (seed) => {
    const first = seededRandom(seed), second = seededRandom(seed);
    const other = seededRandom(seed ^ 0xa5a5a5a5);
    const values = Array.from({ length: 20_000 }, first);
    expect(Array.from({ length: 20_000 }, second)).toEqual(values);
    expect(Array.from({ length: 20_000 }, other)).not.toEqual(values);
    expect(Math.min(...values)).toBeGreaterThan(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});
