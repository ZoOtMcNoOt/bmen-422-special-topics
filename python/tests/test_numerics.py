"""Regression tests at the imaging, estimation and metric boundaries."""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest
from scipy.special import ndtr

from storm_slides.models import DetectionThreshold, FrameStack, LocalizationResult, SimulationParams
from storm_slides.simulator import (
    detect_spots,
    evaluate_localizations,
    localize_frame_stack,
    localize_spots_mle,
    reconstruct_density_map,
    render_frame_from_emitters,
    simulate_storm_frames,
)


@pytest.mark.parametrize(
    "field,value",
    [
        ("n_emitters", 1.5),
        ("n_emitters", True),
        ("frame_count", 0),
        ("canvas_size_px", (8, 12)),
        ("canvas_size_px", (16.5, 16)),
        ("pixel_size_nm", 0),
        ("pixel_size_nm", -10),
        ("psf_sigma_px", np.nan),
        ("photon_mean", np.inf),
        ("background_lambda", -1),
        ("background_lambda", np.nan),
        ("camera_gain", 0),
        ("camera_gain", -1),
        ("camera_gain", np.inf),
        ("on_off_rates", (1.01, 0.2)),
        ("on_off_rates", (-0.1, 0.2)),
        ("on_off_rates", (0.1, np.nan)),
        ("on_off_rates", (0.1,)),
        ("drift_per_frame_px", (np.nan, 0)),
        ("drift_per_frame_px", (0,)),
        ("seed", -1),
        ("seed", 0.5),
    ],
)
def test_invalid_simulation_parameters_fail_at_the_boundary(field: str, value: object) -> None:
    with pytest.raises(ValueError):
        replace(SimulationParams(), **{field: value}).validate()


def test_small_valid_canvas_handles_broad_psf_without_invalid_sampling_range() -> None:
    params = SimulationParams(n_emitters=3, frame_count=2, canvas_size_px=(9, 10), psf_sigma_px=3)
    stack = simulate_storm_frames(params)
    assert stack.frames.shape == (2, 9, 10)
    assert np.isfinite(stack.frames).all()


@pytest.mark.parametrize("position", [(16.2, 13.1), (-0.5, 13.1), (-4.0, 13.1), (31.5, 13.1), (-0.5, -0.5)])
def test_camera_collects_the_integral_inside_its_bounds(position: tuple[float, float]) -> None:
    sigma, photons = 1.2, 1000.0
    frame = render_frame_from_emitters(
        (32, 32), np.array([position]), np.array([photons]), sigma, 0, apply_poisson=False
    )
    captured_fraction = np.prod(
        [ndtr((31.5 - coordinate) / sigma) - ndtr((-0.5 - coordinate) / sigma) for coordinate in position]
    )
    np.testing.assert_allclose(frame.sum(), photons * captured_fraction, rtol=2e-8, atol=1e-8)


def test_zero_signal_and_background_remain_exactly_zero() -> None:
    frame = render_frame_from_emitters(
        (16, 16), np.empty((0, 2)), np.empty(0), 1.2, 0, np.random.default_rng(5)
    )
    assert not frame.any()
    assert detect_spots(frame).shape == (0, 2)
    bright_flat_frame = np.full((16, 16), 50.0)
    assert detect_spots(bright_flat_frame, DetectionThreshold(absolute_floor=1)).shape == (0, 2)


def test_poisson_background_has_expected_mean_and_variance() -> None:
    frame = render_frame_from_emitters(
        (400, 400), np.empty((0, 2)), np.empty(0), 1.2, 4.0, np.random.default_rng(14)
    )
    assert abs(float(frame.mean()) - 4.0) < 0.025
    assert abs(float(frame.var()) - 4.0) < 0.065


@pytest.mark.parametrize(
    "background,shape,sigma",
    [(2, (32, 32), 0.8), (20, (32, 32), 1.2), (80, (48, 64), 2.2)],
)
def test_random_poisson_background_peaks_are_rejected(
    background: float, shape: tuple[int, int], sigma: float
) -> None:
    rng = np.random.default_rng(93817)
    candidate_count = 0
    for _ in range(40):
        frame = rng.poisson(background, size=shape)
        candidates = detect_spots(frame, DetectionThreshold(absolute_floor=0))
        candidate_count += len(candidates)
        result = localize_spots_mle(frame, candidates, sigma)
        assert result.failure_flags.all()
    # Exercise rejection after candidate selection, including low backgrounds
    # that the default absolute photon threshold would remove entirely.
    assert candidate_count > 0


