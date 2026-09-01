/** Below this rate Knuth's exact method is cheaper than the normal approximation. */
const KNUTH_MAX_LAMBDA = 30;

export function samplePoisson(lambda: number, rng: () => number = Math.random): number {
  if (lambda <= 0) return 0;

  if (lambda < KNUTH_MAX_LAMBDA) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng();
    } while (p > L);
    return k - 1;
  }

  // Normal approximation via Box–Muller
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}
