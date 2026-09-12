# STORM Lab

An interactive microscopy lab for **stochastic optical reconstruction microscopy**. Choose a synthetic specimen, simulate blinking molecules, and compare noisy camera frames with a reconstruction of their fitted positions.

The interface runs locally and shares its Python engine with the existing 17-scene Manim presentation. There is no frontend build step, external asset service, account, or database.

## Open the lab

Requires Python 3.11+. From the repository:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[lab,dev]"
.venv\Scripts\python -m storm_slides.lab
```

Open **http://127.0.0.1:8765**. On macOS/Linux, use `.venv/bin/python`. An installed environment also provides `storm-lab`. Use `--port 8766` if the default port is occupied. Stop with Ctrl+C.

The server binds only to loopback. Validated settings, a small request-body limit, same-origin checks, and a single acquisition slot bound workloads. This is a local teaching application, not a hosted multi-user service.

## Explore an experiment

1. Choose **filaments**, **rings**, or **clusters**: seeded geometric illustrations, not measured biological specimens.
2. Pick a preset or adjust photon yield, labeling density, and blink activation. Fine-tune background, drift, frames, and random seed as needed.
3. Select **Run experiment**. The first example runs on opening the page; playback starts only when requested.
4. Replay or scrub the acquisition. Camera frames, accepted fit counts, and precision stay synchronized. Compare the reconstruction with **Ground truth**.
5. Toggle **Correct known drift** to compare raw and ideally corrected positions.
6. Export all accepted fits as **CSV**, or save the main image as **PNG** with a scale bar and provenance.

Edited settings apply on the next run. Images and exports continue to describe the completed acquisition. Playback speed changes viewing speed, not the simulation.

### Interpreting the images and measurements

- **Camera:** a pixel-integrated Gaussian PSF with Poisson noise. Every frame shares one display scale. The 8-bit previews are not raw quantitative camera data.
- **Widefield:** mean of *all* frames, including frames beyond the playback cursor. Sample drift remains in this view.
- **Reconstruction:** accepted positions through the selected frame. Fixed-size luminous dots are a display choice, not uncertainty kernels.
- **Median fit precision:** median RMS per-axis Cramér–Rao bound under the single-emitter model. This is not measured image resolution; overlapping emitters can bias a successful fit and make the bound overoptimistic.
- **Drift correction:** subtraction of the exact simulated drift, not drift estimated from observations.
- **CSV:** all accepted fits regardless of playback position; zero-based frame indices, raw and corrected coordinates in nm, photons, precision, settings, and optical constants. The UI labels frames starting at one. Integer pixel centers imply sensor bounds of `[-0.5, 63.5)` on each axis. Empty acquisitions export a header without fabricated rows.

## Scientific engine

The shared engine provides:

- Two-state blinking with per-frame probabilities and independent seeded streams for structure, blinking, photon yield, and camera noise.
- Pixel-integrated image formation with correct photon loss outside the sensor.
- Gain-aware detection and actual Poisson maximum-likelihood localization, with analytic gradients, bounded fitting, and fitted background and photon count.
- Fisher-information precision bounds, explicit failure flags, and validated inputs.
- 2D/3D density histograms with defined pixel-center boundaries.
- Sweeps evaluated against **active emitters in the same frame**, using one-to-one matching. Metrics distinguish matched RMSE, missed detections, false positives, fit failures, and model precision.

The model assumes a known fixed Gaussian PSF and isolated emitters. It does not simulate bleaching, read noise, aberrations, or 3D image formation. Synthetic comparisons are educational evidence, not experimental validation or a resolution benchmark.

Methods: [Mortensen et al., 2010](https://doi.org/10.1038/nmeth.1447) and [Thompson et al., 2002](https://doi.org/10.1016/S0006-3495(02)75618-X).

## Code map

| Location | Responsibility |
| --- | --- |
| `storm_slides/models.py` | Validated numerical contracts |
| `storm_slides/simulator.py` | Image formation, fitting, reconstruction, evaluation |
| `storm_slides/specimens.py` | Seeded synthetic structures |
| `storm_slides/lab.py` | Local API and static application |
| `storm_slides/web/app.js` | Acquisition state, controls, playback |
| `storm_slides/web/renderer.js` | Canvas images and scaled PNG export |
| `storm_slides/web/export.js` | Quantitative CSV serialization |
| `tests/` | Numerical, API, export, and slide-order regressions |

## Verification

```powershell
python -m pytest
python -m ruff check storm_slides/lab.py storm_slides/specimens.py storm_slides/models.py storm_slides/simulator.py storm_slides/utils_plot.py tests
node --test tests/test_web.mjs
npm run check
```

Node 22+ is only needed for browser-module checks. No npm packages are required. CI runs these checks on Windows and Linux with Python 3.12 and 3.14. Numerical tests cover analytical photon conservation, subpixel recovery, gain invariance, Poisson precision behavior, sensor boundaries, active-source matching, and reproducibility. API tests exercise actual acquisitions and request/resource boundaries.

Browser acceptance should cover desktop and narrow layouts, playback/scrubbing, specimen and preset changes, drift correction, modal keyboard behavior, and CSV/PNG downloads. Slide-order tests verify the presentation contract; they do not prove the rendered presentation's layout.

## Animated presentation

The existing 17-scene deck covers electromagnetic foundations, Fourier optics, photoswitching, microscope hardware, camera statistics, localization, sweeps, and 3D concepts. Speaker notes are in `notes/speaker_notes.md`. Its 25–30 minute timing contract is separate from the lab.

Use the supplied conda environment (Python 3.12) and MiKTeX/LaTeX:

```powershell
conda env create -f environment.yml
conda activate storm
pip install -e ".[slides,lab,dev]"
python -m storm_slides
.\scripts\render_preview.ps1
.\scripts\present.ps1
```

Use `scripts/render_full.ps1` for 4K rendering. If QtMultimedia is unavailable, install `qt6-multimedia` from conda-forge into the `storm` environment.

The numerical core needs only NumPy and SciPy. Lab and Manim dependencies are separate extras. Old sweep fields `failure_rate`, `merge_rate`, and `effective_resolution_nm` have been replaced with explicitly defined metrics; see `SweepResult`.
