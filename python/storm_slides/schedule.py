"""Narrative and timing contract for the ~27-minute STORM deck."""

from __future__ import annotations

SLIDE_TIMINGS_SECONDS: list[tuple[str, int]] = [
    ("OpeningRoadmapSlide", 90),          # 1:30
    ("MaxwellToWaveSlide", 100),          # 1:40
    ("HelmholtzWaveSlide", 80),           # 1:20
    ("PupilFunctionSlide", 100),          # 1:40
    ("PSFResolutionSlide", 80),           # 1:20
    ("TemporalSparsitySlide", 120),       # 2:00
    ("OpticalPathSlide", 120),            # 2:00
    ("PhotoswitchingSlide", 60),          # 1:00
    ("CameraStatisticsSlide", 120),       # 2:00
    ("LocalizationPipelineSlide", 90),    # 1:30
    ("GaussianFittingSlide", 90),         # 1:30
    ("PhotonBudgetSweepSlide", 120),      # 2:00
    ("DensityDriftSweepSlide", 120),      # 2:00
    ("ThreeDExtensionSlide", 90),         # 1:30
    ("BiologicalExamplesSlide", 90),      # 1:30
    ("LimitationsFrontierSlide", 90),     # 1:30
    ("ConclusionChecklistSlide", 60),     # 1:00
]

TARGET_RUNTIME_SECONDS = 27 * 60
MIN_RUNTIME_SECONDS = 25 * 60
MAX_RUNTIME_SECONDS = 30 * 60


def total_runtime_seconds() -> int:
    return sum(seconds for _, seconds in SLIDE_TIMINGS_SECONDS)


def runtime_within_target() -> bool:
    total = total_runtime_seconds()
    return MIN_RUNTIME_SECONDS <= total <= MAX_RUNTIME_SECONDS
