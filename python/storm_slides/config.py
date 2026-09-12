"""Shared style and deck-level constants for a 3Blue1Brown–quality presentation."""

from __future__ import annotations

from dataclasses import dataclass

PROJECT_TITLE = "STORM: Electromagnetic Waves to Super-Resolved Maps"
TARGET_RUNTIME_SECONDS = 27 * 60  # ~27-min presentation


# ---------------------------------------------------------------------------
# Color palette — Tailwind-inspired dark + vivid accents
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DeckTheme:
    # --- backgrounds ---
    background_color: str = "#0F172A"       # dark navy
    surface: str = "#1E293B"               # card/panel background
    progress_bg: str = "#1E293B"
    progress_fill: str = "#14B8A6"          # teal

    # --- text ---
    text_primary: str = "#E2E8F0"           # light slate
    text_muted: str = "#94A3B8"             # blue-gray
    text_highlight: str = "#FFFFFF"         # pure white for emphasis

    # --- section accents ---
    accent_physics: str = "#38BDF8"         # sky blue (EM / waves)
    accent_optics: str = "#F59E0B"          # amber   (Fourier / optics)
    accent_instrument: str = "#F97316"      # orange  (hardware / microscope)
    accent_algorithm: str = "#22C55E"       # green   (localization / recon)
    accent_alert: str = "#EF4444"           # red     (caution / limitations)
    accent_soft: str = "#A78BFA"            # lavender (sample / fluorophores)
    citation_color: str = "#FDE68A"         # light yellow

    # --- semantic scientific colors ---
    wave_blue: str = "#60A5FA"              # travelling EM wave
    wave_blue_dim: str = "#1E3A5F"          # dim trail
    emission_green: str = "#4ADE80"         # fluorescence emission
    excitation_violet: str = "#A855F7"      # excitation laser
    photon_gold: str = "#FBBF24"            # photon particles
    detector_gray: str = "#64748B"          # camera / electronics
    psf_cyan: str = "#22D3EE"              # PSF / Airy
    psf_cyan_dim: str = "#164E63"          # dim PSF halo
    recon_teal: str = "#2DD4BF"            # reconstruction map
    error_red_dim: str = "#7F1D1D"          # dim error overlay

    # --- glow / transparency variants (hex rgba-ish, used with opacity) ---
    glow_blue: str = "#38BDF8"
    glow_green: str = "#22C55E"
    glow_amber: str = "#F59E0B"


THEME = DeckTheme()

# ---------------------------------------------------------------------------
# Typography
# ---------------------------------------------------------------------------

FONT_SANS = "DejaVu Sans"
FONT_MONO = "DejaVu Sans Mono"     # equations / code annotations
TITLE_SIZE = 52
SECTION_SIZE = 40
BODY_SIZE = 30
CAPTION_SIZE = 24
SMALLCAP_SIZE = 20
CITATION_SIZE = 22
LABEL_SIZE = 18

# ---------------------------------------------------------------------------
# Timing / animation defaults
# ---------------------------------------------------------------------------

DEFAULT_RUN_TIME = 1.0               # base run_time for standard animations
FAST_RUN_TIME = 0.5                  # quick transitions
SLOW_RUN_TIME = 2.0                  # dramatic reveals
TOTAL_SLIDES = 17
