"""Plot-friendly helpers used by simulation and slide scenes.

Provides numpy→Manim bridging utilities for heat-maps, bar charts, and
sweep-result visualisation.
"""

from __future__ import annotations

import numpy as np

from storm_slides.models import SweepResult


# ------------------------------------------------------------------
# Pure-numpy helpers (always available, even without Manim)
# ------------------------------------------------------------------


def normalize_array(values: np.ndarray) -> np.ndarray:
    """Min-max normalise *values* to [0, 1]."""
    if values.size == 0:
        return values
    v_min = float(np.min(values))
    v_max = float(np.max(values))
    if v_max == v_min:
        return np.zeros_like(values, dtype=np.float64)
    return (values - v_min) / (v_max - v_min)


def sweep_to_table_rows(result: SweepResult) -> list[tuple[str, float, float, float]]:
    """Convert sweep outputs into display-friendly rows."""
    rows: list[tuple[str, float, float, float]] = []
    for idx, value in enumerate(result.parameter_values):
        rows.append(
            (
                str(value),
                float(result.localization_rmse_nm[idx]),
                float(result.fit_failure_rate[idx]),
                float(result.median_precision_nm[idx]),
            )
        )
    return rows


def array_to_heatmap_rgb(
    arr: np.ndarray,
    colormap: str = "hot",
) -> np.ndarray:
    """Convert a 2-D float array to an (H, W, 3) uint8 RGB image.

    A simple hot-style colormap is applied:  black → red → yellow → white.
    This avoids a matplotlib dependency.
    """
    norm = normalize_array(arr.astype(np.float64))
    h, w = norm.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)

    if colormap == "hot":
        # R channel ramps first, then G, then B
        rgb[:, :, 0] = np.clip(norm * 3.0, 0, 1) * 255
        rgb[:, :, 1] = np.clip((norm - 0.33) * 3.0, 0, 1) * 255
        rgb[:, :, 2] = np.clip((norm - 0.66) * 3.0, 0, 1) * 255
    elif colormap == "cyan":
        rgb[:, :, 0] = 0
        rgb[:, :, 1] = (norm * 255).astype(np.uint8)
        rgb[:, :, 2] = (norm * 255).astype(np.uint8)
    else:  # grayscale fallback
        g = (norm * 255).astype(np.uint8)
        rgb[:, :, 0] = g
        rgb[:, :, 1] = g
        rgb[:, :, 2] = g

    return rgb


def gaussian_2d(
    size: int = 64,
    sigma: float = 8.0,
    center: tuple[float, float] | None = None,
) -> np.ndarray:
    """Return a 2-D Gaussian on a (size × size) grid (peak = 1)."""
    if center is None:
        cx, cy = size / 2, size / 2
    else:
        cx, cy = center
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    g = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma**2))
    return g / (g.max() + 1e-12)


def airy_like_psf(
    size: int = 128,
    na: float = 1.4,
    wavelength_nm: float = 680.0,
    pixel_nm: float = 10.0,
) -> np.ndarray:
    """Approximate Airy pattern (sinc²-like) PSF on a grid.

    Uses a Bessel-function–free approximation:
        I(r) ∝ (2 * J1(x)/x)^2 ≈ sinc(x/π)^2
    which is close enough for visualisation purposes.
    """
    cx = cy = size / 2
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) * pixel_nm  # in nm

    # First zero of Airy at r = 0.61 * λ / NA
    r0 = 0.61 * wavelength_nm / na
    x = np.pi * r / r0
    with np.errstate(divide="ignore", invalid="ignore"):
        psf = np.where(x == 0, 1.0, (np.sin(x) / x) ** 2)
    return psf / (psf.max() + 1e-12)
