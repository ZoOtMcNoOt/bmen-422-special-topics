"""Reusable animation helpers for 3Blue1Brown-quality STORM slides.

All helpers degrade gracefully when Manim is not installed.
"""

from __future__ import annotations

from storm_slides.config import THEME

try:
    import numpy as np
    from manim import (
        DOWN,
        LEFT,
        RIGHT,
        UP,
        ORIGIN,
        PI,
        TAU,
        Circle,
        Dot,
        FadeIn,
        FadeOut,
        Flash,
        GrowFromCenter,
        Indicate,
        LaggedStart,
        Line,
        ManimColor,
        SurroundingRectangle,
        Text,
        VGroup,
        VMobject,
        Animation,
        UpdateFromAlphaFunc,
        rate_functions,
        smooth,
        RoundedRectangle,
    )

    MANIM_AVAILABLE = True
except Exception:  # pragma: no cover
    MANIM_AVAILABLE = False

if MANIM_AVAILABLE:

    # ------------------------------------------------------------------
    # Photon burst — radial particle spray
    # ------------------------------------------------------------------

    def photon_burst(
        scene,
        center,
        n_photons: int = 12,
        color: str = THEME.photon_gold,
        spread: float = 1.2,
        run_time: float = 1.0,
    ):
        """Animate a radial burst of photon dots from *center*."""
        dots = VGroup()
        angles = np.linspace(0, TAU, n_photons, endpoint=False)
        for angle in angles:
            d = Dot(point=center, radius=0.04, color=color, fill_opacity=0.9)
            d.target_point = center + np.array(
                [spread * np.cos(angle), spread * np.sin(angle), 0]
            )
            dots.add(d)

        scene.play(
            LaggedStart(
                *[
                    d.animate(rate_func=rate_functions.ease_out_cubic, run_time=run_time).move_to(
                        d.target_point
                    ).set_opacity(0)
                    for d in dots
                ],
                lag_ratio=0.04,
            ),
            run_time=run_time,
        )
        scene.remove(dots)

    # ------------------------------------------------------------------
    # Glow pulse on a mobject
    # ------------------------------------------------------------------

    def glow_pulse(
        scene,
        mobject,
        color: str = THEME.glow_blue,
        n_pulses: int = 2,
        run_time: float = 1.5,
    ):
        """Pulse a glowing SurroundingRectangle around *mobject*."""
        rect = SurroundingRectangle(
            mobject,
            color=color,
            buff=0.15,
            corner_radius=0.1,
            stroke_width=3,
            fill_opacity=0.0,
        )
        for _ in range(n_pulses):
            scene.play(
                FadeIn(rect, run_time=run_time / (2 * n_pulses)),
            )
            scene.play(
                FadeOut(rect, run_time=run_time / (2 * n_pulses)),
            )

    # ------------------------------------------------------------------
    # Animated wave propagation along a line
    # ------------------------------------------------------------------

    def wave_line(
        x_range: tuple[float, float] = (-5, 5),
        wavelength: float = 1.5,
        amplitude: float = 0.4,
        color: str = THEME.wave_blue,
        n_points: int = 200,
        phase: float = 0.0,
    ) -> VMobject:
        """Return a VMobject tracing a sinusoidal wave."""
        wave = VMobject(color=color, stroke_width=3)
        xs = np.linspace(x_range[0], x_range[1], n_points)
        k = TAU / wavelength
        points = [
            np.array([x, amplitude * np.sin(k * x + phase), 0]) for x in xs
        ]
        wave.set_points_smoothly(points)
        return wave

    def propagating_wave(
        scene,
        x_range: tuple[float, float] = (-6, 6),
        y_center: float = 0.0,
        wavelength: float = 1.5,
        amplitude: float = 0.5,
        color: str = THEME.wave_blue,
        run_time: float = 3.0,
        shift: np.ndarray | None = None,
    ):
        """Animate a sinusoidal wave sweeping across the screen.

        Uses ``UpdateFromAlphaFunc`` with a ``ValueTracker``-like phase ramp
        so the wave appears to travel.
        """
        from manim import ValueTracker

        phase_tracker = ValueTracker(0)
        n_pts = 300
        k = TAU / wavelength

        def _build(mob, dt=None):
            ph = phase_tracker.get_value()
            xs = np.linspace(x_range[0], x_range[1], n_pts)
            pts = [
                np.array([x, y_center + amplitude * np.sin(k * x - ph), 0])
                for x in xs
            ]
            mob.set_points_smoothly(pts)

        wave = VMobject(color=color, stroke_width=3.5)
        _build(wave)
        if shift is not None:
            wave.shift(shift)
        wave.add_updater(lambda m, dt: _build(m))
        scene.add(wave)
        scene.play(
            phase_tracker.animate.set_value(4 * TAU),
            run_time=run_time,
            rate_func=rate_functions.linear,
        )
        wave.clear_updaters()
        return wave

    # ------------------------------------------------------------------
    # Wavefront rings — expanding circles from a point source
    # ------------------------------------------------------------------

    def wavefront_rings(
        scene,
        center=ORIGIN,
        n_rings: int = 5,
        max_radius: float = 2.5,
        color: str = THEME.wave_blue,
        run_time: float = 2.0,
    ):
        """Expanding concentric circles emanating from *center*."""
        rings = VGroup()
        for i in range(n_rings):
            c = Circle(
                radius=0.01,
                stroke_color=color,
                stroke_width=2.5,
                stroke_opacity=0.8 - 0.12 * i,
                fill_opacity=0,
            ).move_to(center)
            rings.add(c)

        anims = []
        for i, ring in enumerate(rings):
            target_r = max_radius * (i + 1) / n_rings
            anims.append(
                ring.animate(
                    rate_func=rate_functions.ease_out_quad,
                    run_time=run_time,
                )
                .scale(target_r / 0.01)
                .set_stroke(opacity=0.0)
            )
        scene.play(LaggedStart(*anims, lag_ratio=0.2), run_time=run_time)
        scene.remove(rings)

    # ------------------------------------------------------------------
    # Typewriter text reveal
    # ------------------------------------------------------------------

    def typewriter_text(
        scene,
        text_str: str,
        position=None,
        font_size: int = 28,
        color: str = THEME.text_primary,
        run_time: float = 2.0,
    ):
        """Reveal *text_str* character by character."""
        from manim import AddTextLetterByLetter

        txt = Text(text_str, font_size=font_size, color=color)
        if position is not None:
            txt.move_to(position)
        scene.play(AddTextLetterByLetter(txt, run_time=run_time))
        return txt

    # ------------------------------------------------------------------
    # Highlight box helper
    # ------------------------------------------------------------------

    def highlight_box(
        mobject,
        color: str = THEME.accent_physics,
        buff: float = 0.15,
        corner_radius: float = 0.1,
        fill_opacity: float = 0.06,
        stroke_width: float = 2.5,
    ) -> RoundedRectangle:
        """Return a ``RoundedRectangle`` surrounding *mobject*."""
        return RoundedRectangle(
            corner_radius=corner_radius,
            width=mobject.width + 2 * buff,
            height=mobject.height + 2 * buff,
            color=color,
            fill_opacity=fill_opacity,
            stroke_width=stroke_width,
        ).move_to(mobject)

    # ------------------------------------------------------------------
    # Animated bar chart growth
    # ------------------------------------------------------------------

    def grow_bars(
        scene,
        bars: VGroup,
        run_time: float = 1.2,
    ):
        """Grow bars from their bottom edge with staggered timing."""
        from manim import GrowFromEdge

        scene.play(
            LaggedStart(
                *[GrowFromEdge(bar, DOWN) for bar in bars],
                lag_ratio=0.1,
            ),
            run_time=run_time,
        )

    # ------------------------------------------------------------------
    # Camera zoom helper (for MovingCameraScene)
    # ------------------------------------------------------------------

    def camera_zoom(scene, target, scale: float = 0.4, run_time: float = 1.5):
        """Smoothly zoom the camera to focus on *target*."""
        scene.play(
            scene.camera.frame.animate.set_width(
                target.width * (1 / scale)
            ).move_to(target),
            run_time=run_time,
        )

    def camera_reset(scene, run_time: float = 1.0):
        """Reset camera to default full-frame view."""
        from manim import config as manim_config

        scene.play(
            scene.camera.frame.animate.set_width(
                manim_config.frame_width
            ).move_to(ORIGIN),
            run_time=run_time,
        )
