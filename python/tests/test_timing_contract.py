from __future__ import annotations

from storm_slides.main_deck import SCENE_NAME_ORDER
from storm_slides.schedule import (
    MAX_RUNTIME_SECONDS,
    MIN_RUNTIME_SECONDS,
    SLIDE_TIMINGS_SECONDS,
    total_runtime_seconds,
)


def test_timing_contract_is_within_target_window() -> None:
    """25-30 minute window for the extended 3B1B-quality deck."""
    total = total_runtime_seconds()
    assert MIN_RUNTIME_SECONDS <= total <= MAX_RUNTIME_SECONDS


def test_scene_order_matches_timing_contract() -> None:
    timing_scene_names = [name for name, _ in SLIDE_TIMINGS_SECONDS]
    assert timing_scene_names == SCENE_NAME_ORDER
    assert len(SCENE_NAME_ORDER) == 17
