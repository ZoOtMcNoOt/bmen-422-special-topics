# STORM simulator

**[Open the simulator](https://zootmcnoot.github.io/bmen-422-special-topics/)**

This is the single repository for the hosted simulator, Python reference engine, and Manim presentation. The website runs entirely in the browser. The Python tools live in `python/`; they are not needed to use the website.

## Run and verify

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

Development runs at http://localhost:3000. Production is exported to `out/` under `/bmen-422-special-topics`. Pushes to `master` publish through GitHub Pages after TypeScript tests, build, and Python checks pass. Pull requests run those checks without deploying.

The sample icons, controls, playback, model notes, CSV export, and scaled PNG export use the current acquisition. Editing acquisition settings leaves the completed images and exports intact until the next run. Selecting a specimen starts its experiment and updates every view together. Shared links include bounded settings, the actual label count, and a random seed; uploaded images must be supplied separately. Runs with the same image, settings, and seed are repeatable.

The molecule control counts labels in the specimen. Defaults are 600 for the two lines, 120 for the ring, 500 for actin, and 2,000 for an image. The previous camera-area density calculation put 10,000 labels into even the tiny 60 nm ring. Old links with `density` now use the selected specimen's default count while retaining their other acquisition settings. New links use `emitters` and `seed`.

## Numerical model

- Two-state blinking with a configurable stationary duty cycle. Photon yield means photons per active emitter **per frame**.
- Pixel-integrated Gaussian camera response with a Poisson noise model (normal approximation for pixel means of 30 or more); a point-sampled alternative accompanies centroid mode.
- Position-only Poisson Fisher scoring with known background/PSF, analytic derivatives, finite ROI capture correction, and duplicate/invalid-fit rejection. The browser fitter is not a joint position/photon/background MLE. A smaller circular fitting region limits contamination by neighboring spots.
- Brightness and Poisson-deviance screens reject fits incompatible with the single-emitter model. Brightness screening assumes the configured mean photon yield is calibrated and equal for every molecule; it cannot be applied unchanged to experimental variable-brightness data. The shape cutoff uses a conservative approximate chi-square quantile, not an exact rejection probability. Rejection reduces recall, and dim overlapping emitters can remain indistinguishable. These screens do not fit or resolve multiple simultaneous emitters. See [Huang et al. (2011)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3087594/) for likelihood screening and calibrated-intensity context.
- One-to-one matching to active, in-sensor emitters in the same frame, using a one-PSF-sigma gate. Reports matched RMS error per axis, missed emitter-frames, and unmatched fits. Missing measurements are `null`.
- Drift correction subtracts the exact simulated motion. It demonstrates ideal known correction, not an estimator from measured frames.
- Thompson localization precision is an approximation, with background variance consistent with the Poisson camera model. It is not measured image resolution.

The interface preserves the original Python lab's joined workspace, specimen cards, navy fields, purple fluorescence, mint localizations, and shared playback timeline. Reconstruction uses fixed visual markers, not uncertainty kernels. All images show the same physical crop.

- **Actual object / Input image** is always visible beside the reconstruction. It shows the known geometry or source pixels; **Molecules** shows all labelled positions. None of this truth is supplied to the fitter. The initial view includes the complete specimen, with a shared center-crop control for closer inspection. The actin preset is a simplified side view of ten rings at 190 nm intervals, drawn as rungs; it is not a molecular structure. See [Xu et al. (2013)](https://pubmed.ncbi.nlm.nih.gov/23239625/).
- Image labels are drawn from visible luminance × opacity, with exactly the requested count. Transparent and black pixels contribute no labels. The source is centered in the 10.24 µm square field without changing its original aspect ratio. This mapping is an illustrative specimen size, not a calibrated size inferred from an arbitrary photograph.
- **Conventional microscope** shows the ideal fluorescence image with every emitter on, convolved with the acquisition's Gaussian PSF. It omits noise, background, stage motion, and camera sampling. The PSF is integrated over a fine display grid, including contributions from outside the crop, then smoothly scaled in the original purple palette. This image is normalized independently and stays fixed during playback. It illustrates optical blur; it is not a measured camera frame or a brightness comparison. See [Nikon's explanation of diffraction and the PSF](https://www.microscopyu.com/techniques/super-resolution/the-diffraction-barrier-in-optical-microscopy).
- **STORM camera** switches between the selected acquired frame and the mean of all actual raw frames. Single-frame previews use one linear scale throughout an acquisition; the mean is normalized separately. Both retain camera pixels and simulated drift.
- The timeline selects the cumulative reconstruction and its camera frame. The all-frame mean and matched-error measurement always cover the full acquisition.
- Localizations are detections across frames, not distinct molecules: one label can appear repeatedly, and others may never switch on during a finite acquisition. Detection recall counts matched active emitter-frames, not structural completeness. Low matched error alone does not prove that the reconstructed shape is complete or resolved.

CSV contains full-precision raw **and known-drift-corrected** coordinates in nm, zero-based frame indices, and acquisition settings including label count, activation, fitting method, and the captured run's seed, regardless of the display toggle. PNG exports the current view and selected frame, with a physical scale bar and display metadata.

The model omits bleaching, read noise, aberrations, and experimental calibration. Bright, sparse isolated spots behave differently from dense overlapping samples. [The numerical comparison](validation/README.md) explains which improvements were carried over from the Python version and the remaining limits.

## Repository layout

| Path | Purpose |
| --- | --- |
| `app/`, `components/` | Hosted interface and accessible controls |
| `lib/simulator/` | Browser simulation, fitting, drift and measurements |
| `lib/rendering/`, `lib/export.ts` | Canvas rendering, previews and exports |
| `__tests__/` | Numerical and data-contract regressions |
| `python/` | Python reference, local lab, numerical tests, presentation and speaker notes |
| `validation/` | Reproducible comparison of the two implementations |

The history of `bmen-422-storm-animation` was imported without squashing. Its former main commit `2f52b31c76b245847eea3c01587dceea1080e88f` remains an ancestor of this repository. A separate complete Git bundle and PR-metadata backup were verified before retiring the redundant remote.

Methods: [Thompson, Larson & Webb (2002)](https://doi.org/10.1016/S0006-3495(02)75618-X), [Mortensen et al. (2010)](https://doi.org/10.1038/nmeth.1447).
