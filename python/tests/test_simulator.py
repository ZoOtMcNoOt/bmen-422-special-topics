from __future__ import annotations

import numpy as np

from storm_slides.models import SimulationParams
from storm_slides.simulator import run_parameter_sweep, simulate_storm_frames


def test_simulation_is_reproducible_with_fixed_seed() -> None:
    params = SimulationParams(n_emitters=24, frame_count=20, seed=123)
    first = simulate_storm_frames(params)
    second = simulate_storm_frames(params)

    np.testing.assert_allclose(first.frames, second.frames)
    assert np.array_equal(first.active_masks, second.active_masks)
    np.testing.assert_allclose(first.ground_truth_xy, second.ground_truth_xy)


def test_simulation_output_shapes_are_consistent() -> None:
    params = SimulationParams(n_emitters=16, frame_count=12, canvas_size_px=(40, 48), seed=9)
    stack = simulate_storm_frames(params)

    assert stack.frames.shape == (12, 40, 48)
    assert stack.ground_truth_xy.shape == (16, 2)
    assert stack.active_masks.shape == (12, 16)
    assert stack.frame_drift_xy.shape == (12, 2)
    assert stack.emitter_photons.shape == (12, 16)
    assert float(stack.frames.mean()) > 0.0


def test_parameter_sweep_returns_expected_metrics() -> None:
    params = SimulationParams(n_emitters=18, frame_count=15, seed=22)
    sweep = run_parameter_sweep(params, {"photon_mean": [250.0, 500.0]})
    result = sweep["photon_mean"]

    assert len(result.parameter_values) == 2
    assert len(result.localization_rmse_nm) == 2
    assert len(result.fit_failure_rate) == 2
    assert len(result.missed_detection_rate) == 2
    assert len(result.false_positive_rate) == 2
    assert len(result.median_precision_nm) == 2
