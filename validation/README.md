# Numerical comparison and consolidation

The existing hosted TypeScript app remains the website. The Python code supplies a reference implementation, numerical tests, and the presentation. Neither implementation was uniformly better before consolidation.

The later [reconstruction validation](reconstruction-2026-09-12.md) checks the corrected preset counts, fitter, complete-object framing, and transparent image sampling across three seeds. Its paired camera-pixel comparison and source hashes are recorded in [the full report](reconstruction-2026-09-12.json).

## Baseline, 12 September 2026

Compared public commit `c62bdbe77288a2840d4f43c98565470dab39570f` with Python commit `2f52b31c76b245847eea3c01587dceea1080e88f`. Both received **identical camera pixels**, generated with NumPy seed 20260912: 32×32 pixels at 160 nm/pixel, pixel-integrated Gaussian spots and Poisson sampling. Coordinates were converted explicitly between the repositories' pixel-center conventions. Each ordinary condition uses 80 trials; edge and blank conditions use 20 each.

| Condition | Python RMS error per axis | Hosted TypeScript RMS error per axis |
| --- | ---: | ---: |
| 5,000 photons, background 20/pixel | 2.284 nm | 2.285 nm |
| 500 photons, background 20/pixel | 10.111 nm | 10.113 nm |
| 1,200 photons, background 80/pixel | 6.470 nm | 6.477 nm |
| Broader PSF, σ=260 nm | 12.465 nm | 13.098 nm |

Ordinary conditions use σ=130 nm unless specified. Errors describe the nearest detection within two PSF sigmas of the single true spot in each frame; extra detections are separately counted in [the complete baseline](baseline-2026-09-12.json). This diagnostic is not the application's new per-frame assignment metric, a resolution benchmark, or experimental validation. The sample size does not establish superiority from small error differences. Timings in the raw output are single-run diagnostics, not a controlled performance benchmark.

The Python detector accepted **152 false fits across 20 blank frames**, versus **0** in TypeScript. Python detected all 20 sensor-edge cases; TypeScript intentionally excludes a two-pixel border and detected none. Thus a wholesale replacement of the browser engine was unwarranted.

## Changes carried over and corrected

- Kept the browser engine and static GitHub Pages delivery. Its position-only fit already matched the Python joint fit on the tested narrow, isolated spots.
- Added analytic pixel-integrated derivatives, ROI photon-capture correction, duplicate detection suppression, and invalid-fit rejection to the browser fitter. Known background and fixed PSF remain assumptions; this is not a joint MLE.
- Fixed Thompson's background term: for a Poisson mean λ, variance is λ, not λ². The old high-background condition reported 35.36 nm median estimated precision despite 6.48 nm measured per-axis error. The formula remains an approximation, not a Fisher bound.
- Replaced nearest-all-emitter and “times sharper” claims with maximum-cardinality, minimum-distance assignment to active emitters in each frame. Unmatched fits, misses, and unavailable measurements are explicit.
- Replaced spatial regression drift correction with clearly labelled subtraction of known simulated drift. Global regression could collapse stationary structure when different molecules were observed at different times.
- Retained Python's joint position/photon/background Poisson fit, Fisher bounds, independent seeded streams, sensor-edge handling, and presentation. Added a conditional binomial concentration test before fitting: under uniform independent Poisson background, Bonferroni correction bounds the probability of any false detection in an entirely blank frame at 1%.

After those changes, the shared blank test gives **0 accepted fits in both engines**; Python retains all 80 dim and all 20 edge detections. Broader PSFs can still produce extra Python detections. The conservative Python gate rejects many extremely weak spots: a separate 100-photon/background-20 diagnostic retained 8/80 instead of 67/80 while reducing 443 total accepted fits to 8. Do not interpret stricter rejection as a universal accuracy improvement.

## Reproduce

Install the root npm dependencies and `python/` lab/dev dependencies, then run from the repository root:

```sh
python validation/compare-localizers.py
npx vitest run --config validation/vitest.config.ts
```

The generator writes shared inputs to `build/math-audit/fixtures.json`; the comparison writes `build/math-audit/results.json`. The checked-in baseline records the pre-consolidation implementations. Rerunning uses the current source. Focused tests additionally cover 160 seeded precision trials, plateau and broad-PSF behavior, assignment against exhaustive solutions, inactive/cross-frame matches, drift parity, and blank/dim/edge rejection.

References: [Thompson et al. (2002)](https://doi.org/10.1016/S0006-3495(02)75618-X), [Mortensen et al. (2010)](https://doi.org/10.1038/nmeth.1447), [SciPy binomial survival function](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.binom.html).