@pytest.mark.parametrize(
    "position",
    [(15.3, 14.7), (0.2, 14.7), (31.2, 14.7), (0.2, 0.2), (31.2, 31.2)],
)
def test_background_rejection_preserves_dim_and_sensor_edge_emitters(
    position: tuple[float, float],
) -> None:
    truth = np.array([position])
    rng = np.random.default_rng(49216)
    for _ in range(40):
        frame = render_frame_from_emitters((32, 32), truth, np.array([500.0]), 1.2, 20.0, rng)
        result = localize_spots_mle(frame, detect_spots(frame), 1.2)
        accepted = result.successful_xy()
        assert len(accepted) == 1
        assert np.linalg.norm(accepted[0] - truth[0]) < 1.0


@pytest.mark.parametrize(
    "position,sigma,background",
    [
        ((15.05, 10.95), 0.8, 0.0),
        ((15.42, 10.31), 1.2, 20.0),
        ((15.42, 10.31), 2.2, 4.0),
        ((0.2, 10.7), 1.2, 1.8),
        ((31.1, 30.8), 1.2, 1.8),
    ],
)
def test_poisson_mle_recovers_subpixel_position_and_total_photons(
    position: tuple[float, float],
    sigma: float,
    background: float,
) -> None:
    truth = np.array([position])
    frame = render_frame_from_emitters(
        (32, 32), truth, np.array([1400.0]), sigma, background, apply_poisson=False
    )
    result = localize_spots_mle(frame, np.floor(truth + 0.5), sigma)
    assert not result.failure_flags.any()
    np.testing.assert_allclose(result.estimated_xy, truth, atol=1e-3, rtol=0)
    np.testing.assert_allclose(result.photon_estimates, [1400.0], rtol=1e-4)


def test_precision_bound_tracks_repeat_measurements_for_an_isolated_emitter() -> None:
    truth = np.array([[15.3, 14.7]])
    rng = np.random.default_rng(212)
    errors, bounds = [], []
    for _ in range(160):
        frame = render_frame_from_emitters((32, 32), truth, np.array([1200.0]), 1.2, 4.0, rng)
        result = localize_spots_mle(frame, np.array([[15.0, 15.0]]), 1.2)
        assert not result.failure_flags[0]
        errors.append(result.estimated_xy[0] - truth[0])
        bounds.append(result.uncertainty_nm[0])
    empirical_per_axis_rmse_nm = np.sqrt(np.mean(np.square(errors))) * 100
    ratio = empirical_per_axis_rmse_nm / np.mean(bounds)
    assert 0.8 < ratio < 1.25


def test_gain_changes_camera_units_without_inventing_photons_or_precision() -> None:
    params = SimulationParams(
        n_emitters=2, frame_count=8, on_off_rates=(1, 0), drift_per_frame_px=(0, 0), seed=90
    )
    sample = np.array([[15.3, 10.7], [40.2, 41.1]])
    unit_gain = simulate_storm_frames(params, emitter_xy=sample)
    higher_gain = simulate_storm_frames(replace(params, camera_gain=4), emitter_xy=sample)
    np.testing.assert_array_equal(higher_gain.frames, unit_gain.frames * 4)
    first = localize_frame_stack(unit_gain, 1.2, 100)
    second = localize_frame_stack(higher_gain, 1.2, 100)
    assert len(first.estimated_xy) == 16
    np.testing.assert_array_equal(second.estimated_xy, first.estimated_xy)
    np.testing.assert_array_equal(second.photon_estimates, first.photon_estimates)
    np.testing.assert_array_equal(second.uncertainty_nm, first.uncertainty_nm)


def test_brightness_and_background_sweeps_keep_sample_and_blinking_fixed() -> None:
    params = SimulationParams(n_emitters=9, frame_count=12, seed=13)
    first = simulate_storm_frames(params)
    second = simulate_storm_frames(replace(params, photon_mean=900, background_lambda=9))
    np.testing.assert_array_equal(first.ground_truth_xy, second.ground_truth_xy)
    np.testing.assert_array_equal(first.active_masks, second.active_masks)
    np.testing.assert_allclose(first.emitter_photons / params.photon_mean, second.emitter_photons / 900)


