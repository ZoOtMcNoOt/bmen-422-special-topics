"""Seeded, synthetic structures for teaching spatial reconstruction.

These are geometric illustrations, not measured biological specimens.
Coordinates use camera pixel centers (x, y); the lab uses a 64 x 64 sensor.
"""

from typing import Literal

import numpy as np

Specimen = Literal["filaments", "rings", "clusters"]


def make_specimen(kind: Specimen, count: int, seed: int) -> np.ndarray:
    """Place exactly *count* emitters in the safe interior of the lab's sensor."""
    rng = np.random.default_rng(seed)
    t = rng.uniform(0, 1, count)
    if kind == "filaments":
        strand = rng.integers(0, 5, count)
        x = 7 + 49 * t
        y = 13 + strand * 8 + 7 * np.sin(t * 5 + strand * 1.1)
        # Tilt the field so overlapping fibers can be compared in both views.
        xy = np.column_stack((x, y)) - 32
        angle = -0.35
        rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
        xy = xy @ rotation.T + 32
        xy += rng.normal(0, 0.13, xy.shape)
    elif kind == "rings":
        centers = np.array([[19, 20], [43, 22], [30, 44]])
        ring = rng.integers(0, 3, count)
        radius = np.array([8.0, 6.5, 8.5])[ring] + rng.normal(0, 0.12, count)
        xy = centers[ring] + radius[:, None] * np.column_stack((np.cos(t * 2 * np.pi), np.sin(t * 2 * np.pi)))
    elif kind == "clusters":
        centers = np.array([[16, 17], [24, 18], [45, 17], [40, 37], [17, 44], [45, 48]])
        cluster = rng.integers(0, len(centers), count)
        xy = centers[cluster] + rng.normal(0, 1.65, (count, 2))
    else:
        raise ValueError(f"Unknown specimen: {kind}")
    return np.clip(xy, 6, 57)
