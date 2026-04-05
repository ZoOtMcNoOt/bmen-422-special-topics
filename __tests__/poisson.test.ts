import { describe, it, expect } from 'vitest';
import { samplePoisson } from '@/lib/simulator/poisson';

describe('samplePoisson', () => {
  it('has correct mean at lambda=10 over 10000 samples', () => {
    const n = 10000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += samplePoisson(10);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(9.7);
    expect(mean).toBeLessThan(10.3);
  });

  it('has correct variance at lambda=10 (variance = mean for Poisson)', () => {
    const n = 10000;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) samples.push(samplePoisson(10));
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    expect(variance).toBeGreaterThan(9);
    expect(variance).toBeLessThan(11);
  });

  it('handles large lambda via Gaussian approximation', () => {
    const n = 5000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += samplePoisson(1000);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(990);
    expect(mean).toBeLessThan(1010);
  });

  it('returns 0 for lambda = 0', () => {
    expect(samplePoisson(0)).toBe(0);
  });
});
