# Reconstruction validation, 12 September 2026

The corrected fitter recovers the tested specimen geometry by rejecting ambiguous camera spots. It does not use emitter truth to choose positions. Lower, explicit molecule counts make the built-in acquisitions compatible with a single-emitter model; complete-object framing makes their geometry visible.

## Reproduction and evidence

From the repository root, after installing the npm dependencies:

```sh
node validation/reconstruction-audit.mjs
```

The command writes `build/reconstruction-audit.json`, creating its parent directory when needed. To select an output file, add `--output path/to/report.json`. The [recorded report](reconstruction-2026-09-12.json) contains 15 paired acquisitions, camera hashes, source hashes, per-seed measurements, illumination counts, and frame groups. The historical implementation is loaded directly from Git commit `7d21398be792fb574d8227568be7bc0ac20437cf`; it requires that commit in local history. The current implementation runs from the working tree. No tracked simulator code is modified by the runner.

Source and runner hashes normalize Windows CRLF line endings to LF without changing other whitespace, making provenance portable across Git checkouts. Camera hashes cover the unmodified binary pixel values. The runner also verifies that the loaded current source remains unchanged during execution.

Each current default case must retain at least 50% recall, have finite matched RMS error below 4 nm per axis and zero unmatched fits, and place at least 99% of accepted fits within 10 nm of ideal geometry. These broad regression margins avoid requiring exact localization counts. The deliberately crowded controls are recorded separately and are exempt from these acceptance checks.

Both fitters receive the same generated specimen and identical camera observations. SHA256 over every raw Float32 camera pixel checks that comparison; display previews are never fitting inputs. The seeds are 42, 20260912, and 987654321. Labeling uses the application's `seededRandom(seed)` stream; acquisition independently uses `seededRandom(seed ^ 0xa5a5a5a5)`. All acquisitions use 2,000 frames, 5,000 mean photons per active molecule per frame, background 20 per pixel, duty cycle 0.001, PSF sigma 130 nm, pixel pitch 160 nm, and zero drift.

## Fitter comparison at the corrected default counts

Ranges below span the three seeds. Error is RMS per axis among one-to-one matches to active emitters in the same frame, with a 130 nm gate. Recall is matches divided by active emitter-frames. A smaller error with fewer retained fits must be read together with recall.

| Specimen | Labels | Historical RMS/axis | Current RMS/axis | Historical recall | Current recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Two lines | 600 | 13.72-16.84 nm | 2.20-2.29 nm | 83.8-87.5% | 76.2-80.7% |
| Ring | 120 | 3.25-4.81 nm | 2.17-2.28 nm | 92.5-97.2% | 85.1-94.4% |
| Actin side view | 500 | 16.36-21.80 nm | 2.19-2.25 nm | 83.5-86.2% | 73.6-77.4% |
| Thin transparent image | 2,000 | 19.82-21.12 nm | 2.25-2.29 nm | 74.8-75.2% | 60.5-62.5% |

No accepted fit was unmatched in these 12 current-default acquisitions. All accepted fits lie within 10 nm of the ideal continuous specimen geometry. Median fitted photon counts are 4,992-5,008, consistent with the simulated 5,000-photon mean. The reconstructed ring's median radius is 29.99-30.19 nm for a true radius of 30 nm; no retained ring fit is inside radius 15 nm. These are localization and geometry diagnostics, not a measured image-resolution claim.

The source/framing corrections are separate from this fitting comparison. The lines extend 3,000 nm, while the historical view included only the central 1,000 nm. Current default views are 3,600 nm for the lines, 250 nm for the ring, 2,400 nm for actin, and the complete 10,240 nm source field for uploaded images. The script verifies that every default specimen label lies inside its current whole-object view.

## Crowding and finite sampling

The old density calculation used the 104.8576 square micrometer camera area to place labels onto tiny specimens. Density 250 therefore became 10,000 labels after capping, about ten simultaneously active molecules at the default duty cycle.

A separate seed-42 control retains these 10,000-label samples. The historical fitter returns a collapsed ring with 2,001 accepted fits. The corrected fitter returns no accepted ring fits and a null error, rather than presenting a false reconstruction. Dense-line and dense-actin recall are only 2.47% and 0.72%, respectively. Quality screening does not make a crowded acquisition recoverable; activation must be sparse enough or the analysis must use a suitable multi-emitter model.

Only 51.4-57.0% of labels ever illuminate in the tested default runs. An illuminated label can still be missed or rejected, and repeated localizations can come from the same label. Increasing frames improves sampling; increasing activation also increases overlap. The reported label-illumination count is not a count of distinct resolved molecules.

The fitter assumes the simulator's known PSF, background, and equal mean photon yield per emitter. Brightness screening depends on that calibration; it cannot be transferred unchanged to experimental dyes with variable brightness. The shape screen uses an approximate Poisson-deviance threshold, and the camera sampler itself uses a normal approximation for pixel means of 30 or more. The audit does not establish an exact false-rejection probability, experimental accuracy, or performance over all control settings. The existing two-pixel detector border exclusion also limits acquisitions near sensor edges.

## Thin transparent source fixture

The fixture has original dimensions 4,096 by 4 pixels and a downsampled 256 by 1 sampling buffer. Only columns 64 through 191 are opaque; invisible pixels deliberately contain white RGB values. Its visible support is a 5,120 nm by 10 nm rectangle centered in the sensor.

All 2,000 current labels stay within that visible support for each seed. The historical sampler, which ignored alpha and the original aspect ratio, placed only 250-271 of its 2,000 labels there. The paired fitter comparison uses the corrected labels in both engines, so this source-placement correction is not confused with a fitting improvement.

## Browser acceptance

The production static export was exercised in Chromium with seed 42 and 2,000 frames. Default lines, ring, and actin produced 868, 203, and 742 accepted localizations respectively, with displayed matched error 2.2 nm per axis. The actual object remained visible beside each reconstruction.

- A 512 × 256 transparent PNG containing a ring and two lines produced a matching source/label/reconstruction layout and 3,355 accepted fits. Repeating the run gave identical pixel hashes for all four canvases. A fully transparent replacement was rejected without replacing the completed specimen or acquisition.
- A deliberately delayed image decode disabled Run while the replacement loaded, closing the source/acquisition race. Switching specimens and resetting already-default settings each started a coherent new run.
- Whole-object and 2× views updated all four physical crops together. Frame zero cleared the reconstruction without hiding the object; camera Frame and Mean remained explicitly labelled.
- CSV contained 203 ring localizations, 17 columns, 120 molecules, and the captured seed 42 after the draft seed changed to 77. PNG was 1,024 × 1,134 pixels, including scale and acquisition metadata.
- At viewport widths 1,280, 390, and 320 CSS pixels, the workspace had no horizontal overflow. The small layouts retained the source comparison, scale bars, controls, and measurements.

The automated suite contains 203 passing tests; ESLint, TypeScript, and the production build also pass. These browser observations verify the interface against the tested model; the numerical and sampling limitations above still apply.
