"""Base slide utilities with graceful fallback when Manim is unavailable.

Provides ``BaseStormSlide`` with rich chapter headers, animated progress bar,
citation badges, section dividers, fade-out helpers, and camera zoom helpers
suitable for a 3Blue1Brown–quality presentation.
"""

from __future__ import annotations

from storm_slides.config import (
    BODY_SIZE,
    CAPTION_SIZE,
    CITATION_SIZE,
    FONT_SANS,
    LABEL_SIZE,
    SECTION_SIZE,
    THEME,
    TITLE_SIZE,
    TOTAL_SLIDES,
)

try:
    import numpy as np
    from manim import (
        DOWN,
        LEFT,
        RIGHT,
        UP,
        ORIGIN,
        BackgroundRectangle,
        Create,
        FadeIn,
        FadeOut,
        Line,
        ManimColor,
        Rectangle,
        RoundedRectangle,
        Text,
        VGroup,
        Write,
    )
    from manim_slides import Slide

    MANIM_AVAILABLE = True
except Exception:  # pragma: no cover
    MANIM_AVAILABLE = False

    class Slide:  # type: ignore[no-redef]
        pass


if MANIM_AVAILABLE:

    class BaseStormSlide(Slide):
        """Rich shared utilities for every STORM slide scene.

        All slide scenes inherit from this.  It sets the dark background,
        provides animated chapter headers with accent-coloured underlines,
        a progress bar, citation badges, and helper methods for clearing
        the canvas between sub-sections.
        """

        # ----- setup -----

        def setup(self) -> None:
            super().setup()
            self.camera.background_color = ManimColor(THEME.background_color)
            self._persistent: list = []  # mobjects that survive fade_out_scene

        # ----- chapter header with underline -----

        def add_chapter_header(
            self,
            chapter: str,
            subtitle: str | None = None,
            accent_color: str = THEME.accent_physics,
        ) -> VGroup:
            """Animated title at top with an accent underline sweep."""
            title = Text(
                chapter,
                font=FONT_SANS,
                font_size=TITLE_SIZE,
                color=THEME.text_primary,
                weight="BOLD",
            ).to_edge(UP, buff=0.45)

            underline = Line(
                title.get_left() + DOWN * 0.3,
                title.get_right() + DOWN * 0.3,
                color=accent_color,
                stroke_width=3.5,
            )

            self.play(FadeIn(title, shift=DOWN * 0.25), run_time=0.7)
            self.play(Create(underline), run_time=0.5)
            self._chapter_header = title
            self._chapter_underline = underline

            header_group = VGroup(title, underline)

            if subtitle:
                sub = Text(
                    subtitle,
                    font=FONT_SANS,
                    font_size=CAPTION_SIZE,
                    color=THEME.text_muted,
                )
                sub.next_to(title, DOWN, buff=0.25)
                self.play(FadeIn(sub, shift=UP * 0.12), run_time=0.45)
                self._chapter_subtitle = sub
                header_group.add(sub)

            self._persistent.extend(header_group)
            return header_group

        # ----- progress bar (animated fill) -----

        def add_progress(self, index: int, total: int = TOTAL_SLIDES) -> VGroup:
            """Thin progress bar at bottom with animated fill."""
            bar_width = 10.0
            bar_height = 0.06
            bg = RoundedRectangle(
                corner_radius=bar_height / 2,
                width=bar_width,
                height=bar_height,
                stroke_width=0,
                fill_color=THEME.progress_bg,
                fill_opacity=0.85,
            ).to_edge(DOWN, buff=0.22)

            fill_width = max(0.06, bar_width * index / total)
            fill = RoundedRectangle(
                corner_radius=bar_height / 2,
                width=fill_width,
                height=bar_height,
                stroke_width=0,
                fill_color=THEME.progress_fill,
                fill_opacity=0.95,
            )
            fill.align_to(bg, LEFT).move_to(bg, aligned_edge=LEFT)

            label = Text(
                f"{index} / {total}",
                font=FONT_SANS,
                font_size=LABEL_SIZE,
                color=THEME.text_muted,
            ).next_to(bg, UP, buff=0.06)

            grp = VGroup(bg, fill, label)
            self.add(grp)
            self._persistent.extend([bg, fill, label])
            return grp

        # ----- citation badge -----

        def add_citations(self, refs: str) -> VGroup:
            """Semi-transparent citation pill, bottom-right."""
            badge = Text(
                refs,
                font=FONT_SANS,
                font_size=CITATION_SIZE,
                color=THEME.citation_color,
            )
            pill = RoundedRectangle(
                corner_radius=0.12,
                width=badge.width + 0.3,
                height=badge.height + 0.18,
                fill_color=THEME.surface,
                fill_opacity=0.35,
                stroke_width=0,
            )
            pill.move_to(badge)
            grp = VGroup(pill, badge)
            grp.to_corner(DOWN + RIGHT, buff=0.35)
            grp.shift(UP * 0.55)  # stay above progress bar
            self.add(grp)
            self._persistent.extend([pill, badge])
            return grp

        # ----- narrator note (step-by-step explanatory text) -----

        def add_narrator_note(
            self,
            text: str,
            color: str | None = None,
            position: str = "left",
            run_time: float = 0.5,
        ) -> Text:
            """Show a step-by-step explanatory note in a safe zone.

            Parameters
            ----------
            text : str
                The note content. Kept short (1-2 lines).
            color : str, optional
                Override colour; defaults to ``THEME.text_muted``.
            position : str
                ``"left"`` (default) places it left-aligned below the header.
                ``"bottom"`` places it just above the progress bar.
            run_time : float
                Fade-in duration.

            Returns the Text mobject so the caller can fade it out later.
            """
            note = Text(
                text,
                font=FONT_SANS,
                font_size=CAPTION_SIZE - 2,
                color=color or THEME.text_muted,
                slant="ITALIC",
                line_spacing=0.85,
            )
            if position == "bottom":
                note.to_edge(DOWN, buff=0.85)
            else:
                note.to_edge(LEFT, buff=0.6).shift(UP * 1.2)
            self.play(FadeIn(note, shift=UP * 0.1), run_time=run_time)
            return note

        # ----- body caption -----

        def add_body_caption(self, text: str, color: str | None = None) -> Text:
            caption = Text(
                text,
                font=FONT_SANS,
                font_size=BODY_SIZE - 2,
                color=color or THEME.text_muted,
                line_spacing=0.85,
            ).to_edge(DOWN, buff=0.75)
            self.play(FadeIn(caption, shift=UP * 0.15), run_time=0.5)
            return caption

        # ----- section divider -----

        def section_divider(self) -> Line:
            divider = Line(
                LEFT * 6.2,
                RIGHT * 6.2,
                color=THEME.text_muted,
                stroke_width=1.0,
                stroke_opacity=0.35,
            )
            divider.shift(UP * 2.45)
            self.add(divider)
            self._persistent.append(divider)
            return divider

        # ----- scene clearing helpers -----

        def fade_out_scene(self, run_time: float = 0.6) -> None:
            """Fade out everything except persistent elements (progress, citations)."""
            to_fade = [
                m for m in self.mobjects
                if m not in self._persistent
            ]
            if to_fade:
                self.play(*[FadeOut(m) for m in to_fade], run_time=run_time)

        def clear_and_reset(self, run_time: float = 0.5) -> None:
            """Fade everything and remove all mobjects."""
            if self.mobjects:
                self.play(*[FadeOut(m) for m in self.mobjects], run_time=run_time)
            self.clear()
            self._persistent.clear()

else:  # no-op fallback for non-Manim environments

    class BaseStormSlide(Slide):  # type: ignore[no-redef]
        """No-op fallback so tests import without Manim installed."""

        def add_chapter_header(self, chapter: str, subtitle: str | None = None, accent_color: str = "") -> None:
            return None

        def add_progress(self, index: int, total: int = 12) -> None:
            return None

        def add_citations(self, refs: str) -> None:
            return None

        def add_narrator_note(self, text: str, color: str | None = None, position: str = "left", run_time: float = 0.5) -> None:
            return None

        def add_body_caption(self, text: str, color: str | None = None) -> None:
            return None

        def section_divider(self) -> None:
            return None

        def fade_out_scene(self, run_time: float = 0.6) -> None:
            return None

        def clear_and_reset(self, run_time: float = 0.5) -> None:
            return None

        def next_slide(self, **kwargs) -> None:
            return None
