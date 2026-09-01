import { describe, expect, it } from 'vitest';
import { applyDriftToEmitter, computeDriftAtFrame, correctLocalizationDrift } from '@/lib/simulator/drift';
import type { Localization } from '@/lib/simulator/types';
import { loc } from './fixtures';

const jitter = (scale: number) => (Math.random() - 0.5) * scale;

function cloud(opts: { frames: number; perFrame: number; driftX: number; driftY: number; spreadX?: number }): Localization[] {
  const out: Localization[] = [];
  for (let f = 0; f < opts.frames; f++) {
    for (let i = 0; i < opts.perFrame; i++) {
      out.push(loc(5000 + f * opts.driftX + jitter(opts.spreadX ?? 4), 5000 + f * opts.driftY + jitter(4), { frameIndex: f }));
    }
  }
  return out;
}

describe('drift', () => {
  it('grows linearly with frame index', () => {
    expect(computeDriftAtFrame(0, 2)).toEqual({ x: 0, y: 0 });
    expect(computeDriftAtFrame(100, 2)).toEqual({ x: 200, y: 100 });
  });

  it('applyDriftToEmitter shifts a position', () => {
    expect(applyDriftToEmitter({ x: 100, y: 200 }, { x: 5, y: -3 })).toEqual({ x: 105, y: 197 });
  });

  it('recovers an applied linear drift', () => {
    const fixed = correctLocalizationDrift(cloud({ frames: 100, perFrame: 20, driftX: 1.5, driftY: 0.8 }));
    const meanAt = (f: number, k: 'x' | 'y') => {
      const fs = fixed.filter((l) => l.frameIndex === f);
      return fs.reduce((a, l) => a + l[k], 0) / fs.length;
    };
    expect(Math.abs(meanAt(99, 'x') - meanAt(0, 'x'))).toBeLessThan(2);
    expect(Math.abs(meanAt(99, 'y') - meanAt(0, 'y'))).toBeLessThan(2);
  });

  it('adds negligible shift when there is no drift', () => {
    const original = cloud({ frames: 100, perFrame: 20, driftX: 0, driftY: 0 });
    const fixed = correctLocalizationDrift(original);
    // Spurious end-of-run shift has SD ≈ σ_pos·√(12/n) ≈ 0.09 nm here.
    let worst = 0;
    fixed.forEach((l, i) => (worst = Math.max(worst, Math.abs(l.x - original[i].x), Math.abs(l.y - original[i].y))));
    expect(worst).toBeLessThan(1);
  });

  it('bounds the spurious shift on an extended structure by σ_pos·√(12/n)', () => {
    // Localizations spread over a 3 µm line — the worst case for a fitted slope with no real drift.
    const original = cloud({ frames: 200, perFrame: 20, driftX: 0, driftY: 0, spreadX: 3000 });
    const fixed = correctLocalizationDrift(original);
    const bound = 5 * (3000 / Math.sqrt(12)) * Math.sqrt(12 / original.length); // 5σ
    let worst = 0;
    fixed.forEach((l, i) => (worst = Math.max(worst, Math.abs(l.x - original[i].x))));
    expect(worst).toBeLessThan(bound);
  });

  it('leaves degenerate inputs untouched', () => {
    const one = [loc(1, 2)];
    expect(correctLocalizationDrift(one)).toBe(one);
    const sameFrame = cloud({ frames: 1, perFrame: 10, driftX: 0, driftY: 0 });
    expect(correctLocalizationDrift(sameFrame)).toBe(sameFrame);
  });
});
