import { describe, it, expect } from 'vitest';
import {
  initEmitterStates,
  stepPhotoswitching,
} from '@/lib/simulator/photoswitching';

describe('photoswitching', () => {
  it('initializes all emitters in the dark state', () => {
    const states = initEmitterStates(100);
    expect(states.length).toBe(100);
    for (const s of states) {
      expect(s.isOn).toBe(false);
      expect(s.bleached).toBe(false);
    }
  });

  it('converges to target duty cycle within 20% over many steps', () => {
    const target = 0.01;
    const states = initEmitterStates(1000);
    // Rates chosen so that k_on / (k_on + k_off) = target
    const kOff = 0.5;
    const kOn = (target / (1 - target)) * kOff;
    const pBleach = 0;
    // Warm up
    for (let f = 0; f < 500; f++) stepPhotoswitching(states, kOn, kOff, pBleach);
    // Measure duty cycle over many frames
    let onCount = 0;
    const nFrames = 200;
    for (let f = 0; f < nFrames; f++) {
      stepPhotoswitching(states, kOn, kOff, pBleach);
      onCount += states.filter((s) => s.isOn).length;
    }
    const measuredDuty = onCount / (nFrames * states.length);
    expect(measuredDuty).toBeGreaterThan(target * 0.8);
    expect(measuredDuty).toBeLessThan(target * 1.2);
  });

  it('bleaching progressively removes emitters from the active pool', () => {
    const states = initEmitterStates(500);
    const kOn = 0.5;
    const kOff = 0.5;
    const pBleach = 0.05;
    for (let f = 0; f < 200; f++) stepPhotoswitching(states, kOn, kOff, pBleach);
    const bleached = states.filter((s) => s.bleached).length;
    expect(bleached).toBeGreaterThan(0);
    expect(bleached).toBeLessThan(500);
  });
});
