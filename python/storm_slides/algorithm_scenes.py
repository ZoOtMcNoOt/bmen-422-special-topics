"""Algorithm, simulation, and wrap-up slides — 3Blue1Brown quality.

Slides:
  10.  LocalizationPipelineSlide  — 4-box pipeline overview
  11.  GaussianFittingSlide       — MLE fitting + precision equation
  12.  PhotonBudgetSweepSlide     — photon budget bar chart
  13.  DensityDriftSweepSlide     — density + drift bar charts + summary
  14.  ThreeDExtensionSlide       — astigmatic PSF ellipse morphing
  15.  BiologicalExamplesSlide    — diffraction-limited vs STORM side-by-side
  16.  LimitationsFrontierSlide   — animated vignettes
  17.  ConclusionChecklistSlide   — animated checklist with check marks
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
from storm_slides.models import DetectionThreshold, SimulationParams
from storm_slides.scene_base import MANIM_AVAILABLE, BaseStormSlide
from storm_slides.simulator import (
    quick_sim,
    run_parameter_sweep,
    QUICK_SIM_PARAMS,
)
from storm_slides.utils_plot import gaussian_2d, normalize_array

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
        Cross,
        DashedLine,
        Dot,
        Ellipse,
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
        always_redraw,
        rate_functions,
    )
    from storm_slides.custom_mobjects import (
        DetectorGrid,
        EquationBox,
        GlowDot,
    )
    from storm_slides.custom_animations import (
        glow_pulse,
        highlight_box,
    )


# ======================================================================
# Fallback stubs
# ======================================================================

if not MANIM_AVAILABLE:

    class LocalizationPipelineSlide(BaseStormSlide):
        pass

    class GaussianFittingSlide(BaseStormSlide):
        pass

    class PhotonBudgetSweepSlide(BaseStormSlide):
        pass

    class DensityDriftSweepSlide(BaseStormSlide):
        pass

    class ThreeDExtensionSlide(BaseStormSlide):
        pass

    class BiologicalExamplesSlide(BaseStormSlide):
        pass

    class LimitationsFrontierSlide(BaseStormSlide):
        pass

    class ConclusionChecklistSlide(BaseStormSlide):
        pass

else:

    # ==================================================================
    # 10.  Localization Pipeline  (Scene A only)
    # ==================================================================

    class LocalizationPipelineSlide(BaseStormSlide):
        """4-stage pipeline walkthrough."""

        def construct(self) -> None:
            self.add_progress(10, TOTAL_SLIDES)
            self.add_chapter_header(
                "Localization Pipeline",
                "From raw frame to super-resolved coordinates",
                accent_color=THEME.accent_algorithm,
            )
            self.add_citations("[5][6][7]")

            # --- Scene A: Pipeline diagram ---
            stage_colors = [
                THEME.accent_physics,
                THEME.accent_optics,
                THEME.accent_algorithm,
                THEME.recon_teal,
            ]
            stage_titles = [
                "1. Detect\ncandidate spots",
                "2. Fit Gaussian\nMLE",
                "3. Estimate\nprecision σ",
                "4. Accumulate\nsuper-res map",
            ]
            stage_descs = [
                "Threshold local maxima\nabove background",
                "Maximum-likelihood\n2D Gaussian fit",
                "σ_loc from photon\ncount & background",
                "Overlay all fitted\npositions on grid",
            ]

            boxes = VGroup()
            box_labels = VGroup()
            box_descs = VGroup()
            y_row = UP * 0.3
            for i, (color, title) in enumerate(zip(stage_colors, stage_titles)):
                box = RoundedRectangle(
                    corner_radius=0.15, width=2.6, height=1.4,
                    color=color, fill_opacity=0.12, stroke_width=2.5,
                ).move_to(LEFT * 4.5 + RIGHT * 3.2 * i + y_row)
                label = Text(title, font=FONT_SANS, font_size=LABEL_SIZE + 2, color=color)
                label.move_to(box)
                boxes.add(box)
                box_labels.add(label)

                desc = Text(
                    stage_descs[i], font=FONT_SANS,
                    font_size=LABEL_SIZE - 3, color=THEME.text_muted,
                    line_spacing=0.8,
                )
                desc.next_to(box, DOWN, buff=0.12)
                box_descs.add(desc)

            arrows = VGroup()
            for i in range(3):
                arr = Arrow(
                    boxes[i].get_right(), boxes[i + 1].get_left(),
                    buff=0.1, stroke_width=3, color=THEME.text_muted,
                    max_tip_length_to_length_ratio=0.2,
                )
                arrows.add(arr)

            # Animate sequentially with descriptions
            for i in range(4):
                anims = [GrowFromCenter(boxes[i]), FadeIn(box_labels[i]), FadeIn(box_descs[i])]
                if i > 0:
                    anims.append(Create(arrows[i - 1]))
                self.play(*anims, run_time=0.55)

            self.wait(0.3)

    # ==================================================================
    # 11.  Gaussian MLE Fitting  (old Scene B from LocalizationAlgorithmSlide)
    # ==================================================================

    class GaussianFittingSlide(BaseStormSlide):
        """Pixel patch grid, fit arrow, Gaussian contour + crosshairs,
        σ_PSF/center labels, precision equation + key insight note."""

        def construct(self) -> None:
            self.add_progress(11, TOTAL_SLIDES)
            self.add_chapter_header(
                "Gaussian MLE Fitting",
                "From raw pixel patch to nanometre coordinates",
                accent_color=THEME.accent_algorithm,
            )
            self.add_citations("[5][6][7]")

            fit_title = Text(
                "Gaussian MLE Fitting",
                font=FONT_SANS, font_size=BODY_SIZE, color=THEME.text_primary,
            ).to_edge(UP, buff=2.2)
            self.play(FadeIn(fit_title), run_time=0.3)

            # Simulated pixel patch
            rng = np.random.default_rng(42)
            patch_size = 7
            psf = gaussian_2d(patch_size, sigma=1.3)
            photon_counts = rng.poisson(psf * 600 + 10)

            # Draw as colored grid
            grid_group = VGroup()
            max_val = float(photon_counts.max())
            cell_size = 0.5
            for r in range(patch_size):
                for c in range(patch_size):
                    val = photon_counts[r, c] / max_val
                    cell = Square(side_length=cell_size, stroke_width=0.5, stroke_color=THEME.text_muted)
                    cell.set_fill(THEME.photon_gold, opacity=0.15 + 0.8 * val)
                    cell.move_to(
                        LEFT * 3 + np.array([(c - patch_size / 2) * cell_size, (patch_size / 2 - r) * cell_size, 0])
                    )
                    grid_group.add(cell)
            raw_label = Text("Raw pixel patch", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_muted)
            raw_label.next_to(grid_group, DOWN, buff=0.2)
            self.play(FadeIn(grid_group), FadeIn(raw_label), run_time=0.6)

            # Arrow to fitted result
            fit_arrow = Arrow(LEFT * 1.0, RIGHT * 0.5, buff=0.1, stroke_width=3, color=THEME.text_muted)
            self.play(Create(fit_arrow), run_time=0.3)

            # Show fitted Gaussian contour overlay
            fit_center = RIGHT * 3
            fit_crosshair_h = Line(fit_center + LEFT * 0.5, fit_center + RIGHT * 0.5, color=THEME.accent_algorithm, stroke_width=2)
            fit_crosshair_v = Line(fit_center + DOWN * 0.5, fit_center + UP * 0.5, color=THEME.accent_algorithm, stroke_width=2)

            # Concentric gaussian rings
            contours = VGroup()
            for sigma_mult, opacity in [(0.5, 0.5), (1.0, 0.35), (1.5, 0.2), (2.0, 0.1)]:
                ring = Circle(
                    radius=sigma_mult * 0.5,
                    color=THEME.accent_algorithm,
                    stroke_width=1.5,
                    stroke_opacity=opacity,
                ).move_to(fit_center)
                contours.add(ring)

            fit_dot = Dot(point=fit_center, radius=0.05, color=THEME.accent_algorithm)
            fit_label_text = Text("Fitted position", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_algorithm)
            fit_label_text.next_to(contours, DOWN, buff=0.3)

            self.play(
                Create(fit_crosshair_h), Create(fit_crosshair_v),
                FadeIn(fit_dot),
                LaggedStart(*[Create(c) for c in contours], lag_ratio=0.15),
                run_time=1.0,
            )
            self.play(FadeIn(fit_label_text), run_time=0.3)

            # Annotation: σ_PSF ring and center label
            sigma_label = MathTex(
                r"\sigma_{\text{PSF}}",
                font_size=24, color=THEME.psf_cyan,
            ).next_to(contours[1], RIGHT, buff=0.1)
            center_label = MathTex(
                r"(x_0, y_0)",
                font_size=24, color=THEME.accent_algorithm,
            ).next_to(fit_dot, UP + RIGHT, buff=0.1)
            self.play(FadeIn(sigma_label), FadeIn(center_label), run_time=0.4)

            # --- Precision equation ---
            precision_eq = MathTex(
                r"\sigma_{ \text{loc} }",
                r"\approx",
                r"\frac{\sigma_{ \text{PSF} } }{\sqrt{N_\gamma} }",
                r"\sqrt{1 + \frac{b}{\mu} }",
                font_size=38, color=THEME.text_primary,
            ).to_edge(DOWN, buff=1.0)
            precision_eq[0].set_color(THEME.accent_algorithm)
            precision_eq[2].set_color(THEME.psf_cyan)
            precision_eq[3].set_color(THEME.accent_alert)

            prec_note = Text(
                "Collecting 400 photons → ~15 nm precision (10× below diffraction limit!)",
                font=FONT_SANS, font_size=CAPTION_SIZE, color=THEME.accent_algorithm,
            ).next_to(precision_eq, DOWN, buff=0.15)

            self.play(Write(precision_eq), run_time=1.0)
            self.play(FadeIn(prec_note), run_time=0.4)
            self.wait(0.3)

    # ==================================================================
    # 12.  Photon Budget Sweep  (first sweep from old SimulatorLabSlide)
    # ==================================================================

    class PhotonBudgetSweepSlide(BaseStormSlide):
        """Single photon-budget bar chart, centered for better visibility."""

        # Pre-computed sweep results
        _PHOTON_RMSE = [42.0, 24.5, 14.2]
        _PHOTON_LABELS = ["200", "400", "800"]

        def construct(self) -> None:
            self.add_progress(12, TOTAL_SLIDES)
            self.add_chapter_header(
                "Simulator: Photon Budget Sweep",
                "How photon count drives localisation precision",
                accent_color=THEME.recon_teal,
            )
            self.add_citations("[1][3][11]")

            color = THEME.accent_optics
            x_c = 0.0
            y_base = -1.0

            # Title
            chart_title = Text(
                "Photon Budget (γ/frame)",
                font=FONT_SANS, font_size=LABEL_SIZE + 2, color=color,
            )
            chart_title.move_to(np.array([x_c, 1.5, 0]))

            # Bars — wider since we have full width
            max_rmse = 45.0
            bar_width = 0.70
            bars = VGroup()
            value_labels = VGroup()
            x_labels_grp = VGroup()
            for i, (lbl, val) in enumerate(zip(self._PHOTON_LABELS, self._PHOTON_RMSE)):
                bar_h = val / max_rmse * 2.5
                bar = Rectangle(
                    width=bar_width, height=bar_h,
                    fill_color=color, fill_opacity=0.7,
                    stroke_width=0.5, stroke_color=THEME.text_muted,
                )
                bar_x = x_c + (i - 1) * 1.5
                bar.move_to(np.array([bar_x, y_base + bar_h / 2, 0]))
                bars.add(bar)

                vl = Text(f"{val:.1f}", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_primary)
                vl.next_to(bar, UP, buff=0.06)
                value_labels.add(vl)

                xl = Text(lbl, font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_muted)
                xl.next_to(bar, DOWN, buff=0.06)
                x_labels_grp.add(xl)

            y_label = Text("RMSE (nm)", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_muted)
            y_label.rotate(PI / 2)
            y_label.move_to(np.array([x_c - 2.0, y_base + 1.0, 0]))

            # Animate
            self.play(FadeIn(chart_title), FadeIn(y_label), run_time=0.3)
            self.play(
                LaggedStart(*[GrowFromEdge(b, DOWN) for b in bars], lag_ratio=0.12),
                run_time=0.8,
            )
            self.play(FadeIn(value_labels), FadeIn(x_labels_grp), run_time=0.3)

            # Photon insight
            insight_note = Text(
                "4× more photons ≈ halves localisation error",
                font=FONT_SANS, font_size=LABEL_SIZE - 1,
                color=THEME.text_muted, slant="ITALIC",
            ).to_edge(DOWN, buff=1.0)
            self.play(FadeIn(insight_note, shift=UP * 0.08), run_time=0.35)

            self.next_slide()

            # Conclusion note
            self.play(FadeOut(insight_note), run_time=0.2)
            conclusion = Text(
                "Photon budget is the dominant factor — optimise laser power & dye brightness first.",
                font=FONT_SANS,
                font_size=CAPTION_SIZE,
                color=THEME.text_muted,
                line_spacing=0.9,
            ).to_edge(DOWN, buff=0.6)
            self.play(FadeIn(conclusion, shift=UP * 0.1), run_time=0.6)
            self.wait(0.5)

    # ==================================================================
    # 13.  Density & Drift Sweeps  (sweeps 2+3 from old SimulatorLabSlide)
    # ==================================================================

    class DensityDriftSweepSlide(BaseStormSlide):
        """Side-by-side density and drift bar charts."""

        _DENSITY_RMSE = [11.5, 18.3, 35.7]
        _DENSITY_LABELS = ["20", "60", "120"]
        _DRIFT_RMSE = [14.0, 19.8, 31.4]
        _DRIFT_LABELS = ["0.0", "0.5", "2.0"]

        def construct(self) -> None:
            self.add_progress(13, TOTAL_SLIDES)
            self.add_chapter_header(
                "Simulator: Density & Drift Sweeps",
                "How emitter density and stage drift affect RMSE",
                accent_color=THEME.recon_teal,
            )
            self.add_citations("[1][3][11]")

            sweep_data = [
                ("Emitter Density (N)", self._DENSITY_LABELS, self._DENSITY_RMSE, THEME.accent_alert),
                ("Drift (nm/frame)", self._DRIFT_LABELS, self._DRIFT_RMSE, THEME.accent_algorithm),
            ]

            chart_groups = VGroup()
            x_centers = [-3.0, 3.0]

            for idx, (title, xlabels, rmse_vals, color) in enumerate(sweep_data):
                x_c = x_centers[idx]
                y_base = -1.0

                chart_title = Text(title, font=FONT_SANS, font_size=LABEL_SIZE + 2, color=color)
                chart_title.move_to(np.array([x_c, 1.5, 0]))

                max_rmse = 45.0
                bar_width = 0.55
                bars = VGroup()
                value_labels = VGroup()
                x_labels_grp = VGroup()
                for i, (lbl, val) in enumerate(zip(xlabels, rmse_vals)):
                    bar_h = val / max_rmse * 2.5
                    bar = Rectangle(
                        width=bar_width, height=bar_h,
                        fill_color=color, fill_opacity=0.7,
                        stroke_width=0.5, stroke_color=THEME.text_muted,
                    )
                    bar_x = x_c + (i - 1) * 1.0
                    bar.move_to(np.array([bar_x, y_base + bar_h / 2, 0]))
                    bars.add(bar)

                    vl = Text(f"{val:.1f}", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_primary)
                    vl.next_to(bar, UP, buff=0.06)
                    value_labels.add(vl)

                    xl = Text(lbl, font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_muted)
                    xl.next_to(bar, DOWN, buff=0.06)
                    x_labels_grp.add(xl)

                y_label = Text("RMSE (nm)", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_muted)
                y_label.rotate(PI / 2)
                y_label.move_to(np.array([x_c - 1.45, y_base + 1.0, 0]))

                chart_group = VGroup(chart_title, bars, value_labels, x_labels_grp, y_label)
                chart_groups.add(chart_group)

            chart_insights = [
                "High density causes PSF overlap → false localisations",
                "Even 0.5 nm/frame drift degrades RMSE by ~40 %",
            ]

            # Animate each chart with per-chart insight
            prev_insight = None
            for i, cg in enumerate(chart_groups):
                title_mob = cg[0]
                bars_mob = cg[1]
                vals_mob = cg[2]
                xlabs_mob = cg[3]
                ylab_mob = cg[4]

                self.play(FadeIn(title_mob), FadeIn(ylab_mob), run_time=0.3)
                self.play(
                    LaggedStart(*[GrowFromEdge(b, DOWN) for b in bars_mob], lag_ratio=0.12),
                    run_time=0.8,
                )
                self.play(FadeIn(vals_mob), FadeIn(xlabs_mob), run_time=0.3)

                insight_note = Text(
                    chart_insights[i],
                    font=FONT_SANS, font_size=LABEL_SIZE - 1,
                    color=THEME.text_muted, slant="ITALIC",
                ).to_edge(DOWN, buff=0.6)
                if prev_insight is not None:
                    self.play(FadeOut(prev_insight), run_time=0.15)
                self.play(FadeIn(insight_note, shift=UP * 0.08), run_time=0.35)
                prev_insight = insight_note

            self.next_slide()

            # Final consolidated insight
            if prev_insight is not None:
                self.play(FadeOut(prev_insight), run_time=0.2)
            insight = Text(
                "Correct drift with fiducial markers; keep density below overlap threshold.",
                font=FONT_SANS,
                font_size=CAPTION_SIZE,
                color=THEME.text_muted,
                line_spacing=0.9,
            ).to_edge(DOWN, buff=0.6)
            self.play(FadeIn(insight, shift=UP * 0.1), run_time=0.6)
            self.wait(0.5)

    # ==================================================================
    # 14.  3D Extension  (1 : 30)
    # ==================================================================

    class ThreeDExtensionSlide(BaseStormSlide):
        """Astigmatic PSF: ellipses morph with z, calibration curve."""

        def construct(self) -> None:
            self.add_progress(14, TOTAL_SLIDES)
            self.add_chapter_header(
                "3D STORM via Astigmatism",
                "Cylindrical lens encodes z into PSF ellipticity",
                accent_color=THEME.psf_cyan,
            )
            self.add_citations("[3][4]")

            # Narrator: astigmatism concept
            narrator_astig = self.add_narrator_note(
                "A cylindrical lens breaks rotational symmetry — the PSF becomes elliptical.",
                position="bottom",
            )

            # --- Scene A: z-dependent ellipses ---
            z_vals = [-400, -200, 0, 200, 400]
            wx_vals = [2.2, 1.5, 1.0, 0.7, 0.5]
            wy_vals = [0.5, 0.7, 1.0, 1.5, 2.2]
            colors = [THEME.accent_optics, THEME.psf_cyan, THEME.emission_green, THEME.psf_cyan, THEME.accent_alert]

            ellipses = VGroup()
            z_labels = VGroup()
            for i, (z, wx, wy, col) in enumerate(zip(z_vals, wx_vals, wy_vals, colors)):
                x_pos = (i - 2) * 2.5
                e = Ellipse(
                    width=wx, height=wy,
                    color=col, stroke_width=2.5,
                    fill_opacity=0.15, fill_color=col,
                ).move_to(np.array([x_pos, 0.3, 0]))
                label = Text(
                    f"z = {z} nm", font=FONT_SANS,
                    font_size=LABEL_SIZE, color=col,
                )
                label.next_to(e, DOWN, buff=0.25)
                ellipses.add(e)
                z_labels.add(label)

            self.play(
                LaggedStart(*[GrowFromCenter(e) for e in ellipses], lag_ratio=0.12),
                run_time=1.5,
            )
            self.play(FadeIn(z_labels), run_time=0.5)
            self.play(FadeOut(narrator_astig), run_time=0.2)
            self.next_slide()

            # --- Scene B: Calibration curve ---
            self.fade_out_scene()
            cal_title = Text(
                "Calibration: w_x and w_y vs z",
                font=FONT_SANS, font_size=BODY_SIZE, color=THEME.text_primary,
            ).to_edge(UP, buff=2.2)
            self.play(FadeIn(cal_title), run_time=0.3)

            cal_axes = Axes(
                x_range=[-500, 500, 200],
                y_range=[0, 3, 1],
                x_length=8,
                y_length=3.5,
                axis_config={"color": THEME.text_muted, "include_ticks": True},
            ).shift(DOWN * 0.3)

            x_lab = Text("z (nm)", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_muted)
            x_lab.next_to(cal_axes.x_axis, DOWN, buff=0.15)
            y_lab = Text("width (AU)", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.text_muted)
            y_lab.next_to(cal_axes.y_axis, UP, buff=0.1)

            self.play(Create(cal_axes), FadeIn(x_lab), FadeIn(y_lab), run_time=0.7)

            # w_x curve (wide at z<0, narrow at z>0)
            wx_curve = cal_axes.plot(
                lambda z: 1.0 + 1.2 * np.exp(-((z + 200) / 200) ** 2) - 0.3 * np.exp(-((z - 200) / 200) ** 2) + 0.3,
                x_range=[-500, 500, 5],
                color=THEME.accent_optics, stroke_width=3,
            )
            wx_label = Text("w_x", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_optics)
            wx_label.move_to(cal_axes.c2p(-350, 2.3))

            # w_y curve (mirror)
            wy_curve = cal_axes.plot(
                lambda z: 1.0 - 0.3 * np.exp(-((z + 200) / 200) ** 2) + 1.2 * np.exp(-((z - 200) / 200) ** 2) + 0.3,
                x_range=[-500, 500, 5],
                color=THEME.accent_alert, stroke_width=3,
            )
            wy_label = Text("w_y", font=FONT_SANS, font_size=LABEL_SIZE, color=THEME.accent_alert)
            wy_label.move_to(cal_axes.c2p(350, 2.3))

            self.play(Create(wx_curve), FadeIn(wx_label), run_time=0.8)
            self.play(Create(wy_curve), FadeIn(wy_label), run_time=0.8)

            # Focus crossing point
            cross_dot = Dot(point=cal_axes.c2p(0, 1.3), radius=0.08, color=THEME.emission_green)
            cross_label = Text("focal plane", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.emission_green)
            cross_label.next_to(cross_dot, UP, buff=0.1)
            self.play(FadeIn(cross_dot), FadeIn(cross_label), run_time=0.4)

            # Annotation: dashed lines showing measurement → z lookup
            measure_z = 150
            wx_at_z = 1.0 + 1.2 * np.exp(-((measure_z + 200) / 200) ** 2) - 0.3 * np.exp(-((measure_z - 200) / 200) ** 2) + 0.3
            wy_at_z = 1.0 - 0.3 * np.exp(-((measure_z + 200) / 200) ** 2) + 1.2 * np.exp(-((measure_z - 200) / 200) ** 2) + 0.3
            pt_wx = cal_axes.c2p(measure_z, wx_at_z)
            pt_wy = cal_axes.c2p(measure_z, wy_at_z)
            pt_base = cal_axes.c2p(measure_z, 0)
            dashed_v = DashedLine(pt_base, np.array([pt_wx[0], max(pt_wx[1], pt_wy[1]), 0]), color=THEME.text_muted, stroke_width=1.5)
            measure_label = Text(
                "measured z", font=FONT_SANS,
                font_size=LABEL_SIZE - 3, color=THEME.text_highlight,
            ).next_to(dashed_v, RIGHT, buff=0.08)
            self.play(Create(dashed_v), FadeIn(measure_label), run_time=0.5)

            note = Text(
                "Measure w_x/w_y ratio → look up z from calibration",
                font=FONT_SANS, font_size=CAPTION_SIZE, color=THEME.text_muted,
            ).to_edge(DOWN, buff=0.6)
            self.play(FadeIn(note), run_time=0.4)
            self.wait(0.4)

    # ==================================================================
    # 15. Biological Examples  (1 : 30)
    # ==================================================================

    class BiologicalExamplesSlide(BaseStormSlide):
        """Side-by-side: diffraction-limited vs STORM reconstruction."""

        def construct(self) -> None:
            self.add_progress(15, TOTAL_SLIDES)
            self.add_chapter_header(
                "Biological Applications",
                "What STORM reveals that conventional microscopy cannot",
                accent_color=THEME.emission_green,
            )
            self.add_citations("[4]")

            rng = np.random.default_rng(5)

            # --- Left panel: Diffraction-limited (blurry blobs) ---
            left_border = Rectangle(
                width=4.8, height=4.5, stroke_width=1.5, color=THEME.text_muted,
            ).shift(LEFT * 3.3 + DOWN * 0.1)
            left_title = Text("Conventional", font=FONT_SANS, font_size=LABEL_SIZE + 2, color=THEME.accent_alert)
            left_title.next_to(left_border, UP, buff=0.1)

            # Blurry filaments — thick lines
            blurry_fibers = VGroup()
            for _ in range(8):
                x0, y0 = rng.uniform(-5.4, -2.0), rng.uniform(-2.0, 1.8)
                x1, y1 = x0 + rng.uniform(1.0, 2.0), y0 + rng.uniform(-0.6, 0.6)
                x1 = min(x1, -1.1)  # clamp to panel right edge
                blurry_fibers.add(
                    Line([x0, y0, 0], [x1, y1, 0],
                         color=THEME.emission_green, stroke_width=12, stroke_opacity=0.25)
                )
            # Blurry cluster
            blurry_cluster = VGroup()
            for _ in range(20):
                pos = np.array([-3.3 + rng.normal(0, 0.6), -0.8 + rng.normal(0, 0.5), 0])
                blurry_cluster.add(
                    Dot(point=pos, radius=0.15, color=THEME.emission_green, fill_opacity=0.15)
                )

            # --- Right panel: STORM (sharp dots & lines) ---
            right_border = Rectangle(
                width=4.8, height=4.5, stroke_width=1.5, color=THEME.text_muted,
            ).shift(RIGHT * 3.3 + DOWN * 0.1)
            right_title = Text("STORM", font=FONT_SANS, font_size=LABEL_SIZE + 2, color=THEME.emission_green)
            right_title.next_to(right_border, UP, buff=0.1)

            # Sharp filaments — thin lines
            rng2 = np.random.default_rng(5)  # same seed = same structure
            sharp_fibers = VGroup()
            for _ in range(8):
                x0, y0 = rng2.uniform(-5.4, -2.0), rng2.uniform(-2.0, 1.8)
                x1, y1 = x0 + rng2.uniform(1.0, 2.0), y0 + rng2.uniform(-0.6, 0.6)
                # Offset to right panel
                offset = np.array([6.6, 0, 0])
                # Pointillist along line
                n_pts = int(rng2.integers(15, 30))
                for t in np.linspace(0, 1, n_pts):
                    jitter = rng.normal(0, 0.03, size=2)
                    pt = np.array([x0 + t * (x1 - x0) + jitter[0], y0 + t * (y1 - y0) + jitter[1], 0]) + offset
                    sharp_fibers.add(
                        Dot(point=pt, radius=0.025, color=THEME.emission_green, fill_opacity=0.9)
                    )

            # Sharp receptor dots
            rng3 = np.random.default_rng(5)
            sharp_cluster = VGroup()
            for _ in range(20):
                cx = rng3.normal(0, 0.6)
                cy = rng3.normal(0, 0.5)
                # sub-cluster dots
                for _ in range(rng.integers(3, 8)):
                    pt = np.array([3.3 + cx + rng.normal(0, 0.06), -0.8 + cy + rng.normal(0, 0.06), 0])
                    sharp_cluster.add(
                        Dot(point=pt, radius=0.02, color=THEME.psf_cyan, fill_opacity=0.85)
                    )

            # Animate
            self.play(
                FadeIn(left_border), FadeIn(left_title),
                FadeIn(right_border), FadeIn(right_title),
                run_time=0.5,
            )

            self.play(FadeIn(blurry_fibers), FadeIn(blurry_cluster), run_time=0.8)
            self.next_slide()

            self.play(
                LaggedStart(*[FadeIn(d) for d in sharp_fibers], lag_ratio=0.002),
                run_time=2.0,
            )
            self.play(
                LaggedStart(*[FadeIn(d) for d in sharp_cluster], lag_ratio=0.005),
                run_time=1.2,
            )

            # Scale bar annotations
            scale_left = Line(
                left_border.get_corner(DOWN + LEFT) + UP * 0.3 + RIGHT * 0.3,
                left_border.get_corner(DOWN + LEFT) + UP * 0.3 + RIGHT * 1.3,
                color=THEME.text_highlight, stroke_width=2.5,
            )
            scale_left_label = Text(
                "~250 nm", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_highlight,
            ).next_to(scale_left, UP, buff=0.05)

            scale_right = Line(
                right_border.get_corner(DOWN + LEFT) + UP * 0.3 + RIGHT * 0.3,
                right_border.get_corner(DOWN + LEFT) + UP * 0.3 + RIGHT * 1.3,
                color=THEME.text_highlight, stroke_width=2.5,
            )
            scale_right_label = Text(
                "~20 nm", font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_highlight,
            ).next_to(scale_right, UP, buff=0.05)

            self.play(
                Create(scale_left), FadeIn(scale_left_label),
                Create(scale_right), FadeIn(scale_right_label),
                run_time=0.5,
            )

            # Structure labels
            fiber_label = Text(
                "microtubule filaments", font=FONT_SANS,
                font_size=LABEL_SIZE - 2, color=THEME.emission_green, slant="ITALIC",
            ).next_to(left_border, DOWN, buff=0.08).shift(LEFT * 0.5)
            cluster_label = Text(
                "receptor clusters", font=FONT_SANS,
                font_size=LABEL_SIZE - 2, color=THEME.psf_cyan, slant="ITALIC",
            ).next_to(right_border, DOWN, buff=0.08).shift(RIGHT * 0.5)
            self.play(FadeIn(fiber_label), FadeIn(cluster_label), run_time=0.4)

            takeaway = Text(
                "~20 nm resolution reveals sub-cellular architecture invisible at ~250 nm",
                font=FONT_SANS, font_size=CAPTION_SIZE, color=THEME.text_muted,
            ).to_edge(DOWN, buff=0.5)
            self.play(FadeIn(takeaway), run_time=0.5)
            self.wait(0.3)

    # ==================================================================
    # 16. Limitations & Frontier  (1 : 30)
    # ==================================================================

    class LimitationsFrontierSlide(BaseStormSlide):
        """Two-column: current limits vs active research — animated cards."""

        def construct(self) -> None:
            self.add_progress(16, TOTAL_SLIDES)
            self.add_chapter_header(
                "Limitations & Frontier",
                "Where STORM pipelines struggle and where they're heading",
                accent_color=THEME.accent_alert,
            )
            self.add_citations("[4][11]")

            # --- Left column: Limitations ---
            limit_items = [
                ("Photobleaching", "Finite dye budget limits frames"),
                ("Labeling density", "Nyquist: must label at ≤ 2× resolution"),
                ("Slow acquisition", "Minutes of exposure per super-res image"),
                ("Thick tissue", "Scattering & index mismatch degrade PSF"),
            ]

            frontier_items = [
                ("Brighter probes", "SiR dyes, DNA-PAINT, self-blinking"),
                ("Adaptive optics", "Correct sample-induced aberrations"),
                ("Deep learning", "ANNA-PALM, DeepSTORM neural recon"),
                ("Live-cell STORM", "Fast sCMOS + sparse deconvolution"),
            ]

            left_col = VGroup()
            x_left = -3.6
            for i, (title, desc) in enumerate(limit_items):
                card = RoundedRectangle(
                    corner_radius=0.1, width=5.0, height=0.85,
                    color=THEME.accent_alert, fill_opacity=0.08, stroke_width=1.5,
                ).move_to(np.array([x_left, 1.1 - i * 1.15, 0]))
                t = Text(title, font=FONT_SANS, font_size=LABEL_SIZE + 2, color=THEME.accent_alert)
                d = Text(desc, font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_muted)
                t.move_to(card.get_left() + RIGHT * 0.3, aligned_edge=LEFT).shift(UP * 0.13)
                d.move_to(card.get_left() + RIGHT * 0.3, aligned_edge=LEFT).shift(DOWN * 0.18)
                left_col.add(VGroup(card, t, d))

            right_col = VGroup()
            x_right = 3.6
            for i, (title, desc) in enumerate(frontier_items):
                card = RoundedRectangle(
                    corner_radius=0.1, width=5.0, height=0.85,
                    color=THEME.recon_teal, fill_opacity=0.08, stroke_width=1.5,
                ).move_to(np.array([x_right, 1.1 - i * 1.15, 0]))
                t = Text(title, font=FONT_SANS, font_size=LABEL_SIZE + 2, color=THEME.recon_teal)
                d = Text(desc, font=FONT_SANS, font_size=LABEL_SIZE - 2, color=THEME.text_muted)
                t.move_to(card.get_left() + RIGHT * 0.3, aligned_edge=LEFT).shift(UP * 0.13)
                d.move_to(card.get_left() + RIGHT * 0.3, aligned_edge=LEFT).shift(DOWN * 0.18)
                right_col.add(VGroup(card, t, d))

            # Column headers
            lim_header = Text("Current Limitations", font=FONT_SANS, font_size=BODY_SIZE - 2, color=THEME.accent_alert)
            lim_header.move_to(np.array([x_left, 2.0, 0]))
            front_header = Text("Research Frontier", font=FONT_SANS, font_size=BODY_SIZE - 2, color=THEME.recon_teal)
            front_header.move_to(np.array([x_right, 2.0, 0]))

            # Column separator line
            col_sep = Line(
                UP * 2.3, DOWN * 2.7,
                color=THEME.text_muted, stroke_width=1.0, stroke_opacity=0.35,
            )
            self.add(col_sep)

            self.play(FadeIn(lim_header), run_time=0.3)
            for card_group in left_col:
                self.play(FadeIn(card_group, shift=RIGHT * 0.2), run_time=0.4)

            self.next_slide()

            self.play(FadeIn(front_header), run_time=0.3)
            for card_group in right_col:
                self.play(FadeIn(card_group, shift=LEFT * 0.2), run_time=0.4)

            self.wait(0.4)

    # ==================================================================
    # 17. Conclusion Checklist  (1 : 00)
    # ==================================================================

    class ConclusionChecklistSlide(BaseStormSlide):
        """Animated checklist with green checkmarks appearing one-by-one."""

        def construct(self) -> None:
            self.add_progress(17, TOTAL_SLIDES)
            self.add_chapter_header(
                "End-to-End Coverage",
                "Everything demonstrated in this presentation",
                accent_color=THEME.emission_green,
            )

            checks = [
                "Maxwell → Helmholtz — EM foundation for wave propagation",
                "Fourier optics — NA truncates frequencies; d ≈ λ/2NA ≈ 243 nm",
                "Temporal sparsity — sparse blinking isolates single emitters",
                "Microscope hardware — NA ≥ 1.4 objective, dichroic, sCMOS",
                "Poisson camera model — shot noise dominates at low photon counts",
                "Gaussian MLE fitting — σ_loc ≈ σ_PSF/√N → ~15 nm at 400 photons",
                "Monte Carlo simulator — photon budget is the dominant factor",
                "3D STORM — cylindrical lens encodes z into PSF ellipticity",
                "Biological examples — ~250 nm → ~20 nm resolves filaments & clusters",
                "Limitations & frontier — photobleaching, density, drift vs new probes & DL",
            ]

            row_group = VGroup()
            for i, text in enumerate(checks):
                # Check circle (initially gray)
                check_circle = Circle(
                    radius=0.13, color=THEME.text_muted,
                    stroke_width=2, fill_opacity=0,
                ).shift(LEFT * 5.8)

                label = Text(text, font=FONT_SANS, font_size=LABEL_SIZE + 1, color=THEME.text_primary)
                label.next_to(check_circle, RIGHT, buff=0.15)

                row = VGroup(check_circle, label)
                row.move_to(np.array([0, 1.8 - i * 0.40, 0]))
                row_group.add(row)

            # Animate each row with checkmark
            for row in row_group:
                circle = row[0]
                label_mob = row[1]
                self.play(FadeIn(label_mob, shift=RIGHT * 0.1), run_time=0.18)
                # Turn circle green = checked
                self.play(
                    circle.animate.set_color(THEME.emission_green).set_fill(THEME.emission_green, opacity=0.6),
                    run_time=0.12,
                )

            # Final message
            closing = Text(
                "From Maxwell's equations to 20 nm resolution — the complete STORM pipeline.",
                font=FONT_SANS, font_size=BODY_SIZE,
                color=THEME.emission_green,
            ).to_edge(DOWN, buff=0.6)
            self.play(FadeIn(closing), run_time=0.6)
            self.wait(0.8)
