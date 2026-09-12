"""Identical seeded Poisson camera frames for both repository implementations."""
import json
import sys
from pathlib import Path
from time import perf_counter

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python'))
from storm_slides.simulator import detect_spots, localize_spots_mle, render_frame_from_emitters

rng = np.random.default_rng(20260912)
cases = [
    ('bright', 5000, 20, 130, (16.73, 15.31), 80),
    ('dim', 500, 20, 130, (16.73, 15.31), 80),
    ('high_background', 1200, 80, 130, (16.73, 15.31), 80),
    ('broad_psf', 1200, 20, 260, (16.73, 15.31), 80),
    ('sensor_edge', 5000, 20, 130, (0.73, 15.31), 20),
    ('background_only', 0, 20, 130, (16.73, 15.31), 20),
]
fixtures = []
for name, photons, background, sigma, xy, trials in cases:
    truth_nm = np.asarray(xy) * 160
    samples, errors, bounds, durations, counts = [], [], [], [], []
    for f in range(trials):
        frame = render_frame_from_emitters((32, 32), np.asarray([xy]) - .5,
            np.array([photons]), sigma / 160, background, rng)
        start = perf_counter()
        fit = localize_spots_mle(frame, detect_spots(frame), sigma / 160, 160)
        durations.append(perf_counter() - start)
        valid = ~fit.failure_flags
        positions = (fit.estimated_xy[valid] + .5) * 160
        counts.append(len(positions))
        if photons and len(positions):
            err = np.linalg.norm(positions - truth_nm, axis=1)
            idx = np.argmin(err)
            if err[idx] < 2 * sigma:
                errors.append(float(err[idx]))
                bounds.append(float(fit.uncertainty_nm[valid][idx]))
        samples.append(frame.astype(int).ravel().tolist())
    python = {
        'trials': trials, 'matched_frames': len(errors),
        'accepted_fits': sum(counts),
        'rms_per_axis_nm': float(np.sqrt(np.mean(np.square(errors)) / 2)) if errors else None,
        'median_reported_precision_nm': float(np.median(bounds)) if bounds else None,
        'localization_seconds': sum(durations),
    }
    fixtures.append(dict(name=name, photons=photons, background=background, sigma=sigma,
        truth_nm=truth_nm.tolist(), samples=samples, python=python))
    print(name, json.dumps(python), flush=True)
output = ROOT / 'build' / 'math-audit'
output.mkdir(parents=True, exist_ok=True)
(output / 'fixtures.json').write_text(json.dumps(fixtures), encoding='utf8')
