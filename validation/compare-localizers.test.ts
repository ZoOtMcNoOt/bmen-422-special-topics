import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { localizeFrame } from '@/lib/simulator/localization';
import { DEFAULT_PARAMS } from '@/lib/simulator/defaults';

it('compares the unchanged implementations on the same camera pixels', () => {
  const fixtures = JSON.parse(
    readFileSync('build/math-audit/fixtures.json', 'utf8'),
  );
  const results = fixtures.map(
    (fixture: {
      name: string;
      photons: number;
      background: number;
      sigma: number;
      truth_nm: number[];
      samples: number[][];
      python: object;
    }) => {
      const errors: number[] = [],
        bounds: number[] = [];
      let count = 0;
      const params = {
        ...DEFAULT_PARAMS,
        fieldSizePx: { width: 32, height: 32 },
        photonsPerCycle: fixture.photons,
        backgroundPerPixel: fixture.background,
        psfSigmaNm: fixture.sigma,
        correctDrift: false,
        nFrames: 1,
      };
      const started = performance.now();
      fixture.samples.forEach((pixels, frameIndex) => {
        const fits = localizeFrame(
          {
            pixels: Float32Array.from(pixels),
            width: 32,
            height: 32,
            frameIndex,
          },
          params,
        );
        count += fits.length;
        const distances = fits.map((fit) =>
          Math.hypot(fit.x - fixture.truth_nm[0], fit.y - fixture.truth_nm[1]),
        );
        const best = Math.min(...distances);
        if (fixture.photons && best < 2 * fixture.sigma) {
          errors.push(best);
          bounds.push(fits[distances.indexOf(best)].sigmaLocNm);
        }
      });
      bounds.sort((a, b) => a - b);
      const ts = {
        trials: fixture.samples.length,
        matched_frames: errors.length,
        accepted_fits: count,
        rms_per_axis_nm: errors.length
          ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length / 2)
          : null,
        median_reported_precision_nm: bounds.length
          ? (bounds[Math.floor((bounds.length - 1) / 2)] +
              bounds[Math.floor(bounds.length / 2)]) /
            2
          : null,
        localization_seconds: (performance.now() - started) / 1000,
      };
      return { name: fixture.name, python: fixture.python, typescript: ts };
    },
  );
  writeFileSync(
    'build/math-audit/results.json',
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
});
