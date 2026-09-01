import { clamp } from '@/lib/utils';
import type { EmitterState } from './types';

/** Duty cycles are clamped to this range so kOn stays finite and positive. */
const MIN_DUTY_CYCLE = 1e-6;
const MAX_DUTY_CYCLE = 0.99;

export function initEmitterStates(n: number): EmitterState[] {
  const states: EmitterState[] = new Array(n);
  for (let i = 0; i < n; i++) states[i] = { isOn: false };
  return states;
}

/** Advance every emitter one frame through an OFF ⇄ ON Markov chain. Mutates in place. */
export function stepPhotoswitching(
  states: EmitterState[],
  kOn: number,
  kOff: number,
  rng: () => number = Math.random
): void {
  for (const s of states) {
    if (s.isOn) {
      if (rng() < kOff) s.isOn = false;
    } else if (rng() < kOn) {
      s.isOn = true;
    }
  }
}

/** Steady-state duty = kOn / (kOn + kOff)  ⇒  kOn = duty · kOff / (1 − duty). */
export function kOnFromDutyCycle(dutyCycle: number, kOff: number): number {
  const d = clamp(dutyCycle, MIN_DUTY_CYCLE, MAX_DUTY_CYCLE);
  return (d * kOff) / (1 - d);
}
