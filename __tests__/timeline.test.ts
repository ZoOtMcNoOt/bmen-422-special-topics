import { describe, expect, it } from 'vitest';
import { locsThroughFrame } from '@/lib/timeline';
import { loc } from './fixtures';

const at = (frameIndex: number) => loc(0, 0, { frameIndex });

describe('locsThroughFrame', () => {
  it('counts localizations in the first k frames, for k = 0…nFrames', () => {
    expect([...locsThroughFrame([0, 0, 1, 2, 2, 2].map(at), 3)]).toEqual([0, 2, 3, 6]);
  });

  it('handles empty frames and no localizations', () => {
    expect([...locsThroughFrame([at(0), at(3)], 4)]).toEqual([0, 1, 1, 1, 2]);
    expect([...locsThroughFrame([], 3)]).toEqual([0, 0, 0, 0]);
  });
});
