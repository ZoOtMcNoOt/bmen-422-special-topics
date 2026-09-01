import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Median of a numeric array (averages the two middle values for even lengths). */
export function median(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  const s = Float64Array.from(values).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Base UI sliders emit `number | readonly number[]`; all of ours are single-thumb. */
export const sliderValue = (v: number | readonly number[]): number =>
  typeof v === 'number' ? v : v[0];
