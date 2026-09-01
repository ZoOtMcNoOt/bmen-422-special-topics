# See past the blur — a STORM microscopy simulator

An interactive, browser-only simulation of single-molecule localization microscopy (STORM / dSTORM), built for BMEN 422. Pick a nanoscale sample, run an acquisition, and watch a super-resolution image emerge from thousands of blinking molecules — side by side with what a conventional microscope would show.

**Live:** https://zootmcnoot.github.io/bmen-422-special-topics/

## What it simulates

Every frame of the acquisition is generated from first principles and then analysed the way real STORM software does it:

| Stage | Model |
|---|---|
| Photoswitching | Two-state OFF ⇄ ON Markov chain at the chosen duty cycle |
| Camera image | Pixel-integrated Gaussian PSF (erf), uniform background, Poisson shot noise |
| Detection | Local maxima above `b + 4√(b+1)`, then rejected unless the background-subtracted ROI sum clears the noise floor `4√(nPixels·b)` |
| Localization | Maximum-likelihood fit (Fisher scoring on the Poisson log-likelihood), or a centroid in "simple" mode |
| Drift | Optional linear stage drift; corrected by a 1/σ²-weighted linear fit |
| Reconstruction | Each localization rendered as a unit-mass Gaussian of width σ_loc, pixel-integrated |
| Precision | Thompson–Larson–Webb (2002) theory, the fitter's own estimate, and the median distance to the true molecule positions |

Defaults are calibrated to Alexa Fluor 647 in MEA buffer (≈5000 photons per blink, 0.1 % duty cycle) on a 1.4-NA objective with 160 nm pixels.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest, node environment
npm run lint
npm run build    # static export to ./out
```

Pushes to `master` deploy to GitHub Pages via `.github/workflows/deploy.yml`. The app is a fully static Next.js export under the `/bmen-422-special-topics` base path; there is no server.

## Layout

```
app/                  Next.js page and root layout
components/           UI: panels, controls, result summary, precision chart
lib/simulator/        The physics: PSF, photoswitching, camera, localization, drift, splatting, analysis
lib/simulator/defaults.ts   Every tunable constant, calibrated to Alexa Fluor 647
lib/rendering/        Canvas drawing, colormap, preview Web Worker, scale bar
lib/presets.ts        The four samples and their view boxes
lib/timeline.ts       Scrubber math (localizations per acquired frame)
lib/url-state.ts      Shareable-link encoding
lib/utils.ts          cn, clamp, median, slider helper
__tests__/            Vitest suite over the simulator and the pure UI logic
```
