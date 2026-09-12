"""Instrumentation slides — 3Blue1Brown quality.

Slides:
  7. OpticalPathSlide       — ray-traced optical bench with animated beams
  8. PhotoswitchingSlide    — Jablonski energy diagram
  9. CameraStatisticsSlide  — photon counting, Poisson model, SNR
"""

from __future__ import annotations

import numpy as np

from storm_slides.config import (
    BODY_SIZE,
    CAPTION_SIZE,
    FONT_SANS,
    LABEL_SIZE,
    SECTION_SIZE,
    THEME,
    TITLE_SIZE,
    TOTAL_SLIDES,
)
from storm_slides.scene_base import MANIM_AVAILABLE, BaseStormSlide

if MANIM_AVAILABLE:
    from manim import (
        DOWN,
        LEFT,
        RIGHT,
        UP,
        ORIGIN,
        PI,
        TAU,
        Axes,
        Arrow,
        Circle,
        Dot,
        FadeIn,
        FadeOut,
        Flash,
        GrowFromCenter,
        GrowFromEdge,
        Indicate,
        LaggedStart,
        Line,
        ManimColor,
        MathTex,
        Rectangle,
        RoundedRectangle,
        Square,
        SurroundingRectangle,
        Text,
        Transform,
        VGroup,
        VMobject,
        Write,
        Create,
        ValueTracker,
        rate_functions,
        always_redraw,
    )
    from storm_slides.custom_mobjects import (
        BeamArrow,
        DetectorGrid,
        DichroicMirror,
        EnergyLevel,
        EquationBox,
        Fluorophore,
        GlowDot,
        Lens,
    )
    from storm_slides.custom_animations import (
        glow_pulse,
    )


# ======================================================================
# Fallback stubs
# ======================================================================

if not MANIM_AVAILABLE:

    class OpticalPathSlide(BaseStormSlide):
        pass

    class PhotoswitchingSlide(BaseStormSlide):
        pass

    class CameraStatisticsSlide(BaseStormSlide):
        pass

