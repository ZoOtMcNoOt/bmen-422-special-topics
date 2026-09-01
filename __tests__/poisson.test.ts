import { describe, expect, it } from 'vitest';
import { samplePoisson } from '@/lib/simulator/poisson';

function moments(lambda: number, n: number) {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const v = samplePoisson(lambda);
    s += v;
    s2 += v * v;
  }
  const mean = s / n;
  return { mean, variance: s2 / n - mean * mean };
}

describe('samplePoisson', () => {
  it('returns 0 for λ ≤ 0', () => {
    expect(samplePoisson(0)).toBe(0);
    expect(samplePoisson(-1)).toBe(0);
  });

  it('has mean ≈ variance ≈ λ in the exact (Knuth) regime', () => {
    const { mean, variance } = moments(10, 20_000);
    expect(Math.abs(mean - 10)).toBeLessThan(0.25); // SE is 0.022
    expect(variance).toBeGreaterThan(9.3);
    expect(variance).toBeLessThan(10.7);
  });

  it('has mean ≈ λ in the normal-approximation regime', () => {
    expect(Math.abs(moments(1000, 5000).mean - 1000)).toBeLessThan(5); // SE is 0.45
  });

  it('is reproducible with an injected RNG', () => {
    const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
    const a = Array.from({ length: 50 }, () => samplePoisson(12, lcg(7)));
    const b = Array.from({ length: 50 }, () => samplePoisson(12, lcg(7)));
    expect(a).toEqual(b);
  });
});
