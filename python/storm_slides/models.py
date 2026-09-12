"""Validated data contracts for the educational STORM simulation."""

from __future__ import annotations

from dataclasses import dataclass, field
from numbers import Integral, Real
from typing import Any

import numpy as np


def _finite_number(name: str, value: float, *, minimum: float = 0.0, inclusive: bool = False) -> None:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, Real) or not np.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    invalid = value < minimum if inclusive else value <= minimum
    if invalid:
        relation = ">=" if inclusive else ">"
        raise ValueError(f"{name} must be {relation} {minimum}")


def _integer(name: str, value: int, *, minimum: int = 1) -> None:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, Integral) or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


def _canvas_shape(canvas_size_px: tuple[int, int], *, minimum: int = 1) -> tuple[int, int]:
    if len(canvas_size_px) != 2:
        raise ValueError("canvas_size_px must contain (height, width)")
    height, width = canvas_size_px
    _integer("canvas height", height, minimum=minimum)
    _integer("canvas width", width, minimum=minimum)
    return int(height), int(width)


@dataclass(frozen=True)
class SimulationParams:
    """Camera units are gain * photons; on/off values are probabilities per frame."""

    n_emitters: int = 120
    frame_count: int = 180
    canvas_size_px: tuple[int, int] = (64, 64)
    pixel_size_nm: float = 100.0
    psf_sigma_px: float = 1.2
    background_lambda: float = 2.0
    photon_mean: float = 550.0
    on_off_rates: tuple[float, float] = (0.05, 0.25)
    drift_per_frame_px: tuple[float, float] = (0.02, -0.01)
    camera_gain: float = 1.0
    seed: int = 4

    def validate(self) -> None:
        _integer("n_emitters", self.n_emitters)
        _integer("frame_count", self.frame_count)
        _canvas_shape(self.canvas_size_px, minimum=9)
        for name in ("pixel_size_nm", "psf_sigma_px", "photon_mean", "camera_gain"):
            _finite_number(name, getattr(self, name))
        _finite_number("background_lambda", self.background_lambda, inclusive=True)
        if len(self.on_off_rates) != 2:
            raise ValueError("on_off_rates must contain (on_probability, off_probability)")
        for probability in self.on_off_rates:
            _finite_number("on_off_rates", probability, inclusive=True)
            if probability > 1:
                raise ValueError("on_off_rates are per-frame probabilities and must be <= 1")
        if len(self.drift_per_frame_px) != 2 or not np.isfinite(self.drift_per_frame_px).all():
            raise ValueError("drift_per_frame_px must contain two finite numbers")
        _integer("seed", self.seed, minimum=0)


@dataclass(frozen=True)
class DetectionThreshold:
    """Detection thresholds are expressed in photons, before camera gain."""

    sigma_multiplier: float = 2.5
    absolute_floor: float = 12.0
    min_distance_px: int = 2

    def validate(self) -> None:
        _finite_number("sigma_multiplier", self.sigma_multiplier)
        _finite_number("absolute_floor", self.absolute_floor, inclusive=True)
        _integer("min_distance_px", self.min_distance_px)


@dataclass(frozen=True)
class FrameStack:
    frames: np.ndarray
    ground_truth_xy: np.ndarray
    active_masks: np.ndarray
    frame_drift_xy: np.ndarray
    emitter_photons: np.ndarray
    camera_gain: float = 1.0

    def __post_init__(self) -> None:
        if self.frames.ndim != 3 or any(size == 0 for size in self.frames.shape):
            raise ValueError("frames must have non-empty shape (T, H, W)")
        if self.ground_truth_xy.ndim != 2 or self.ground_truth_xy.shape[1] != 2:
            raise ValueError("ground_truth_xy must have shape (N, 2)")
        expected = (self.frames.shape[0], self.ground_truth_xy.shape[0])
        if self.active_masks.shape != expected or self.active_masks.dtype != np.bool_:
            raise ValueError("active_masks must be a boolean array with shape (T, N)")
        if self.frame_drift_xy.shape != (self.frames.shape[0], 2):
            raise ValueError("frame_drift_xy must have shape (T, 2)")
        if self.emitter_photons.shape != expected:
            raise ValueError("emitter_photons must have shape (T, N)")
        for name in ("frames", "ground_truth_xy", "frame_drift_xy", "emitter_photons"):
            if not np.isfinite(getattr(self, name)).all():
                raise ValueError(f"{name} must contain only finite values")
        if np.any(self.frames < 0) or np.any(self.emitter_photons < 0):
            raise ValueError("frames and emitter_photons must be non-negative")
        _finite_number("camera_gain", self.camera_gain)


@dataclass(frozen=True)
class LocalizationResult:
    estimated_xy: np.ndarray
    photon_estimates: np.ndarray
    # Per-axis RMS Cramer-Rao precision bound for the fitted single-emitter model.
    # This is not a measured image resolution or a guarantee for overlapping spots.
    uncertainty_nm: np.ndarray
    failure_flags: np.ndarray
    frame_index: np.ndarray = field(default_factory=lambda: np.array([], dtype=np.int64))

    def __post_init__(self) -> None:
        if self.estimated_xy.ndim != 2 or self.estimated_xy.shape[1] != 2:
            raise ValueError("estimated_xy must have shape (N, 2)")
        count = self.estimated_xy.shape[0]
        for name in ("photon_estimates", "uncertainty_nm", "failure_flags"):
            if getattr(self, name).shape != (count,):
                raise ValueError(f"{name} must have shape (N,)")
        if self.failure_flags.dtype != np.bool_:
            raise ValueError("failure_flags must be boolean")
        if self.frame_index.shape not in {(0,), (count,)}:
            raise ValueError("frame_index must be empty or have shape (N,)")
        if not np.issubdtype(self.frame_index.dtype, np.integer) or np.any(self.frame_index < 0):
            raise ValueError("frame_index must contain non-negative integers")
        successful = ~self.failure_flags
        for name in ("estimated_xy", "photon_estimates", "uncertainty_nm"):
            if not np.isfinite(getattr(self, name)[successful]).all():
                raise ValueError(f"successful {name} values must be finite")
        if np.any(self.photon_estimates[successful] <= 0) or np.any(self.uncertainty_nm[successful] <= 0):
            raise ValueError("successful photon estimates and precision bounds must be positive")

    def successful_xy(self) -> np.ndarray:
        return self.estimated_xy[~self.failure_flags]


@dataclass(frozen=True)
class LocalizationMetrics:
    localization_rmse_nm: float
    fit_failure_rate: float
    missed_detection_rate: float
    false_positive_rate: float
    median_precision_nm: float
    matched_count: int
    active_count: int


@dataclass(frozen=True)
class SweepResult:
    parameter_name: str
    parameter_values: list[Any]
    localization_rmse_nm: list[float]
    fit_failure_rate: list[float]
    missed_detection_rate: list[float]
    false_positive_rate: list[float]
    median_precision_nm: list[float]