else:

    # ==================================================================
    # 7.  Optical Path  (Scene A only from old MicroscopeArchitectureSlide)
    # ==================================================================

    class OpticalPathSlide(BaseStormSlide):
        """Component-by-component light-path build with animated beams."""

        def construct(self) -> None:
            self.add_progress(7, TOTAL_SLIDES)
            self.add_chapter_header(
                "Microscope & Hardware",
                "Excitation · filtering · high-NA collection",
                accent_color=THEME.accent_instrument,
            )
            self.add_citations("[3][8][9]")

            y_bench = DOWN * 0.2

            # --- Components (left → right) ---
            # Laser
            laser_box = RoundedRectangle(
                corner_radius=0.1, width=1.0, height=0.7,
                color=THEME.excitation_violet, fill_opacity=0.2, stroke_width=2.5,
            ).shift(LEFT * 5.8 + y_bench)
            laser_label = Text("Laser", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.excitation_violet)
            laser_label.next_to(laser_box, DOWN, buff=0.15)

            # Dichroic
            dichroic = DichroicMirror(size=0.9, color=THEME.accent_physics)
            dichroic.move_to(LEFT * 3.3 + y_bench)
            dichroic_label = Text("Dichroic", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_physics)
            dichroic_label.next_to(dichroic, DOWN, buff=0.3)

            # Objective lens
            obj_lens = Lens(height=1.5, curvature=0.35, color=THEME.accent_optics)
            obj_lens.move_to(LEFT * 1.2 + y_bench)
            obj_label = Text("Objective", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_optics)
            obj_label.next_to(obj_lens, DOWN, buff=0.15)
            na_label = Text("NA ≥ 1.4", font=FONT_SANS, font_size=LABEL_SIZE - 4, color=THEME.text_muted)
            na_label.next_to(obj_label, DOWN, buff=0.08)

            # Sample
            sample_rect = Rectangle(
                width=1.2, height=0.35,
                color=THEME.accent_soft, fill_opacity=0.25, stroke_width=2,
            ).shift(RIGHT * 0.8 + y_bench)
            sample_label = Text("Sample", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_soft)
            sample_label.next_to(sample_rect, DOWN, buff=0.15)
            # Small fluorophore dots on sample
            sample_fluors = VGroup()
            rng = np.random.default_rng(3)
            for _ in range(5):
                f = Dot(
                    point=sample_rect.get_center() + np.array([rng.uniform(-0.4, 0.4), rng.uniform(-0.1, 0.1), 0]),
                    radius=0.04, color=THEME.emission_green,
                )
                sample_fluors.add(f)

            # Emission filter
            em_filter = Rectangle(
                width=0.15, height=0.9,
                color=THEME.emission_green, fill_opacity=0.3, stroke_width=2,
            ).shift(RIGHT * 2.8 + y_bench)
            em_label = Text("Em. Filter", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.emission_green)
            em_label.next_to(em_filter, DOWN, buff=0.15)

            # Camera
            camera = DetectorGrid(rows=5, cols=5, pixel_size=0.2)
            camera.move_to(RIGHT * 4.8 + y_bench)
            cam_label = Text("sCMOS", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.detector_gray)
            cam_label.next_to(camera, DOWN, buff=0.15)

            # --- Build the bench component by component ---
            components = [
                (laser_box, laser_label),
                (dichroic, dichroic_label),
                (obj_lens, obj_label),
                (sample_rect, sample_label),
                (em_filter, em_label),
                (camera, cam_label),
            ]
            for comp, label in components:
                self.play(GrowFromCenter(comp), FadeIn(label), run_time=0.45)
            self.play(FadeIn(na_label), FadeIn(sample_fluors), run_time=0.3)
            self.next_slide()

            # --- Excitation beam (violet): laser → dichroic → objective → sample ---
            exc_1 = Arrow(
                laser_box.get_right(), dichroic.get_left() + LEFT * 0.15,
                buff=0.08, color=THEME.excitation_violet, stroke_width=4,
                max_tip_length_to_length_ratio=0.1,
            )
            exc_2 = Arrow(
                dichroic.get_center(), obj_lens.get_right() + RIGHT * 0.1,
                buff=0.08, color=THEME.excitation_violet, stroke_width=4,
                max_tip_length_to_length_ratio=0.1,
            )
            exc_3 = Arrow(
                obj_lens.get_right(), sample_rect.get_left(),
                buff=0.08, color=THEME.excitation_violet, stroke_width=4,
                max_tip_length_to_length_ratio=0.12,
            )

            exc_label = Text("excitation", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.excitation_violet)
            exc_label.next_to(exc_1, UP, buff=0.08)

            # Narrator: excitation beam description
            narrator_exc = self.add_narrator_note(
                "Laser excites fluorophores at λ = 405–647 nm",
                color=THEME.excitation_violet, position="bottom",
            )

            self.play(
                Create(exc_1), FadeIn(exc_label),
                run_time=0.6,
            )
            self.play(Create(exc_2), run_time=0.4)
            self.play(Create(exc_3), run_time=0.4)

            # Flash fluorophores
            for f in sample_fluors:
                self.play(Flash(f, color=THEME.emission_green, flash_radius=0.2, run_time=0.15))

            # --- Emission beam (green): sample → objective → dichroic(transmit) → filter → camera ---
            self.play(FadeOut(narrator_exc), run_time=0.2)
            narrator_em = self.add_narrator_note(
                "Stokes-shifted emission passes through dichroic to camera",
                color=THEME.emission_green, position="bottom",
            )

            em_1 = Arrow(
                sample_rect.get_left(), obj_lens.get_right(),
                buff=0.08, color=THEME.emission_green, stroke_width=3.5,
                max_tip_length_to_length_ratio=0.1,
            )
            em_2 = Arrow(
                obj_lens.get_left() + LEFT * 0.05, dichroic.get_center(),
                buff=0.08, color=THEME.emission_green, stroke_width=3.5,
                max_tip_length_to_length_ratio=0.1,
            )
            em_3 = Arrow(
                dichroic.get_right() + RIGHT * 0.1, em_filter.get_left(),
                buff=0.08, color=THEME.emission_green, stroke_width=3.5,
                max_tip_length_to_length_ratio=0.1,
            )
            em_4 = Arrow(
                em_filter.get_right(), camera.get_left(),
                buff=0.08, color=THEME.emission_green, stroke_width=3.5,
                max_tip_length_to_length_ratio=0.12,
            )

            em_label = Text("emission", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.emission_green)
            em_label.next_to(em_3, UP, buff=0.08)

            self.play(
                LaggedStart(
                    Create(em_1), Create(em_2), Create(em_3), Create(em_4),
                    lag_ratio=0.2,
                ),
                FadeIn(em_label),
                run_time=1.6,
            )

            # Highlight a few camera pixels
            for r, c in [(1, 2), (2, 3), (3, 1)]:
                camera.highlight_pixel(r, c, THEME.emission_green, 0.7)
            self.play(Indicate(camera, color=THEME.emission_green, scale_factor=1.05), run_time=0.5)
            self.play(FadeOut(narrator_em), run_time=0.2)
            self.wait(0.5)

    # ==================================================================
    # 8.  Photoswitching  (Scene B from old MicroscopeArchitectureSlide)
    # ==================================================================

    class PhotoswitchingSlide(BaseStormSlide):
        """Jablonski energy-level diagram with transition arrows and notes."""

        def construct(self) -> None:
            self.add_progress(8, TOTAL_SLIDES)
            self.add_chapter_header(
                "Photoswitching Mechanism",
                "Fluorophore energy states control blinking",
                accent_color=THEME.accent_instrument,
            )
            self.add_citations("[3][8][9]")

            energy_title = Text(
                "Photo-switching: fluorophore energy states",
                font=FONT_SANS,
                font_size=BODY_SIZE - 2,
                color=THEME.text_primary,
            ).to_edge(UP, buff=2.2)
            self.play(FadeIn(energy_title), run_time=0.4)

            # Simple Jablonski-style diagram
            ground = EnergyLevel("S₀ (ground)", width=2.4, color=THEME.text_primary)
            ground.move_to(DOWN * 1.5 + LEFT * 0.5)
            excited = EnergyLevel("S₁ (excited)", width=2.4, color=THEME.emission_green)
            excited.move_to(UP * 0.5 + LEFT * 0.5)
            dark = EnergyLevel("Dark state", width=2.4, color=THEME.accent_alert)
            dark.move_to(UP * 0.5 + RIGHT * 3.5)

            self.play(Create(ground), run_time=0.5)
            self.play(Create(excited), run_time=0.5)
            self.play(Create(dark), run_time=0.5)

            # Transition arrows
            excite_arrow = Arrow(
                ground.line.get_center() + UP * 0.15,
                excited.line.get_center() + DOWN * 0.15,
                color=THEME.excitation_violet, stroke_width=3, buff=0.1,
            )
            ex_label = Text("hν (excite)", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.excitation_violet)
            ex_label.next_to(excite_arrow, LEFT, buff=0.1)

            emit_arrow = Arrow(
                excited.line.get_center() + DOWN * 0.15,
                ground.line.get_center() + UP * 0.15,
                color=THEME.emission_green, stroke_width=3, buff=0.1,
            )
            emit_arrow.shift(RIGHT * 0.8)
            em_lab = Text("emit photon", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.emission_green)
            em_lab.next_to(emit_arrow, RIGHT, buff=0.1)

            dark_arrow = Arrow(
                excited.line.get_right() + RIGHT * 0.1,
                dark.line.get_left() + LEFT * 0.1,
                color=THEME.accent_alert, stroke_width=3, buff=0.05,
            )
            dark_lab = Text("k_off", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.accent_alert)
            dark_lab.next_to(dark_arrow, UP, buff=0.08)

            recover_arrow = Arrow(
                dark.line.get_center() + DOWN * 0.15,
                ground.line.get_right() + RIGHT * 0.3 + UP * 0.15,
                color=THEME.accent_optics, stroke_width=3, buff=0.05,
            )
            rec_lab = Text("k_on (thiol)", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.accent_optics)
            rec_lab.next_to(recover_arrow, RIGHT, buff=0.08)

            # Animate transitions with brief notes for each
            energy_note_1 = Text(
                "Photon absorbed → electron promoted",
                font=FONT_SANS, font_size=LABEL_SIZE - 2,
                color=THEME.excitation_violet, slant="ITALIC",
            ).to_edge(DOWN, buff=0.85)
            self.play(Create(excite_arrow), FadeIn(ex_label), FadeIn(energy_note_1), run_time=0.5)

            energy_note_2 = Text(
                "Relaxation emits a fluorescence photon",
                font=FONT_SANS, font_size=LABEL_SIZE - 2,
                color=THEME.emission_green, slant="ITALIC",
            ).to_edge(DOWN, buff=0.85)
            self.play(FadeOut(energy_note_1), run_time=0.15)
            self.play(Create(emit_arrow), FadeIn(em_lab), FadeIn(energy_note_2), run_time=0.5)

            energy_note_3 = Text(
                "Intersystem crossing → dark (off) state",
                font=FONT_SANS, font_size=LABEL_SIZE - 2,
                color=THEME.accent_alert, slant="ITALIC",
            ).to_edge(DOWN, buff=0.85)
            self.play(FadeOut(energy_note_2), run_time=0.15)
            self.play(Create(dark_arrow), FadeIn(dark_lab), FadeIn(energy_note_3), run_time=0.5)

            energy_note_4 = Text(
                "Thiol-mediated recovery → ground state",
                font=FONT_SANS, font_size=LABEL_SIZE - 2,
                color=THEME.accent_optics, slant="ITALIC",
            ).to_edge(DOWN, buff=0.85)
            self.play(FadeOut(energy_note_3), run_time=0.15)
            self.play(Create(recover_arrow), FadeIn(rec_lab), FadeIn(energy_note_4), run_time=0.5)
            self.play(FadeOut(energy_note_4), run_time=0.2)

            note = Text(
                "Stochastic switching ensures only a few\nemitters are ON per acquisition frame.",
                font=FONT_SANS,
                font_size=CAPTION_SIZE,
                color=THEME.text_muted,
            ).to_edge(DOWN, buff=0.8)
            self.play(FadeIn(note, shift=UP * 0.1), run_time=0.6)
            self.wait(0.5)

    # ==================================================================
    # 9.  Camera Statistics  (2 : 00)
    # ==================================================================

    class CameraStatisticsSlide(BaseStormSlide):
        """Photon counting animation, Poisson histogram, and SNR equation."""

        def construct(self) -> None:
            self.add_progress(9, TOTAL_SLIDES)
            self.add_chapter_header(
                "Camera Measurement Model",
                "Poisson photon counting on pixel arrays",
                accent_color=THEME.accent_instrument,
            )
            self.add_citations("[5][6][7]")

            # --- Scene A: Animated photon detection ---
            detector = DetectorGrid(rows=8, cols=8, pixel_size=0.28)
            detector.shift(LEFT * 3.0 + DOWN * 0.1)
            det_label = Text("Camera sensor", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.detector_gray)
            det_label.next_to(detector, DOWN, buff=0.2)

            self.play(FadeIn(detector), FadeIn(det_label), run_time=0.6)

            # Rain photons onto random pixels
            rng = np.random.default_rng(8)
            pixel_counts = np.zeros((8, 8), dtype=int)

            for batch in range(4):
                n_photons = rng.integers(5, 10)
                photon_anims = []
                for _ in range(n_photons):
                    r, c = int(rng.integers(1, 7)), int(rng.integers(1, 7))
                    pixel_counts[r, c] += 1

                    start_pt = detector.pixels[r][c].get_center() + UP * 2.5 + np.array([rng.uniform(-0.3, 0.3), 0, 0])
                    photon = Dot(point=start_pt, radius=0.03, color=THEME.photon_gold, fill_opacity=0.9)
                    target = detector.pixels[r][c].get_center()

                    photon_anims.append(photon.animate(run_time=0.4).move_to(target).set_opacity(0))
                    self.add(photon)

                self.play(*photon_anims, run_time=0.5)

                # Update pixel brightness
                for r2 in range(8):
                    for c2 in range(8):
                        if pixel_counts[r2, c2] > 0:
                            brightness = min(pixel_counts[r2, c2] / 8.0, 1.0)
                            detector.pixels[r2][c2].set_fill(
                                color=THEME.photon_gold,
                                opacity=0.15 + 0.75 * brightness,
                            )

            self.next_slide()

            # --- Scene B: Poisson distribution ---
            poisson_eq = MathTex(
                r"Y_{ij}",
                r"\sim",
                r"\text{Poisson}(",
                r"S_{ij}",
                r"+",
                r"B_{ij}",
                r")",
                font_size=40, color=THEME.text_primary,
            ).shift(RIGHT * 3.0 + UP * 2.0)

            # Color-code signal vs background
            poisson_eq[3].set_color(THEME.emission_green)
            poisson_eq[5].set_color(THEME.accent_alert)

            self.play(Write(poisson_eq), run_time=1.0)

            sig_label = Text("signal", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.emission_green)
            sig_label.next_to(poisson_eq[3], DOWN, buff=0.15)
            bg_label = Text("background", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_alert)
            bg_label.next_to(poisson_eq[5], DOWN, buff=0.15)
            self.play(FadeIn(sig_label), FadeIn(bg_label), run_time=0.5)

            # Narrator: explain Poisson model
            narrator_poisson = self.add_narrator_note(
                "Each pixel independently draws from a Poisson distribution.",
                position="bottom",
            )

            # Build histogram bars
            hist_axes = Axes(
                x_range=[0, 12, 2],
                y_range=[0, 0.3, 0.1],
                x_length=4.5,
                y_length=2.2,
                axis_config={"color": THEME.text_muted, "include_ticks": True},
            ).shift(RIGHT * 3.0 + DOWN * 1.0)

            hist_x_label = Text("k (photons)", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_muted)
            hist_x_label.next_to(hist_axes.x_axis, DOWN, buff=0.15)
            hist_y_label = Text("P(k)", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_muted)
            hist_y_label.next_to(hist_axes.y_axis, UP, buff=0.1)

            # Poisson PMF for λ=5
            lam = 5.0
            ks = np.arange(0, 12)
            from math import factorial
            pmf = np.array([lam**k * np.exp(-lam) / factorial(k) for k in ks])

            bars = VGroup()
            for i, (k, p) in enumerate(zip(ks, pmf)):
                bar = Rectangle(
                    width=0.32, height=max(0.01, p * 7.0),
                    fill_color=THEME.accent_optics, fill_opacity=0.75,
                    stroke_width=0.5, stroke_color=THEME.text_muted,
                )
                bar_pos = hist_axes.c2p(k + 0.5, 0) + UP * bar.height / 2
                bar.move_to(bar_pos)
                bars.add(bar)

            self.play(Create(hist_axes), FadeIn(hist_x_label), FadeIn(hist_y_label), run_time=0.7)
            self.play(
                LaggedStart(*[GrowFromEdge(bar, DOWN) for bar in bars], lag_ratio=0.08),
                run_time=1.2,
            )

            # Overlay PMF curve
            from math import factorial as _factorial
            pmf_curve = hist_axes.plot(
                lambda x: max(0, lam**x * np.exp(-lam) / max(1, _factorial(int(round(max(0, min(x, 11))))))),
                x_range=[0, 11, 0.1],
                color=THEME.psf_cyan,
                stroke_width=2.5,
            )
            self.play(Create(pmf_curve), run_time=0.8)

            # Histogram peak annotation
            peak_label = Text(
                "Peak at λ = 5 photons/pixel",
                font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.psf_cyan,
            )
            peak_label.next_to(bars[5], UP, buff=0.2).shift(RIGHT * 0.3)
            peak_arrow = Arrow(
                peak_label.get_bottom(), bars[5].get_top() + UP * 0.05,
                buff=0.05, stroke_width=2, color=THEME.psf_cyan,
                max_tip_length_to_length_ratio=0.2,
            )
            self.play(FadeIn(peak_label), Create(peak_arrow), run_time=0.5)

            self.play(FadeOut(narrator_poisson), run_time=0.2)
            self.next_slide()

            # --- Scene C: SNR equation ---
            snr_eq = MathTex(
                r"\text{SNR}",
                r"=",
                r"\frac{N_{\text{signal} } }{\sqrt{N_{\text{signal} } + N_{\text{bg} } } }",
                font_size=42, color=THEME.text_primary,
            ).to_edge(DOWN, buff=1.5)

            snr_box = EquationBox(snr_eq, label="Signal-to-noise", color=THEME.accent_instrument)
            self.play(Write(snr_eq), run_time=0.8)
            self.play(Create(snr_box.box), FadeIn(snr_box.label_mob), run_time=0.6)

            takeaway = Text(
                "More photons → better SNR → better localisation precision",
                font=FONT_SANS,
                font_size=CAPTION_SIZE,
                color=THEME.text_muted,
            ).to_edge(DOWN, buff=0.6)
            self.play(FadeIn(takeaway), run_time=0.5)
            self.wait(0.5)
