from __future__ import annotations

import numpy as np

from storm_slides.models import DetectionThreshold
from storm_slides.simulator import (
    apply_drift_correction,
    detect_spots,
    localize_spots_mle,
    reconstruct_density_map,
    render_frame_from_emitters,
)


def test_single_emitter_localizes_close_to_truth() -> None:
    truth = np.array([[15.3, 10.7]], dtype=np.float64)
    photons = np.array([1400.0], dtype=np.float64)
    frame = render_frame_from_emitters(
        canvas_size_px=(32, 32),
        emitter_xy=truth,
        photon_totals=photons,
        psf_sigma_px=1.2,
        background_lambda=1.8,
        rng=np.random.default_rng(0),
        apply_poisson=False,
    )
    candidates = detect_spots(
        frame, DetectionThreshold(sigma_multiplier=1.0, absolute_floor=2.0, min_distance_px=1)
    )
    result = localize_spots_mle(frame, candidates, psf_sigma_px=1.2, pixel_size_nm=100.0)
    success = ~result.failure_flags

    assert success.any()
    estimated = result.estimated_xy[success][0]
    assert float(np.linalg.norm(estimated - truth[0])) < 1e-3
    np.testing.assert_allclose(result.photon_estimates[success][0], photons[0], rtol=1e-4)


def test_linear_drift_correction_subtracts_expected_shift() -> None:
    localizations = np.array([[5.0, 5.0], [5.2, 4.9], [5.4, 4.8]], dtype=np.float64)
    frame_index = np.array([0, 1, 2], dtype=np.int64)
    corrected = apply_drift_correction(localizations, frame_index, drift_per_frame_px=(0.2, -0.1))
    expected = np.array([[5.0, 5.0], [5.0, 5.0], [5.0, 5.0]], dtype=np.float64)
    np.testing.assert_allclose(corrected, expected)


def test_density_map_has_expected_super_resolution_shape() -> None:
    points = np.array([[2.0, 3.0], [2.1, 3.0], [4.5, 1.2]], dtype=np.float64)
    density = reconstruct_density_map(points, canvas_size_px=(8, 10), upsample_factor=6)
    assert density.shape == (48, 60)
    assert float(np.sum(density)) == 3.0
