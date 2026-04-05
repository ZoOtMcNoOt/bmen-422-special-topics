import type { EmitterState } from './types';

export function initEmitterStates(n: number): EmitterState[] {
  const states: EmitterState[] = [];
  for (let i = 0; i < n; i++) {
    states.push({ isOn: false, bleached: false });
  }
  return states;
}

/**
 * Advance the photoswitching state of every emitter by one frame.
 * Mutates `states` in place.
 *
 * Transitions (per frame):
 *   OFF → ON with probability kOn
 *   ON → OFF with probability kOff
 *   ON → bleached with probability pBleach
 *   bleached → (nothing, permanent)
 */
export function stepPhotoswitching(
  states: EmitterState[],
  kOn: number,
  kOff: number,
  pBleach: number
): void {
  for (const s of states) {
    if (s.bleached) continue;
    if (s.isOn) {
      if (Math.random() < pBleach) {
        s.isOn = false;
        s.bleached = true;
      } else if (Math.random() < kOff) {
        s.isOn = false;
      }
    } else {
      if (Math.random() < kOn) {
        s.isOn = true;
      }
    }
  }
}

/**
 * Convert a target duty cycle into kOn/kOff rates, given a chosen kOff.
 * duty = kOn / (kOn + kOff)  →  kOn = duty * kOff / (1 - duty)
 */
export function ratesFromDutyCycle(
  dutyCycle: number,
  kOff: number
): { kOn: number; kOff: number } {
  const clamped = Math.max(1e-6, Math.min(0.99, dutyCycle));
  const kOn = (clamped * kOff) / (1 - clamped);
  return { kOn, kOff };
}
