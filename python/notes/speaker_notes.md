# Speaker Notes (20-Minute STORM Deck)

## Runtime Contract

- Target total: 20:00
- Allowed window: 19:00 to 21:00
- Slide timings source of truth: `storm_slides/schedule.py`

## Slide-by-Slide Notes

### 1. OpeningRoadmapSlide (1:00)

- State the objective: connect physics, microscope hardware, and reconstruction algorithm.
- Explain that the same signal will be traced from sample emission to final map.

### 2. MaxwellToHelmholtzSlide (2:30)

- Start from curl equations in dielectric media.
- Clarify assumptions: linear, source-free region, harmonic time dependence.
- End on Helmholtz equation and transition to Fourier optics.

### 3. FourierOpticsSlide (2:30)

- Explain pupil function and finite NA as spatial-frequency low-pass filtering.
- Show PSF widening when high frequencies are removed.
- Quote practical bound intuition: lateral resolution near `lambda/(2NA)`.

### 4. TemporalSparsitySlide (1:30)

- Emphasize key STORM trick: do not beat optics per frame; beat overlap over time.
- Sparse blinking allows one-PSF-per-spot fitting.

### 5. MicroscopeArchitectureSlide (2:30)

- Walk light path: laser excitation -> sample emission -> objective -> filters -> camera.
- Mention TIRF/widefield choice and why high NA matters.
- Include practical details: switching chemistry and drift management.

### 6. CameraStatisticsSlide (1:30)

- Pixel intensities are stochastic photon counts, modeled as Poisson-like.
- Distinguish signal and background.
- Set up localization precision dependence on photon budget.

### 7. LocalizationAlgorithmSlide (2:30)

- Describe detection, fitting, and map aggregation pipeline.
- Explain precision scaling trend `sigma/sqrt(N)` and degradation with background/aberrations.

### 8. SimulatorLabSlide (3:30)

- Show Monte Carlo sweeps:
- Photon sweep: lower photons worsen RMSE.
- Density sweep: overlapping emitters increase failure and merge artifacts.
- Drift sweep: uncorrected drift smears reconstructions.

### 9. ThreeDExtensionSlide (1:00)

- Explain astigmatism: ellipticity in x/y encodes z.
- Mention calibration requirement for converting shape to axial depth.

### 10. BiologicalExamplesSlide (1:00)

- Connect stylized reconstructions to real use cases: cytoskeleton, receptor clusters.
- Highlight nanoscale structure visibility over diffraction-limited imaging.

### 11. LimitationsFrontierSlide (1:00)

- List key limitations: bleaching, labeling/linkage error, thick-tissue aberration, slow live imaging.
- Highlight active research: probes, adaptive optics, faster reconstruction.

### 12. ConclusionChecklistSlide (0:30)

- Explicitly confirm coverage of each assignment requirement.
- End with statement that this is an end-to-end STORM demonstration pipeline.

## Citation Mapping

- [1] Rust, Bates, Zhuang (2006) STORM origin paper.
- [2] Betzig et al. (2006) PALM/SMLM parallel milestone.
- [3] Huang, Wang, Bates, Zhuang (2008) 3D STORM.
- [4] Jones et al. (2011) Fast 3D live-cell super-resolution.
- [5-7] Localization precision and MLE/statistical imaging references (used for camera/localization sections).
- [8-9] EMCCD/sCMOS and instrumentation methods references.
- [10] Fourier optics / diffraction limit reference.
- [11] Recent limitations and frontier review reference.
