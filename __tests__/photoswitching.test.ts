import { describe, expect, it } from 'vitest';
import { initEmitterStates, kOnFromDutyCycle, stepPhotoswitching } from '@/lib/simulator/photoswitching';

describe('photoswitching', () => {
  it('starts every emitter dark', () => {
    expect(initEmitterStates(100).every((s) => !s.isOn)).toBe(true);
  });

  it('kOnFromDutyCycle inverts duty = kOn / (kOn + kOff)', () => {
    const kOff = 0.4;
    for (const duty of [0.001, 0.01, 0.1]) {
      const kOn = kOnFromDutyCycle(duty, kOff);
      expect(kOn / (kOn + kOff)).toBeCloseTo(duty, 10);
    }
  });

  it('converges to the target duty cycle', () => {
    const duty = 0.01;
    const kOff = 0.5;
    const kOn = kOnFromDutyCycle(duty, kOff);
    const states = initEmitterStates(2000);
    for (let f = 0; f < 200; f++) stepPhotoswitching(states, kOn, kOff);

    let on = 0;
    const frames = 300;
    for (let f = 0; f < frames; f++) {
      stepPhotoswitching(states, kOn, kOff);
      for (const s of states) if (s.isOn) on++;
    }
    const measured = on / (frames * states.length);
    // 6000 expected ON events ⇒ ~1.3 % relative SE; ±12 % is >9σ.
    expect(measured).toBeGreaterThan(duty * 0.88);
    expect(measured).toBeLessThan(duty * 1.12);
  });
});
