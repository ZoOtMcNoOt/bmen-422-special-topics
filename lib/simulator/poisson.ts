/**
 * Sample from a Poisson distribution with rate lambda.
 * Uses Knuth's algorithm for small lambda (< 30), Gaussian approximation for large lambda.
 */
export function samplePoisson(lambda: number, rng: () => number = Math.random): number {
  if (lambda <= 0) return 0;

  if (lambda < 30) {
    // Knuth's algorithm
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng();
    } while (p > L);
    return k - 1;
  }

  // Gaussian approximation for large lambda
  // Box-Muller transform
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const sample = lambda + Math.sqrt(lambda) * z;
  return Math.max(0, Math.round(sample));
}
