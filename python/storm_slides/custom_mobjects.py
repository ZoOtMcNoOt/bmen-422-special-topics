"""Reusable custom Mobjects for 3Blue1Brown–quality STORM slides.

Every helper gracefully degrades to ``None`` when Manim is unavailable so that
the simulator and test suite remain importable without a display server.
"""

from __future__ import annotations

from storm_slides.config import (
    FONT_SANS,
    LABEL_SIZE,
    THEME,
)

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
        Arc,
        Circle,
        Dot,
        FadeIn,
        Line,
        ManimColor,
        MathTex,
        Polygon,
        Rectangle,
        RoundedRectangle,
        Square,
        Text,
        VGroup,
        VMobject,
        ImageMobject,
    )

    MANIM_AVAILABLE = True
except Exception:  # pragma: no cover
    MANIM_AVAILABLE = False

if MANIM_AVAILABLE:

    # ------------------------------------------------------------------
    # Lens shape (two symmetric arcs)
    # ------------------------------------------------------------------

    class Lens(VGroup):
        """Biconvex lens built from two mirrored arcs."""

        def __init__(
            self,
            height: float = 1.6,
            curvature: float = 0.35,
            color: str = THEME.accent_optics,
            fill_opacity: float = 0.15,
            **kwargs,
        ):
            super().__init__(**kwargs)
            self.height = height
            # Build two arcs that bulge outward
            half = height / 2
            # Left arc (bulges left)
            left_arc = Arc(
                radius=half / curvature,
                start_angle=PI / 2 - curvature,
                angle=2 * curvature,
                color=color,
                stroke_width=3,
            )
            left_arc.rotate(PI)
            left_arc.move_to(ORIGIN)
            left_arc.shift(LEFT * curvature * 0.3)

            # Right arc (bulges right)
            right_arc = Arc(
                radius=half / curvature,
                start_angle=PI / 2 - curvature,
                angle=2 * curvature,
                color=color,
                stroke_width=3,
            )
            right_arc.move_to(ORIGIN)
            right_arc.shift(RIGHT * curvature * 0.3)

            # Body fill
            body = VMobject(color=color, fill_opacity=fill_opacity, stroke_width=0)
            top = UP * half
            bot = DOWN * half
            body.set_points_as_corners([top, top, bot, bot])
            # Simple filled ellipse approximation
            from manim import Ellipse

            fill = Ellipse(
                width=curvature * 2.4,
                height=height,
                color=color,
                fill_opacity=fill_opacity,
                stroke_width=2.5,
                stroke_color=color,
            )
            self.add(fill)
            self.lens_body = fill

    # ------------------------------------------------------------------
    # Dichroic mirror (45-degree rectangle with reflection/transmission)
    # ------------------------------------------------------------------

    class DichroicMirror(VGroup):
        """45-degree angled element that splits excitation from emission."""

        def __init__(
            self,
            size: float = 0.8,
            color: str = THEME.accent_physics,
            fill_opacity: float = 0.25,
            **kwargs,
        ):
            super().__init__(**kwargs)
            rect = Rectangle(
                width=size * 0.18,
                height=size,
                color=color,
                fill_opacity=fill_opacity,
                stroke_width=2,
            )
            rect.rotate(PI / 4)
            self.add(rect)
            self.body = rect

    # ------------------------------------------------------------------
    # Camera / Detector grid
    # ------------------------------------------------------------------

    class DetectorGrid(VGroup):
        """CCD / sCMOS pixel array rendered as a grid of squares."""

        def __init__(
            self,
            rows: int = 6,
            cols: int = 6,
            pixel_size: float = 0.22,
            base_color: str = THEME.detector_gray,
            **kwargs,
        ):
            super().__init__(**kwargs)
            self.rows = rows
            self.cols = cols
            self.pixels: list[list[Square]] = []
            for r in range(rows):
                row_list: list[Square] = []
                for c in range(cols):
                    sq = Square(
                        side_length=pixel_size,
                        stroke_width=0.6,
                        stroke_color=THEME.text_muted,
                        fill_color=base_color,
                        fill_opacity=0.35,
                    )
                    sq.move_to(
                        RIGHT * (c - cols / 2 + 0.5) * pixel_size
                        + DOWN * (r - rows / 2 + 0.5) * pixel_size
                    )
                    self.add(sq)
                    row_list.append(sq)
                self.pixels.append(row_list)

        def highlight_pixel(self, row: int, col: int, color: str, opacity: float = 0.9):
            self.pixels[row][col].set_fill(color=color, opacity=opacity)

    # ------------------------------------------------------------------
    # Fluorophore (state-driven colored dot)
    # ------------------------------------------------------------------

    class Fluorophore(VGroup):
        """Small circle representing a fluorophore with on/off state."""

        def __init__(
            self,
            radius: float = 0.08,
            on_color: str = THEME.emission_green,
            off_color: str = THEME.text_muted,
            initially_on: bool = False,
            **kwargs,
        ):
            super().__init__(**kwargs)
            self.on_color = on_color
            self.off_color = off_color
            color = on_color if initially_on else off_color
            opacity = 0.95 if initially_on else 0.3
            self.dot = Dot(radius=radius, color=color, fill_opacity=opacity)
            self.add(self.dot)
            self._is_on = initially_on

        def set_on(self):
            self.dot.set_fill(color=self.on_color, opacity=0.95)
            # Add a subtle glow
            self.dot.set_stroke(color=self.on_color, width=2, opacity=0.5)
            self._is_on = True

        def set_off(self):
            self.dot.set_fill(color=self.off_color, opacity=0.3)
            self.dot.set_stroke(width=0)
            self._is_on = False

    # ------------------------------------------------------------------
    # EquationBox — rounded rectangle highlighting a key result
    # ------------------------------------------------------------------

    class EquationBox(VGroup):
        """Rounded rectangle wrapping a MathTex equation with optional label."""

        def __init__(
            self,
            equation: MathTex,
            label: str | None = None,
            color: str = THEME.accent_physics,
            fill_opacity: float = 0.08,
            corner_radius: float = 0.15,
            buff: float = 0.3,
            **kwargs,
        ):
            super().__init__(**kwargs)
            box = RoundedRectangle(
                corner_radius=corner_radius,
                width=equation.width + 2 * buff,
                height=equation.height + 2 * buff,
                color=color,
                fill_opacity=fill_opacity,
                stroke_width=2.5,
            )
            box.move_to(equation)
            self.add(box, equation)
            self.box = box
            self.equation = equation
            if label:
                lbl = Text(
                    label,
                    font=FONT_SANS,
                    font_size=LABEL_SIZE,
                    color=color,
                )
                lbl.next_to(box, UP, buff=0.12)
                self.add(lbl)
                self.label_mob = lbl

    # ------------------------------------------------------------------
    # StageIcon  — styled icon for pipeline stages
    # ------------------------------------------------------------------

    class StageIcon(VGroup):
        """Circle or rounded-rect icon with a small symbol and label below."""

        def __init__(
            self,
            symbol: str,
            label: str,
            color: str,
            radius: float = 0.55,
            **kwargs,
        ):
            super().__init__(**kwargs)
            bg = Circle(
                radius=radius,
                stroke_color=color,
                stroke_width=4,
                fill_color=color,
                fill_opacity=0.10,
            )
            sym = Text(symbol, font_size=32, color=color)
            sym.move_to(bg)
            lbl = Text(
                label,
                font=FONT_SANS,
                font_size=LABEL_SIZE,
                color=THEME.text_primary,
            )
            lbl.next_to(bg, DOWN, buff=0.2)
            self.add(bg, sym, lbl)
            self.bg = bg
            self.sym_mob = sym
            self.lbl_mob = lbl

    # ------------------------------------------------------------------
    # GlowDot — dot with subtle halo
    # ------------------------------------------------------------------

    class GlowDot(VGroup):
        """A dot with concentric transparent halos for a glow effect."""

        def __init__(
            self,
            point=ORIGIN,
            color: str = THEME.emission_green,
            radius: float = 0.06,
            glow_radius: float = 0.25,
            n_rings: int = 5,
            **kwargs,
        ):
            super().__init__(**kwargs)
            for i in range(n_rings, 0, -1):
                r = glow_radius * i / n_rings
                ring = Dot(
                    point=point,
                    radius=r,
                    color=color,
                    fill_opacity=0.08 * (n_rings - i + 1) / n_rings,
                    stroke_width=0,
                )
                self.add(ring)
            core = Dot(point=point, radius=radius, color=color, fill_opacity=0.95)
            self.add(core)
            self.core = core

    # ------------------------------------------------------------------
    # EnergyLevel — horizontal line with label for Jablonski diagrams
    # ------------------------------------------------------------------

    class EnergyLevel(VGroup):
        """Horizontal line representing an energy state."""

        def __init__(
            self,
            label: str,
            width: float = 1.8,
            color: str = THEME.text_primary,
            **kwargs,
        ):
            super().__init__(**kwargs)
            line = Line(LEFT * width / 2, RIGHT * width / 2, color=color, stroke_width=3)
            lbl = Text(label, font=FONT_SANS, font_size=LABEL_SIZE, color=color)
            lbl.next_to(line, RIGHT, buff=0.15)
            self.add(line, lbl)
            self.line = line

    # ------------------------------------------------------------------
    # BeamArrow — colored thick arrow for light paths
    # ------------------------------------------------------------------

    class BeamArrow(VGroup):
        """Styled arrow for representing light beams in optical setups."""

        def __init__(
            self,
            start,
            end,
            color: str = THEME.excitation_violet,
            width: float = 5,
            **kwargs,
        ):
            from manim import Arrow as MArrow

            super().__init__(**kwargs)
            arrow = MArrow(
                start, end,
                color=color,
                stroke_width=width,
                buff=0.05,
                max_tip_length_to_length_ratio=0.12,
            )
            self.add(arrow)
            self.arrow = arrow