@pytest.mark.parametrize("probabilities,expected", [((0, 0), False), ((0, 1), False), ((1, 0), True)])
def test_blinking_probability_endpoints(probabilities: tuple[float, float], expected: bool) -> None:
    stack = simulate_storm_frames(SimulationParams(n_emitters=4, frame_count=5, on_off_rates=probabilities))
    assert np.all(stack.active_masks == expected)


@pytest.mark.parametrize(
    "coordinates", [np.zeros((3, 2)), np.array([[np.nan, 3], [2, 2]]), np.array([[64, 3], [2, 2]])]
)
def test_supplied_sample_has_a_strict_shape_and_sensor_contract(coordinates: np.ndarray) -> None:
    with pytest.raises(ValueError):
        simulate_storm_frames(SimulationParams(n_emitters=2, frame_count=1), emitter_xy=coordinates)


def test_reconstruction_uses_half_open_sensor_bounds_and_keeps_last_bin() -> None:
    coordinates = np.array(
        [
            [-0.5, -0.5],
            [np.nextafter(9.5, -np.inf), np.nextafter(7.5, -np.inf)],
            [-0.50001, 1],
            [9.5, 1],
            [2, 7.5],
            [np.nan, 1],
            [np.inf, 1],
        ]
    )
    with np.errstate(all="raise"):
        density = reconstruct_density_map(coordinates, (8, 10), upsample_factor=8)
    assert density.sum() == 2
    assert density[0, 0] == 1
    assert density[-1, -1] == 1


def test_3d_reconstruction_validates_even_empty_data_and_uses_explicit_z_range() -> None:
    with pytest.raises(ValueError, match="z_values"):
        reconstruct_density_map(np.empty((0, 2)), (8, 8), mode="3d")
    volume = reconstruct_density_map(
        np.array([[2, 2], [2, 2], [2, 2], [2, 2]]),
        (8, 8),
        mode="3d",
        z_values=np.array([-2, 0, 2, np.nan]),
        z_bins=4,
        z_range=(-2, 2),
    )
    assert volume.sum() == 2
    assert volume[0].sum() == 1
    assert volume[2].sum() == 1


def test_metrics_match_only_active_truth_once_and_account_for_drift() -> None:
    stack = FrameStack(
        frames=np.zeros((2, 16, 16)),
        ground_truth_xy=np.array([[5.0, 5.0], [10.0, 10.0]]),
        active_masks=np.array([[True, False], [False, True]]),
        frame_drift_xy=np.array([[0.0, 0.0], [0.5, -0.25]]),
        emitter_photons=np.array([[100.0, 0.0], [0.0, 100.0]]),
    )
    localizations = LocalizationResult(
        estimated_xy=np.array([[10.0, 10.0], [10.5, 9.75], [10.5, 9.75]]),
        photon_estimates=np.full(3, 100.0),
        uncertainty_nm=np.full(3, 4.0),
        failure_flags=np.zeros(3, dtype=bool),
        frame_index=np.array([0, 1, 1]),
    )
    metrics = evaluate_localizations(stack, localizations, pixel_size_nm=100, match_radius_px=1)
    assert metrics.matched_count == 1
    assert metrics.active_count == 2
    assert metrics.localization_rmse_nm == 0
    assert metrics.missed_detection_rate == 0.5
    assert metrics.false_positive_rate == pytest.approx(2 / 3)
    assert metrics.median_precision_nm == 4


def test_no_localizations_report_missed_events_without_fabricating_other_metrics() -> None:
    stack = simulate_storm_frames(SimulationParams(n_emitters=2, frame_count=2, on_off_rates=(1, 0)))
    empty = localize_spots_mle(np.zeros((16, 16)), np.empty((0, 2)), 1.2)
    metrics = evaluate_localizations(stack, empty, pixel_size_nm=100, match_radius_px=1)
    assert metrics.missed_detection_rate == 1
    assert metrics.matched_count == 0
    assert np.isnan(metrics.localization_rmse_nm)
    assert np.isnan(metrics.fit_failure_rate)
    assert np.isnan(metrics.false_positive_rate)
