"""Pixel-integrated STORM imaging, Poisson localization, and honest quality metrics.

Coordinates use camera-pixel centers: (0, 0) is the center of the first pixel.
The sensor therefore covers [-0.5, width-0.5) by [-0.5, height-0.5).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import replace

import numpy as np
from scipy.ndimage import maximum_filter
from scipy.optimize import linear_sum_assignment, minimize
from scipy.special import ndtr, xlogy

from storm_slides.models import (
    DetectionThreshold,
    FrameStack,
    LocalizationMetrics,
    LocalizationResult,
    SimulationParams,
    SweepResult,
    _canvas_shape,
    _finite_number,
    _integer,
)


def _xy_array(values: np.ndarray, name: str, *, finite: bool = True) -> np.ndarray:
    points = np.asarray(values, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 2:
        raise ValueError(f"{name} must have shape (N, 2)")
    if finite and not np.isfinite(points).all():
        raise ValueError(f"{name} must contain only finite coordinates")
    return points


def _photon_frame(frame: np.ndarray, camera_gain: float) -> np.ndarray:
    _finite_number("camera_gain", camera_gain)
    pixels = np.asarray(frame, dtype=np.float64)
    if pixels.ndim != 2 or any(size == 0 for size in pixels.shape):
        raise ValueError("frame must be a non-empty 2D array")
    if not np.isfinite(pixels).all() or np.any(pixels < 0):
        raise ValueError("frame must contain finite non-negative camera counts")
    return pixels / camera_gain


def _gaussian_axis(edges: np.ndarray, center: float, sigma: float) -> tuple[np.ndarray, np.ndarray]:
    """Integrated pixel probabilities and their analytic center derivative."""
    standardized = (edges - center) / sigma
    cdf = ndtr(standardized)
    pdf = np.exp(-0.5 * standardized**2) / (np.sqrt(2.0 * np.pi) * sigma)
    return np.diff(cdf), pdf[:-1] - pdf[1:]


def _add_gaussian_spot(
    image: np.ndarray,
    center_xy: tuple[float, float],
    total_photons: float,
    sigma_px: float,
) -> None:
    """Integrate the Gaussian over sensor pixels, losing off-camera photons."""
    center_x, center_y = center_xy
    radius = max(2, int(np.ceil(6 * sigma_px)))
    x_min = max(0, int(np.floor(center_x)) - radius)
    x_max = min(image.shape[1] - 1, int(np.floor(center_x)) + radius)
    y_min = max(0, int(np.floor(center_y)) - radius)
    y_max = min(image.shape[0] - 1, int(np.floor(center_y)) + radius)
    if x_min > x_max or y_min > y_max:
        return
    x_edges = np.arange(x_min, x_max + 2, dtype=np.float64) - 0.5
    y_edges = np.arange(y_min, y_max + 2, dtype=np.float64) - 0.5
    px, _ = _gaussian_axis(x_edges, center_x, sigma_px)
    py, _ = _gaussian_axis(y_edges, center_y, sigma_px)
    image[y_min : y_max + 1, x_min : x_max + 1] += total_photons * np.outer(py, px)


def render_frame_from_emitters(
    canvas_size_px: tuple[int, int],
    emitter_xy: np.ndarray,
    photon_totals: np.ndarray,
    psf_sigma_px: float,
    background_lambda: float,
    rng: np.random.Generator | None = None,
    *,
    apply_poisson: bool = True,
    camera_gain: float = 1.0,
) -> np.ndarray:
    """Render expected photons or Poisson camera counts from a Gaussian PSF.

    photon_totals are incident signal means before sensor cropping. Gain is a
    deterministic conversion to camera units, not additional signal or EM gain.
    """
    height, width = _canvas_shape(canvas_size_px)
    coordinates = _xy_array(emitter_xy, "emitter_xy")
    photons = np.asarray(photon_totals, dtype=np.float64)
    if photons.shape != (len(coordinates),) or not np.isfinite(photons).all() or np.any(photons < 0):
        raise ValueError("photon_totals must contain one finite non-negative value per emitter")
    _finite_number("psf_sigma_px", psf_sigma_px)
    _finite_number("background_lambda", background_lambda, inclusive=True)
    _finite_number("camera_gain", camera_gain)
    frame = np.full((height, width), background_lambda, dtype=np.float64)
    for position, photon_count in zip(coordinates, photons, strict=True):
        if photon_count > 0:
            _add_gaussian_spot(
                frame, (float(position[0]), float(position[1])), float(photon_count), psf_sigma_px
            )
    if apply_poisson:
        generator = rng if rng is not None else np.random.default_rng()
        frame = generator.poisson(frame).astype(np.float64)
    return frame * camera_gain


def simulate_storm_frames(params: SimulationParams, *, emitter_xy: np.ndarray | None = None) -> FrameStack:
    """Simulate a stationary two-state blinking process and noisy camera frames.

    Supplied samples must contain n_emitters coordinates inside the sensor.
    Independent seeded streams keep the sample and blinking unchanged when only
    brightness, background, or camera gain changes.
    """
    params.validate()
    structure_seed, blinking_seed, photon_seed, camera_seed = np.random.SeedSequence(params.seed).spawn(4)
    structure_rng = np.random.default_rng(structure_seed)
    blinking_rng = np.random.default_rng(blinking_seed)
    photon_rng = np.random.default_rng(photon_seed)
    camera_rng = np.random.default_rng(camera_seed)
    height, width = params.canvas_size_px

    if emitter_xy is None:
        margin = min(max(4.0, 4 * params.psf_sigma_px), min(height, width) / 4)
        extent = np.array([width - 2 * margin, height - 2 * margin])
        ground_truth = margin + structure_rng.random((params.n_emitters, 2)) * extent
    else:
        ground_truth = _xy_array(emitter_xy, "emitter_xy").copy()
        if ground_truth.shape[0] != params.n_emitters:
            raise ValueError("emitter_xy length must equal n_emitters")
        if not _inside_sensor(ground_truth, params.canvas_size_px).all():
            raise ValueError("initial emitter_xy coordinates must be inside the sensor")

    frames = np.empty((params.frame_count, height, width), dtype=np.float64)
    active = np.empty((params.frame_count, params.n_emitters), dtype=bool)
    drift_xy = np.arange(params.frame_count)[:, None] * np.asarray(params.drift_per_frame_px)[None, :]
    emitter_photons = np.zeros((params.frame_count, params.n_emitters), dtype=np.float64)
    on_probability, off_probability = params.on_off_rates
    probability_sum = on_probability + off_probability
    steady_state_on = on_probability / probability_sum if probability_sum else 0.0
    states = blinking_rng.random(params.n_emitters) < steady_state_on

    for frame_idx in range(params.frame_count):
        if frame_idx:
            transition = blinking_rng.random(params.n_emitters)
            states = np.where(states, transition >= off_probability, transition < on_probability)
        active[frame_idx] = states
        # Modest brightness heterogeneity; pixel arrivals carry the Poisson noise.
        intensity = np.maximum(
            0.0, photon_rng.normal(params.photon_mean, 0.15 * params.photon_mean, params.n_emitters)
        )
        emitter_photons[frame_idx] = np.where(states, intensity, 0.0)
        frames[frame_idx] = render_frame_from_emitters(
            params.canvas_size_px,
            (ground_truth + drift_xy[frame_idx])[states],
            emitter_photons[frame_idx, states],
            params.psf_sigma_px,
            params.background_lambda,
            camera_rng,
            camera_gain=params.camera_gain,
        )

    return FrameStack(
        frames=frames,
        ground_truth_xy=ground_truth,
        active_masks=active,
        frame_drift_xy=drift_xy,
        emitter_photons=emitter_photons,
        camera_gain=params.camera_gain,
    )


def detect_spots(
    frame: np.ndarray,
    threshold_cfg: DetectionThreshold | None = None,
    *,
    camera_gain: float = 1.0,
) -> np.ndarray:
    """Detect separated local intensity maxima using thresholds in photons."""
    cfg = threshold_cfg or DetectionThreshold()
    cfg.validate()
    pixels = _photon_frame(frame, camera_gain)
    threshold = max(cfg.absolute_floor, float(pixels.mean() + cfg.sigma_multiplier * pixels.std()))
    # Strict comparison prevents a uniform background from becoming a plateau
    # of fictitious detections when its standard deviation is zero.
    maxima = (pixels > threshold) & (pixels == maximum_filter(pixels, size=3, mode="constant", cval=-np.inf))
    yx = np.argwhere(maxima)
    if yx.size == 0:
        return np.empty((0, 2), dtype=np.float64)
    order = np.lexsort((yx[:, 1], yx[:, 0], -pixels[yx[:, 0], yx[:, 1]]))
    selected: list[tuple[int, int]] = []
    min_squared = cfg.min_distance_px**2
    for idx in order:
        y, x = map(int, yx[idx])
        if all((x - sx) ** 2 + (y - sy) ** 2 >= min_squared for sy, sx in selected):
            selected.append((y, x))
    return np.asarray([(x, y) for y, x in selected], dtype=np.float64)


def _empty_localizations() -> LocalizationResult:
    return LocalizationResult(
        estimated_xy=np.empty((0, 2), dtype=np.float64),
        photon_estimates=np.empty(0, dtype=np.float64),
        uncertainty_nm=np.empty(0, dtype=np.float64),
        failure_flags=np.empty(0, dtype=bool),
    )


def _fit_gaussian_patch(
    patch: np.ndarray,
    x_edges: np.ndarray,
    y_edges: np.ndarray,
    candidate_xy: tuple[int, int],
    psf_sigma_px: float,
) -> tuple[np.ndarray, float, float] | None:
    """Bounded Poisson MLE in (x, y, log photons, log background)."""
    edge = np.concatenate((patch[0], patch[-1], patch[1:-1, 0], patch[1:-1, -1]))
    background = max(float(np.median(edge)), 1e-3)
    signal = np.maximum(patch - background, 0.0)
    signal_sum = float(signal.sum())
    if signal_sum <= 0:
        return None
    xs = (x_edges[:-1] + x_edges[1:]) / 2
    ys = (y_edges[:-1] + y_edges[1:]) / 2
    x_start = float(np.dot(signal.sum(axis=0), xs) / signal_sum)
    y_start = float(np.dot(signal.sum(axis=1), ys) / signal_sum)
    x_candidate, y_candidate = candidate_xy
    x_bounds = (x_candidate - 1.5, x_candidate + 1.5)
    y_bounds = (y_candidate - 1.5, y_candidate + 1.5)
    x_start = np.clip(x_start, *x_bounds)
    y_start = np.clip(y_start, *y_bounds)
    px, _ = _gaussian_axis(x_edges, x_start, psf_sigma_px)
    py, _ = _gaussian_axis(y_edges, y_start, psf_sigma_px)
    photon_start = signal_sum / max(float(px.sum() * py.sum()), 1e-6)
    total = float(patch.sum())
    photon_max = max(20 * total, 100.0)
    bounds = [
        x_bounds,
        y_bounds,
        (np.log(1e-6), np.log(photon_max)),
        (np.log(1e-9), np.log(float(patch.max()) + 1)),
    ]
    start = np.array([x_start, y_start, np.log(min(photon_start, photon_max)), np.log(background)])
    scale = max(total, 1.0)
    constant = float(np.sum(xlogy(patch, patch) - patch))

    def model(theta: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        x, y, log_photons, log_background = theta
        photons, bg = np.exp(log_photons), np.exp(log_background)
        p_x, d_x = _gaussian_axis(x_edges, x, psf_sigma_px)
        p_y, d_y = _gaussian_axis(y_edges, y, psf_sigma_px)
        signal_model = photons * np.outer(p_y, p_x)
        expectation = signal_model + bg
        derivatives = np.array(
            [
                photons * np.outer(p_y, d_x),
                photons * np.outer(d_y, p_x),
                signal_model,
                np.full_like(expectation, bg),
            ]
        )
        return expectation, derivatives

    def objective(theta: np.ndarray) -> tuple[float, np.ndarray]:
        expectation, derivatives = model(theta)
        value = (float(np.sum(expectation - patch * np.log(expectation))) + constant) / scale
        residual = 1.0 - patch / expectation
        gradient = np.einsum("kij,ij->k", derivatives, residual) / scale
        return value, gradient

    optimum = minimize(
        objective,
        start,
        method="L-BFGS-B",
        jac=True,
        bounds=bounds,
        options={"maxiter": 100, "ftol": 1e-11, "gtol": 1e-7},
    )
    if not optimum.success or not np.isfinite(optimum.x).all():
        return None
    # A center forced against its search bound usually belongs to another peak.
    if (
        min(
            optimum.x[0] - x_bounds[0],
            x_bounds[1] - optimum.x[0],
            optimum.x[1] - y_bounds[0],
            y_bounds[1] - optimum.x[1],
        )
        < 1e-5
    ):
        return None
    expectation, derivatives = model(optimum.x)
    jacobian = derivatives.reshape(4, -1)
    information = (jacobian / expectation.ravel()) @ jacobian.T
    try:
        covariance = np.linalg.inv(information)
    except np.linalg.LinAlgError:
        return None
    variance = float((covariance[0, 0] + covariance[1, 1]) / 2)
    if not np.isfinite(variance) or variance <= 0:
        return None
    return optimum.x[:2], float(np.exp(optimum.x[2])), float(np.sqrt(variance))


def localize_spots_mle(
    frame: np.ndarray,
    candidates_xy: np.ndarray,
    psf_sigma_px: float,
    pixel_size_nm: float = 100.0,
    *,
    patch_radius: int | None = None,
    min_signal_photons: float = 20.0,
    camera_gain: float = 1.0,
) -> LocalizationResult:
    """Fit fixed-width pixel-integrated Gaussian spots with Poisson likelihood.

    Position, total signal photons and constant background are fitted together.
    Reported uncertainty is the per-axis RMS Fisher-information precision bound
    for this single-emitter model. Overlapping emitters violate that assumption.
    Border patches are cropped consistently with the forward imaging model.
    """
    pixels = _photon_frame(frame, camera_gain)
    candidates = _xy_array(candidates_xy, "candidates_xy")
    _finite_number("psf_sigma_px", psf_sigma_px)
    _finite_number("pixel_size_nm", pixel_size_nm)
    _finite_number("min_signal_photons", min_signal_photons, inclusive=True)
    radius = max(3, int(np.ceil(3 * psf_sigma_px))) if patch_radius is None else patch_radius
    _integer("patch_radius", radius, minimum=2)
    if len(candidates) == 0:
        return _empty_localizations()
    estimated = np.full((len(candidates), 2), np.nan)
    photons = np.zeros(len(candidates), dtype=np.float64)
    uncertainty = np.full(len(candidates), np.inf)
    failures = np.ones(len(candidates), dtype=bool)
    height, width = pixels.shape
    for idx, (x_raw, y_raw) in enumerate(candidates):
        x, y = int(np.floor(x_raw + 0.5)), int(np.floor(y_raw + 0.5))
        if x < 0 or y < 0 or x >= width or y >= height:
            continue
        x_min, x_max = max(0, x - radius), min(width - 1, x + radius)
        y_min, y_max = max(0, y - radius), min(height - 1, y + radius)
        patch = pixels[y_min : y_max + 1, x_min : x_max + 1]
        if min(patch.shape) < 3 or float(patch.sum()) < min_signal_photons:
            continue
        fitted = _fit_gaussian_patch(
            patch,
            np.arange(x_min, x_max + 2, dtype=np.float64) - 0.5,
            np.arange(y_min, y_max + 2, dtype=np.float64) - 0.5,
            (x, y),
            psf_sigma_px,
        )
        if fitted is None or fitted[1] < min_signal_photons:
            continue
        position, photon_count, precision_px = fitted
        estimated[idx] = position
        photons[idx] = photon_count
        uncertainty[idx] = precision_px * pixel_size_nm
        failures[idx] = False
    return LocalizationResult(estimated, photons, uncertainty, failures)


def localize_frame_stack(
    frame_stack: FrameStack,
    psf_sigma_px: float,
    pixel_size_nm: float,
    threshold_cfg: DetectionThreshold | None = None,
) -> LocalizationResult:
    """Run gain-calibrated detection and localization over the stack."""
    results: list[LocalizationResult] = []
    frame_indices: list[np.ndarray] = []
    for frame_idx, frame in enumerate(frame_stack.frames):
        candidates = detect_spots(frame, threshold_cfg, camera_gain=frame_stack.camera_gain)
        localized = localize_spots_mle(
            frame,
            candidates,
            psf_sigma_px,
            pixel_size_nm,
            camera_gain=frame_stack.camera_gain,
        )
        if len(localized.estimated_xy):
            results.append(localized)
            frame_indices.append(np.full(len(localized.estimated_xy), frame_idx, dtype=np.int64))
    if not results:
        return _empty_localizations()
    return LocalizationResult(
        estimated_xy=np.concatenate([result.estimated_xy for result in results]),
        photon_estimates=np.concatenate([result.photon_estimates for result in results]),
        uncertainty_nm=np.concatenate([result.uncertainty_nm for result in results]),
        failure_flags=np.concatenate([result.failure_flags for result in results]),
        frame_index=np.concatenate(frame_indices),
    )


def apply_drift_correction(
    localizations_xy: np.ndarray,
    frame_index: np.ndarray,
    drift_per_frame_px: tuple[float, float],
) -> np.ndarray:
    """Subtract known linear drift; this does not estimate drift from data."""
    coordinates = _xy_array(localizations_xy, "localizations_xy", finite=False)
    indices = np.asarray(frame_index)
    if (
        indices.shape != (len(coordinates),)
        or not np.issubdtype(indices.dtype, np.integer)
        or np.any(indices < 0)
    ):
        raise ValueError("frame_index must contain one non-negative integer per localization")
    drift = np.asarray(drift_per_frame_px, dtype=np.float64)
    if drift.shape != (2,) or not np.isfinite(drift).all():
        raise ValueError("drift_per_frame_px must contain two finite numbers")
    return coordinates - indices[:, None] * drift[None, :]


def _inside_sensor(coordinates: np.ndarray, canvas_size_px: tuple[int, int]) -> np.ndarray:
    height, width = canvas_size_px
    return (
        np.isfinite(coordinates).all(axis=1)
        & (coordinates[:, 0] >= -0.5)
        & (coordinates[:, 0] < width - 0.5)
        & (coordinates[:, 1] >= -0.5)
        & (coordinates[:, 1] < height - 0.5)
    )


def reconstruct_density_map(
    localizations_xy: np.ndarray,
    canvas_size_px: tuple[int, int],
    *,
    upsample_factor: int = 8,
    mode: str = "2d",
    z_values: np.ndarray | None = None,
    z_bins: int = 20,
    z_range: tuple[float, float] | None = None,
) -> np.ndarray:
    """Count localizations in half-open sensor bins, omitting non-finite points.

    The optional 3D histogram requires independently supplied axial coordinates;
    this Gaussian 2D simulator does not infer z. Pass z_range to compare volumes
    using a common axial scale; otherwise the finite input range is used.
    """
    height, width = _canvas_shape(canvas_size_px)
    _integer("upsample_factor", upsample_factor)
    coordinates = _xy_array(localizations_xy, "localizations_xy", finite=False)
    if mode not in {"2d", "3d"}:
        raise ValueError("mode must be either '2d' or '3d'")
    shape = (height * upsample_factor, width * upsample_factor)
    valid = _inside_sensor(coordinates, canvas_size_px)
    if mode == "3d":
        _integer("z_bins", z_bins)
        if z_values is None:
            raise ValueError("z_values are required for mode='3d'")
        axial = np.asarray(z_values, dtype=np.float64)
        if axial.shape != (len(coordinates),):
            raise ValueError("z_values must contain one value per localization")
        valid &= np.isfinite(axial)
        if z_range is not None:
            if len(z_range) != 2 or not np.isfinite(z_range).all() or z_range[0] >= z_range[1]:
                raise ValueError("z_range must contain finite increasing bounds")
            z_min, z_max = z_range
            valid &= (axial >= z_min) & (axial < z_max)
        elif valid.any():
            z_min, z_max = float(axial[valid].min()), float(axial[valid].max())
            if z_min == z_max:
                z_min, z_max = z_min - 0.5, z_max + 0.5
            else:
                z_max = float(np.nextafter(z_max, np.inf))
        else:
            z_min, z_max = 0.0, 1.0
        density = np.zeros((z_bins, *shape), dtype=np.float64)
    else:
        density = np.zeros(shape, dtype=np.float64)
    selected = coordinates[valid]
    x_bin = np.floor((selected[:, 0] + 0.5) * upsample_factor).astype(np.int64)
    y_bin = np.floor((selected[:, 1] + 0.5) * upsample_factor).astype(np.int64)
    if mode == "2d":
        np.add.at(density, (y_bin, x_bin), 1.0)
    else:
        z_bin = np.floor((axial[valid] - z_min) / (z_max - z_min) * z_bins).astype(np.int64)
        z_bin = np.minimum(z_bin, z_bins - 1)
        np.add.at(density, (z_bin, y_bin, x_bin), 1.0)
    return density


def evaluate_localizations(
    frame_stack: FrameStack,
    localizations: LocalizationResult,
    *,
    pixel_size_nm: float,
    match_radius_px: float,
) -> LocalizationMetrics:
    """Match successful fits one-to-one to in-sensor active truth per frame.

    RMSE includes matched detections only; missed and false-positive rates expose
    the events excluded from that error. Empty denominators produce NaN rather
    than implying success. Precision bounds are distinct from spatial resolution.
    """
    _finite_number("pixel_size_nm", pixel_size_nm)
    _finite_number("match_radius_px", match_radius_px)
    if localizations.frame_index.shape != (len(localizations.estimated_xy),):
        raise ValueError("evaluation requires a frame_index for every localization")
    if np.any(localizations.frame_index >= len(frame_stack.frames)):
        raise ValueError("frame_index is outside the supplied frame stack")
    successful = ~localizations.failure_flags
    estimates = localizations.estimated_xy[successful]
    indices = localizations.frame_index[successful]
    squared_errors: list[float] = []
    active_count = 0
    for frame_idx, active in enumerate(frame_stack.active_masks):
        truth = frame_stack.ground_truth_xy[active] + frame_stack.frame_drift_xy[frame_idx]
        truth = truth[_inside_sensor(truth, frame_stack.frames.shape[1:])]
        active_count += len(truth)
        detected = estimates[indices == frame_idx]
        if not len(truth) or not len(detected):
            continue
        distances = np.linalg.norm(detected[:, None, :] - truth[None, :, :], axis=2)
        # The large cost prioritizes maximum valid matching before distance.
        unmatched_cost = (min(distances.shape) + 1) * match_radius_px
        rows, cols = linear_sum_assignment(np.where(distances <= match_radius_px, distances, unmatched_cost))
        accepted = distances[rows, cols] <= match_radius_px
        squared_errors.extend((distances[rows[accepted], cols[accepted]] ** 2).tolist())
    matched = len(squared_errors)
    detection_count = len(estimates)
    return LocalizationMetrics(
        localization_rmse_nm=float(np.sqrt(np.mean(squared_errors)) * pixel_size_nm)
        if matched
        else float("nan"),
        fit_failure_rate=float(np.mean(localizations.failure_flags)) if len(successful) else float("nan"),
        missed_detection_rate=1.0 - matched / active_count if active_count else float("nan"),
        false_positive_rate=1.0 - matched / detection_count if detection_count else float("nan"),
        median_precision_nm=float(np.median(localizations.uncertainty_nm[successful]))
        if detection_count
        else float("nan"),
        matched_count=matched,
        active_count=active_count,
    )


def run_parameter_sweep(
    base_params: SimulationParams,
    sweep_spec: dict[str, Iterable[object]],
    threshold_cfg: DetectionThreshold | None = None,
) -> dict[str, SweepResult]:
    """Compare matched accuracy, fit failures, detection errors and precision."""
    results: dict[str, SweepResult] = {}
    for parameter, iterable in sweep_spec.items():
        values = list(iterable)
        metrics: list[LocalizationMetrics] = []
        for value in values:
            varied = replace(base_params, **{parameter: value})
            stack = simulate_storm_frames(varied)
            localized = localize_frame_stack(stack, varied.psf_sigma_px, varied.pixel_size_nm, threshold_cfg)
            metrics.append(
                evaluate_localizations(
                    stack,
                    localized,
                    pixel_size_nm=varied.pixel_size_nm,
                    match_radius_px=varied.psf_sigma_px,
                )
            )
        results[parameter] = SweepResult(
            parameter_name=parameter,
            parameter_values=values,
            localization_rmse_nm=[m.localization_rmse_nm for m in metrics],
            fit_failure_rate=[m.fit_failure_rate for m in metrics],
            missed_detection_rate=[m.missed_detection_rate for m in metrics],
            false_positive_rate=[m.false_positive_rate for m in metrics],
            median_precision_nm=[m.median_precision_nm for m in metrics],
        )
    return results


QUICK_SIM_PARAMS = SimulationParams(
    n_emitters=30,
    frame_count=40,
    canvas_size_px=(32, 32),
    on_off_rates=(0.08, 0.3),
    drift_per_frame_px=(0.0, 0.0),
    seed=42,
)


def quick_sim(
    *,
    n_emitters: int | None = None,
    photon_mean: float | None = None,
    drift: tuple[float, float] | None = None,
    seed: int | None = None,
) -> tuple[FrameStack, LocalizationResult]:
    """Run a small simulation for slide illustrations."""
    overrides = {
        key: value
        for key, value in (
            ("n_emitters", n_emitters),
            ("photon_mean", photon_mean),
            ("drift_per_frame_px", drift),
            ("seed", seed),
        )
        if value is not None
    }
    params = replace(QUICK_SIM_PARAMS, **overrides)
    stack = simulate_storm_frames(params)
    return stack, localize_frame_stack(stack, params.psf_sigma_px, params.pixel_size_nm)


def frame_to_image_array(frame: np.ndarray) -> np.ndarray:
    """Normalize a frame for display only; localization always uses raw counts."""
    pixels = _photon_frame(frame, 1.0)
    low, high = float(pixels.min()), float(pixels.max())
    if high == low:
        return np.zeros_like(pixels, dtype=np.uint8)
    return ((pixels - low) / (high - low) * 255).astype(np.uint8)
