"""Master deck module with all ordered STORM slide scenes."""

from __future__ import annotations

from storm_slides.algorithm_scenes import (
    BiologicalExamplesSlide as _BiologicalExamplesSlide,
    ConclusionChecklistSlide as _ConclusionChecklistSlide,
    DensityDriftSweepSlide as _DensityDriftSweepSlide,
    GaussianFittingSlide as _GaussianFittingSlide,
    LimitationsFrontierSlide as _LimitationsFrontierSlide,
    LocalizationPipelineSlide as _LocalizationPipelineSlide,
    PhotonBudgetSweepSlide as _PhotonBudgetSweepSlide,
    ThreeDExtensionSlide as _ThreeDExtensionSlide,
)
from storm_slides.instrument_scenes import (
    CameraStatisticsSlide as _CameraStatisticsSlide,
    OpticalPathSlide as _OpticalPathSlide,
    PhotoswitchingSlide as _PhotoswitchingSlide,
)
from storm_slides.physics_scenes import (
    HelmholtzWaveSlide as _HelmholtzWaveSlide,
    MaxwellToWaveSlide as _MaxwellToWaveSlide,
    OpeningRoadmapSlide as _OpeningRoadmapSlide,
    PSFResolutionSlide as _PSFResolutionSlide,
    PupilFunctionSlide as _PupilFunctionSlide,
    TemporalSparsitySlide as _TemporalSparsitySlide,
)


class OpeningRoadmapSlide(_OpeningRoadmapSlide):
    pass


class MaxwellToWaveSlide(_MaxwellToWaveSlide):
    pass


class HelmholtzWaveSlide(_HelmholtzWaveSlide):
    pass


class PupilFunctionSlide(_PupilFunctionSlide):
    pass


class PSFResolutionSlide(_PSFResolutionSlide):
    pass


class TemporalSparsitySlide(_TemporalSparsitySlide):
    pass


class OpticalPathSlide(_OpticalPathSlide):
    pass


class PhotoswitchingSlide(_PhotoswitchingSlide):
    pass


class CameraStatisticsSlide(_CameraStatisticsSlide):
    pass


class LocalizationPipelineSlide(_LocalizationPipelineSlide):
    pass


class GaussianFittingSlide(_GaussianFittingSlide):
    pass


class PhotonBudgetSweepSlide(_PhotonBudgetSweepSlide):
    pass


class DensityDriftSweepSlide(_DensityDriftSweepSlide):
    pass


class ThreeDExtensionSlide(_ThreeDExtensionSlide):
    pass


class BiologicalExamplesSlide(_BiologicalExamplesSlide):
    pass


class LimitationsFrontierSlide(_LimitationsFrontierSlide):
    pass


class ConclusionChecklistSlide(_ConclusionChecklistSlide):
    pass

DECK_SCENES = [
    OpeningRoadmapSlide,
    MaxwellToWaveSlide,
    HelmholtzWaveSlide,
    PupilFunctionSlide,
    PSFResolutionSlide,
    TemporalSparsitySlide,
    OpticalPathSlide,
    PhotoswitchingSlide,
    CameraStatisticsSlide,
    LocalizationPipelineSlide,
    GaussianFittingSlide,
    PhotonBudgetSweepSlide,
    DensityDriftSweepSlide,
    ThreeDExtensionSlide,
    BiologicalExamplesSlide,
    LimitationsFrontierSlide,
    ConclusionChecklistSlide,
]

SCENE_NAME_ORDER = [scene.__name__ for scene in DECK_SCENES]

__all__ = ["DECK_SCENES", "SCENE_NAME_ORDER", *SCENE_NAME_ORDER]
