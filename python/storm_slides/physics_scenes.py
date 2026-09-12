"""Physics-focused slides — 3Blue1Brown quality.

Slides:
  1. OpeningRoadmapSlide   — animated pipeline with styled icons
  2. MaxwellToWaveSlide    — Maxwell curls → wave equation
  3. HelmholtzWaveSlide    — Helmholtz eqn + travelling wave
  4. PupilFunctionSlide    — wavefronts + frequency-domain pupil
  5. PSFResolutionSlide    — PSF broadening + Abbe limit
  6. TemporalSparsitySlide — blinking fluorophores → sparse fitting demo
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
        CurvedArrow,
        Circle,
        Dot,
        Ellipse,
        FadeIn,
        FadeOut,
        Flash,
        GrowFromCenter,
        Indicate,
        LaggedStart,
        Line,
        ManimColor,
        MathTex,
        Rectangle,
        RoundedRectangle,
        SurroundingRectangle,
        Text,
        Transform,
        TransformMatchingTex,
        ReplacementTransform,
        VGroup,
        VMobject,
        Write,
        Create,
        ValueTracker,
        rate_functions,
        always_redraw,
    )
    from storm_slides.custom_mobjects import (
        EquationBox,
        Fluorophore,
        GlowDot,
        StageIcon,
    )
    from storm_slides.custom_animations import (
        propagating_wave,
        wave_line,
        wavefront_rings,
    )


# ======================================================================
# Fallback stubs (non-Manim environments)
# ======================================================================

if not MANIM_AVAILABLE:

    class OpeningRoadmapSlide(BaseStormSlide):
        pass

    class MaxwellToWaveSlide(BaseStormSlide):
        pass

    class HelmholtzWaveSlide(BaseStormSlide):
        pass

    class PupilFunctionSlide(BaseStormSlide):
        pass

    class PSFResolutionSlide(BaseStormSlide):
        pass

    class TemporalSparsitySlide(BaseStormSlide):
        pass

else:

    # ==================================================================
    # 1.  Opening Roadmap  (1 : 30)
    # ==================================================================

    class OpeningRoadmapSlide(BaseStormSlide):
        """Animated five-stage pipeline with styled icons and travelling highlight."""

        def construct(self) -> None:
            self.add_progress(1, TOTAL_SLIDES)
            self.add_chapter_header(
                "STORM End-to-End Pipeline",
                "From electromagnetic waves to nanometre-resolution maps",
                accent_color=THEME.accent_physics,
            )
            self.add_citations("[1][3][10]")

            # --- Build five stage icons ---
            icons_data = [
                ("λ",  "EM Waves",      THEME.accent_physics,     "Maxwell → Helmholtz"),
                ("◎",  "Fourier Optics", THEME.accent_optics,     "NA, PSF & Abbe limit"),
                ("⬡",  "Microscope",     THEME.accent_instrument, "Laser, dichroic, camera"),
                ("⊕",  "Algorithm",      THEME.accent_algorithm,  "Gaussian MLE fitting"),
                ("▦",  "Reconstruction", THEME.recon_teal,        "Super-res map assembly"),
            ]
            icons = VGroup()
            for sym, label, color, _sub in icons_data:
                icon = StageIcon(sym, label, color)
                icons.add(icon)
            icons.arrange(RIGHT, buff=1.1).shift(DOWN * 0.3)

            # Grow icons one-by-one
            self.play(
                LaggedStart(
                    *[GrowFromCenter(ic) for ic in icons],
                    lag_ratio=0.18,
                ),
                run_time=2.2,
            )

            # Add brief subtitle under each icon
            subtitles = VGroup()
            for ic, (_s, _l, color, sub_text) in zip(icons, icons_data):
                sub = Text(
                    sub_text, font=FONT_SANS,
                    font_size=LABEL_SIZE - 2, color=color,
                )
                sub.next_to(ic, DOWN, buff=0.15)
                subtitles.add(sub)
            self.play(FadeIn(subtitles), run_time=0.6)
            self.next_slide()

            # Connecting arrows with a slight curve
            arrows = VGroup()
            for i in range(len(icons) - 1):
                arr = Arrow(
                    icons[i].get_right(),
                    icons[i + 1].get_left(),
                    buff=0.15,
                    stroke_width=3,
                    color=THEME.text_muted,
                    max_tip_length_to_length_ratio=0.15,
                )
                arrows.add(arr)
            self.play(
                LaggedStart(*[Create(a) for a in arrows], lag_ratio=0.15),
                run_time=1.4,
            )

            # Flash each icon sequentially
            for ic in icons:
                self.play(
                    Indicate(ic.bg, color=ic.bg.get_stroke_color(), scale_factor=1.15),
                    run_time=0.35,
                )

            # Goal statement
            goal = Text(
                "Goal: show why sparse blinking + statistical fitting\n"
                "breaks the diffraction limit.",
                font=FONT_SANS,
                font_size=BODY_SIZE - 4,
                color=THEME.text_primary,
                line_spacing=0.9,
            ).to_edge(DOWN, buff=1.2)
            self.play(FadeIn(goal, shift=UP * 0.2), run_time=0.8)
            self.wait(0.5)

    # ==================================================================
    # 2.  Maxwell → Wave Equation  (Scenes A + B only)
    # ==================================================================

    class MaxwellToWaveSlide(BaseStormSlide):
        """Maxwell curls → constitutive relations → wave equation with curvature highlights."""

        def construct(self) -> None:
            self.add_progress(2, TOTAL_SLIDES)
            self.add_chapter_header(
                "From Maxwell to the Wave Equation",
                "Dielectric medium  ·  monochromatic fields",
                accent_color=THEME.accent_physics,
            )
            self.add_citations("[10]")

            # --- Scene A: Maxwell's curl equations ---
            curl_e = MathTex(
                r"\nabla \times \mathbf{E}",
                r"=",
                r"-\frac{\partial \mathbf{B} }{\partial t}",
                font_size=40, color=THEME.text_primary,
            )
            curl_h = MathTex(
                r"\nabla \times \mathbf{H}",
                r"=",
                r"\frac{\partial \mathbf{D} }{\partial t}",
                font_size=40, color=THEME.text_primary,
            )
            maxwell_eqs = VGroup(curl_e, curl_h).arrange(DOWN, buff=0.5).shift(UP * 0.8)

            self.play(Write(curl_e), run_time=1.2)
            self.play(Write(curl_h), run_time=1.0)

            # Constitutive relations
            constitutive = MathTex(
                r"\mathbf{D} = \varepsilon \mathbf{E}",
                r",\quad",
                r"\mathbf{B} = \mu \mathbf{H}",
                r",\quad",
                r"\nabla \cdot \mathbf{D} = 0",
                r",\quad",
                r"\nabla \cdot \mathbf{B} = 0",
                font_size=32, color=THEME.text_muted,
            ).next_to(maxwell_eqs, DOWN, buff=0.6)
            self.play(FadeIn(constitutive, shift=UP * 0.15), run_time=0.8)
            self.next_slide()

            # --- Scene B: Assumptions + simplification ---
            narrator_ab = self.add_narrator_note(
                "We combine these equations assuming a linear, source-free, harmonic medium…",
                position="bottom",
            )

            assumptions = Text(
                "Assumptions:  linear medium  ·  source-free  ·  harmonic time  e^{-iωt}",
                font=FONT_SANS,
                font_size=CAPTION_SIZE - 2,
                color=THEME.accent_optics,
            ).to_edge(DOWN, buff=1.6)
            self.play(FadeOut(narrator_ab), run_time=0.25)
            self.play(FadeIn(assumptions, shift=UP * 0.1), run_time=0.7)

            # Morph to wave equation
            wave_eq = MathTex(
                r"\nabla^{2} \mathbf{E}",
                r"- \mu \varepsilon \,",
                r"\frac{\partial^{2} \mathbf{E} }{\partial t^{2} }",
                r"= 0",
                font_size=42,
                color=THEME.text_primary,
            ).shift(UP * 0.8)

            self.play(
                FadeOut(maxwell_eqs),
                FadeOut(constitutive),
                run_time=0.5,
            )
            self.play(Write(wave_eq), run_time=1.2)

            # Highlight key terms
            box_laplacian = SurroundingRectangle(wave_eq[0], color=THEME.accent_physics, buff=0.1)
            box_time = SurroundingRectangle(wave_eq[2], color=THEME.accent_optics, buff=0.1)
            self.play(Create(box_laplacian), run_time=0.4)
            self.play(Create(box_time), run_time=0.4)

            label_spatial = Text("spatial curvature", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_physics)
            label_spatial.next_to(box_laplacian, UP, buff=0.12)
            label_temporal = Text("temporal curvature", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_optics)
            label_temporal.next_to(box_time, DOWN, buff=0.12)
            self.play(FadeIn(label_spatial), FadeIn(label_temporal), run_time=0.5)
            self.wait(0.5)

    # ==================================================================
    # 3.  Helmholtz & Travelling Wave  (old Scenes C + D)
    # ==================================================================

    class HelmholtzWaveSlide(BaseStormSlide):
        """Helmholtz equation + wavenumber definition + travelling wave animation."""

        def construct(self) -> None:
            self.add_progress(3, TOTAL_SLIDES)
            self.add_chapter_header(
                "Helmholtz & Wave Propagation",
                "Monochromatic solutions of the wave equation",
                accent_color=THEME.accent_physics,
            )
            self.add_citations("[10]")

            # --- Scene C: Helmholtz equation ---
            narrator_c = self.add_narrator_note(
                "The Helmholtz equation governs all monochromatic wave propagation.",
                position="bottom",
            )

            helmholtz_lhs = MathTex(
                r"\bigl(",
                r"\nabla^{2}",
                r"+",
                r"k^{2}",
                r"\bigr)",
                r"U(\mathbf{r})",
                r"= 0",
                font_size=46,
                color=THEME.text_primary,
            ).shift(UP * 0.5)

            wavenumber = MathTex(
                r"k = \frac{2\pi n}{\lambda_0} = \frac{n\omega}{c}",
                font_size=36,
                color=THEME.text_primary,
            ).next_to(helmholtz_lhs, DOWN, buff=0.55)

            self.play(Write(helmholtz_lhs), run_time=1.2)
            self.play(Write(wavenumber), run_time=0.8)

            # Equation box highlight
            eq_box = EquationBox(
                helmholtz_lhs, label="Helmholtz equation", color=THEME.accent_physics,
            )
            self.play(Create(eq_box.box), FadeIn(eq_box.label_mob), run_time=0.8)
            self.next_slide()

            # --- Scene D: Animated travelling wave ---
            self.play(
                FadeOut(eq_box), FadeOut(helmholtz_lhs), FadeOut(wavenumber),
                FadeOut(narrator_c),
                run_time=0.5,
            )

            transition_txt = Text(
                "A monochromatic plane wave — the fundamental solution",
                font=FONT_SANS,
                font_size=BODY_SIZE - 4,
                color=THEME.text_muted,
            ).to_edge(UP, buff=2.4)
            self.play(FadeIn(transition_txt), run_time=0.5)

            # Propagating sine wave
            wave = propagating_wave(
                self,
                x_range=(-7, 7),
                y_center=0,
                wavelength=2.0,
                amplitude=0.7,
                color=THEME.wave_blue,
                run_time=4.0,
            )

            # Wave equation annotation
            wave_label = MathTex(
                r"E(x,t) = E_0 \sin(kx - \omega t)",
                font_size=30, color=THEME.wave_blue,
            ).shift(DOWN * 1.5)
            self.play(FadeIn(wave_label, shift=UP * 0.1), run_time=0.5)

            outro = Text(
                "Now we enter Fourier optics…",
                font=FONT_SANS,
                font_size=BODY_SIZE - 2,
                color=THEME.accent_optics,
            ).to_edge(DOWN, buff=1.0)
            self.play(FadeIn(outro, shift=UP * 0.15), run_time=0.6)
            self.wait(0.5)

    # ==================================================================
    # 4.  Pupil Function  (old Fourier Scenes A + B)
    # ==================================================================

    class PupilFunctionSlide(BaseStormSlide):
        """Point-source wavefronts, frequency-domain pupil, blocked dots."""

        def construct(self) -> None:
            self.add_progress(4, TOTAL_SLIDES)
            self.add_chapter_header(
                "Fourier Optics & the Pupil Function",
                "Finite NA truncates spatial frequencies",
                accent_color=THEME.accent_optics,
            )
            self.add_citations("[10]")

            # ---- Scene A: Point source → wavefronts → lens ----
            source_label = Text("point source", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_primary)
            source_label.move_to(LEFT * 4.5 + DOWN * 1.8)
            self.play(FadeIn(source_label), run_time=0.4)

            # Expanding wavefront rings
            wavefront_rings(
                self,
                center=LEFT * 4.5 + DOWN * 0.5,
                n_rings=5,
                max_radius=2.0,
                color=THEME.wave_blue,
                run_time=2.0,
            )
            self.next_slide()

            # ---- Scene B: Frequency-domain picture ----
            self.fade_out_scene()

            freq_title = Text(
                "Spatial frequency domain (kₓ, k_y)",
                font=FONT_SANS,
                font_size=BODY_SIZE - 2,
                color=THEME.text_primary,
            ).to_edge(UP, buff=2.2)
            self.play(FadeIn(freq_title), run_time=0.5)

            # Pupil circle
            pupil = Circle(
                radius=1.6,
                color=THEME.accent_optics,
                stroke_width=4.5,
                fill_color=THEME.accent_optics,
                fill_opacity=0.06,
            ).shift(LEFT * 3.0 + DOWN * 0.2)
            pupil_label = Text(
                "Pupil  |k⊥| ≤ k·NA",
                font=FONT_SANS,
                font_size=LABEL_SIZE,
                color=THEME.accent_optics,
            ).next_to(pupil, DOWN, buff=0.25)

            # Crosshairs
            kx_line = Line(LEFT * 1.7, RIGHT * 1.7, color=THEME.text_muted, stroke_width=1.5).move_to(pupil)
            ky_line = Line(DOWN * 1.7, UP * 1.7, color=THEME.text_muted, stroke_width=1.5).move_to(pupil)

            self.play(Create(pupil), run_time=0.8)
            self.play(Create(kx_line), Create(ky_line), FadeIn(pupil_label), run_time=0.7)

            # Dots outside getting blocked
            rng = np.random.default_rng(7)
            blocked_dots = VGroup()
            for _ in range(15):
                angle = rng.uniform(0, TAU)
                r = rng.uniform(1.8, 2.6)
                d = Dot(
                    point=pupil.get_center() + np.array([r * np.cos(angle), r * np.sin(angle), 0]),
                    radius=0.05,
                    color=THEME.accent_alert,
                    fill_opacity=0.7,
                )
                blocked_dots.add(d)

            blocked_label = Text("blocked", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_alert)
            blocked_label.next_to(pupil, RIGHT, buff=1.5)

            self.play(FadeIn(blocked_dots), FadeIn(blocked_label), run_time=0.8)
            note = MathTex(
                r"\text{Only } |k_\perp| \le k_0 \cdot \text{NA} \text{ passes}",
                font_size=30, color=THEME.text_primary,
            ).shift(RIGHT * 3.0 + UP * 0.5)
            self.play(Write(note), run_time=0.8)
            self.wait(0.5)

    # ==================================================================
    # 5.  PSF & the Diffraction Limit  (old Fourier Scenes C + D)
    # ==================================================================

    class PSFResolutionSlide(BaseStormSlide):
        """PSF broadening with NA ValueTracker, resolution equation + numerical."""

        def construct(self) -> None:
            self.add_progress(5, TOTAL_SLIDES)
            self.add_chapter_header(
                "PSF & the Diffraction Limit",
                "Finite NA broadens the point spread function",
                accent_color=THEME.accent_optics,
            )
            self.add_citations("[10]")

            # ---- Scene C: PSF broadening with NA ValueTracker ----
            psf_title = Text(
                "Point Spread Function widens as NA drops",
                font=FONT_SANS,
                font_size=BODY_SIZE - 2,
                color=THEME.text_primary,
            ).to_edge(UP, buff=2.2)
            self.play(FadeIn(psf_title), run_time=0.4)

            axes = Axes(
                x_range=[-4, 4, 1],
                y_range=[0, 1.15, 0.2],
                x_length=6.5,
                y_length=3.0,
                axis_config={"color": THEME.text_muted, "include_ticks": False},
            ).shift(DOWN * 0.3)
            axes_labels = VGroup(
                Text("x", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_muted).next_to(axes.x_axis, RIGHT),
                Text("I(x)", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_muted).next_to(axes.y_axis, UP),
            )
            self.play(Create(axes), FadeIn(axes_labels), run_time=0.8)

            na_tracker = ValueTracker(1.4)

            na_label = always_redraw(
                lambda: Text(
                    f"NA = {na_tracker.get_value():.2f}",
                    font=FONT_SANS,
                    font_size=BODY_SIZE - 4,
                    color=THEME.accent_optics,
                ).to_edge(RIGHT, buff=1.0).shift(UP * 1.5)
            )

            def psf_curve():
                na = na_tracker.get_value()
                sigma = 0.6 / max(na, 0.3)
                curve = axes.plot(
                    lambda x: np.exp(-(x ** 2) / (2 * sigma ** 2)),
                    color=THEME.psf_cyan,
                    stroke_width=4,
                )
                return curve

            dynamic_psf = always_redraw(psf_curve)
            self.play(FadeIn(na_label), Create(dynamic_psf), run_time=0.8)

            # Step-by-step annotation during PSF sweep
            psf_note = self.add_narrator_note(
                "Lower NA → wider PSF → worse resolution",
                color=THEME.accent_optics, position="bottom",
            )

            # Sweep NA down
            self.play(na_tracker.animate.set_value(0.5), run_time=3.0, rate_func=rate_functions.smooth)
            # Sweep back up
            self.play(na_tracker.animate.set_value(1.4), run_time=2.0, rate_func=rate_functions.smooth)
            self.play(FadeOut(psf_note), run_time=0.3)
            self.next_slide()

            # ---- Scene D: Resolution equation ----
            resolution_eq = MathTex(
                r"d",
                r"\approx",
                r"\frac{\lambda}{2 \cdot \text{NA} }",
                font_size=48,
                color=THEME.text_primary,
            ).shift(DOWN * 2.5 + LEFT * 1.5)
            self.play(Write(resolution_eq), run_time=0.8)

            # Plug in numbers
            numerical = MathTex(
                r"\approx",
                r"\frac{680\,\text{nm} }{2 \times 1.4}",
                r"\approx 243\,\text{nm}",
                font_size=36,
                color=THEME.accent_optics,
            ).next_to(resolution_eq, RIGHT, buff=0.5)
            self.play(FadeIn(numerical, shift=LEFT * 0.2), run_time=0.8)

            eq_box = EquationBox(
                VGroup(resolution_eq, numerical),
                label="Diffraction limit",
                color=THEME.accent_optics,
            )
            self.play(Create(eq_box.box), FadeIn(eq_box.label_mob), run_time=0.7)

            # Physical meaning note
            meaning = Text(
                "Two objects closer than ~243 nm appear as one blob",
                font=FONT_SANS, font_size=CAPTION_SIZE - 2,
                color=THEME.text_muted, slant="ITALIC",
            ).to_edge(DOWN, buff=0.75)
            self.play(FadeIn(meaning, shift=UP * 0.1), run_time=0.5)
            self.wait(0.5)

    # ==================================================================
    # 6.  Temporal Sparsity  (2 : 00)
    # ==================================================================

    class TemporalSparsitySlide(BaseStormSlide):
        """Dense overlap vs sparse blinking — animated fluorophore field."""

        def construct(self) -> None:
            self.add_progress(6, TOTAL_SLIDES)
            self.add_chapter_header(
                "Temporal Sparsity Enables STORM",
                "Few emitters per frame → single-PSF fitting",
                accent_color=THEME.accent_algorithm,
            )
            self.add_citations("[1][2]")

            # --- Scene A: Conventional — all emitters on ---
            narrator_conv = self.add_narrator_note(
                "In conventional fluorescence, all molecules emit simultaneously.",
                position="bottom",
            )

            conv_label = Text(
                "Conventional fluorescence — all emitters ON",
                font=FONT_SANS,
                font_size=BODY_SIZE - 4,
                color=THEME.accent_alert,
            ).to_edge(UP, buff=2.2)
            self.play(FadeIn(conv_label), run_time=0.4)

            # Field of fluorophores (all on)
            rng = np.random.default_rng(12)
            n_emitters = 40
            positions = rng.uniform(-4, 4, size=(n_emitters, 2))
            all_fluors = VGroup()
            for pos in positions:
                f = GlowDot(
                    point=np.array([pos[0], pos[1] - 0.3, 0]),
                    color=THEME.emission_green,
                    radius=0.05,
                    glow_radius=0.35,
                )
                all_fluors.add(f)

            self.play(
                LaggedStart(*[FadeIn(f) for f in all_fluors], lag_ratio=0.02),
                run_time=1.5,
            )

            overlap_note = Text(
                "PSFs overlap → can't tell emitters apart!",
                font=FONT_SANS,
                font_size=CAPTION_SIZE,
                color=THEME.accent_alert,
            ).to_edge(DOWN, buff=1.0)
            self.play(FadeIn(overlap_note), run_time=0.5)
            self.next_slide()

            # --- Scene B: STORM — sparse activation ---
            self.play(FadeOut(all_fluors), FadeOut(conv_label), FadeOut(overlap_note), FadeOut(narrator_conv), run_time=0.5)

            storm_label = Text(
                "STORM — only 3–5 emitters ON per frame",
                font=FONT_SANS,
                font_size=BODY_SIZE - 4,
                color=THEME.accent_algorithm,
            ).to_edge(UP, buff=2.2)
            self.play(FadeIn(storm_label), run_time=0.4)

            # Narrator note for STORM frames
            narrator_storm = self.add_narrator_note(
                "Each frame: activate random subset → fit each isolated PSF → record position",
                position="bottom",
            )

            # Show several "frames" with sparse activation
            frame_counter = Text("Frame 1", font=FONT_SANS, font_size=CAPTION_SIZE, color=THEME.text_muted)
            frame_counter.to_corner(DOWN + RIGHT, buff=0.5).shift(UP * 1.2)
            self.play(FadeIn(frame_counter), run_time=0.3)

            accumulated_dots = VGroup()
            for frame_idx in range(6):
                # Pick 3-4 random emitters
                n_on = rng.integers(3, 5)
                chosen = rng.choice(n_emitters, size=n_on, replace=False)

                frame_glows = VGroup()
                fitting_xs = VGroup()
                for idx in chosen:
                    pos = positions[idx]
                    glow = GlowDot(
                        point=np.array([pos[0], pos[1] - 0.3, 0]),
                        color=THEME.emission_green,
                        radius=0.04,
                        glow_radius=0.28,
                    )
                    frame_glows.add(glow)

                    # Crosshair at fitted position
                    cross_h = Line(LEFT * 0.12, RIGHT * 0.12, color=THEME.accent_algorithm, stroke_width=2)
                    cross_v = Line(DOWN * 0.12, UP * 0.12, color=THEME.accent_algorithm, stroke_width=2)
                    cross = VGroup(cross_h, cross_v).move_to(glow)
                    fitting_xs.add(cross)

                    # Small dot for accumulated reconstruction
                    acc_dot = Dot(
                        point=np.array([pos[0], pos[1] - 0.3, 0]),
                        radius=0.03,
                        color=THEME.recon_teal,
                        fill_opacity=0.8,
                    )
                    accumulated_dots.add(acc_dot)

                # Update frame counter
                new_counter = Text(
                    f"Frame {frame_idx + 1}",
                    font=FONT_SANS,
                    font_size=CAPTION_SIZE,
                    color=THEME.text_muted,
                )
                new_counter.move_to(frame_counter)

                self.play(
                    FadeIn(frame_glows),
                    Transform(frame_counter, new_counter),
                    run_time=0.4,
                )
                self.play(
                    LaggedStart(*[Create(x) for x in fitting_xs], lag_ratio=0.1),
                    run_time=0.35,
                )
                # Add localised dots
                self.play(
                    *[FadeIn(d) for d in accumulated_dots[-n_on:]],
                    run_time=0.2,
                )
                self.play(FadeOut(frame_glows), FadeOut(fitting_xs), run_time=0.25)

            self.play(FadeOut(narrator_storm), run_time=0.25)
            result_note = Text(
                "Accumulate localisations → super-resolution map!",
                font=FONT_SANS,
                font_size=BODY_SIZE - 4,
                color=THEME.recon_teal,
            ).to_edge(DOWN, buff=1.0)
            self.play(FadeIn(result_note, shift=UP * 0.15), run_time=0.6)
            self.wait(0.5)
