"""Card 3A-M1: AM-GM on a semicircle. Parameters a, b (integers 1..20); the TypeScript entry is
lib/subjects/math/clips/amgm-semicircle.ts and its chapters (10, 24, 35, 49 s) are repeated here and checked by the
manifest gate. Only language-independent labels are drawn (letters and formulas), so the clip needs no translation."""
import math

from _base import *
import numpy as np
from manim import (Arc, Create, Dot, FadeIn, FadeOut, Line, Polygon, Write, ValueTracker, always_redraw,
                   Transform)


class AmgmSemicircle(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("setup", 0, 10), ("height", 10, 24), ("compare", 24, 35), ("equality", 35, 49)]

    def construct(self):
        a, b = int(self.params["a"]), int(self.params["b"])
        s = 10.0 / (a + b)  # scene units per unit of length, so AB is always 10 wide
        cy = -2.0
        O = np.array([0.0, cy, 0.0])
        A, B = np.array([-5.0, cy, 0.0]), np.array([5.0, cy, 0.0])
        x_c = -5.0 + a * s
        r = (a + b) / 2.0
        h = math.sqrt(a * b)
        self.display = {"a": a, "b": b, "r": r, "h": round(h, 3)}

        def top_at(x):  # height of the semicircle above AB at abscissa x
            return math.sqrt(max(25.0 - x * x, 0.0))

        # --- chapter 1: the figure ------------------------------------------------------------------------------
        base = Line(A, B, color=WHITE, stroke_width=5)
        arc = Arc(radius=5.0, start_angle=0, angle=math.pi, arc_center=O, color=BLUE_D, stroke_width=5)
        dot_c = Dot(np.array([x_c, cy, 0.0]), color=YELLOW_D, radius=0.1)
        lab_c = self.tag(MathTex("C", font_size=36).next_to(dot_c, DOWN, buff=0.15), "label-C")
        lab_a = self.tag(MathTex("a", font_size=40, color=GREEN_D).move_to(np.array([(-5.0 + x_c) / 2, cy - 1.2, 0.0])), "label-a")
        lab_b = self.tag(MathTex("b", font_size=40, color=RED_D).move_to(np.array([(x_c + 5.0) / 2, cy - 1.2, 0.0])), "label-b")
        seg_a = Line(A, np.array([x_c, cy, 0.0]), color=GREEN_D, stroke_width=9).shift(DOWN * 0.75)
        seg_b = Line(np.array([x_c, cy, 0.0]), B, color=RED_D, stroke_width=9).shift(DOWN * 0.75)
        self.play(Create(base), run_time=1.5)
        self.play(FadeIn(dot_c), Write(lab_c), run_time=1.5)
        self.play(Create(seg_a), Create(seg_b), Write(lab_a), Write(lab_b), run_time=2)
        self.play(Create(arc), run_time=2.5)
        self.chapter_end("setup")

        # --- chapter 2: the height h ------------------------------------------------------------------------------
        yd = cy + top_at(x_c)
        perp = Line(np.array([x_c, cy, 0.0]), np.array([x_c, yd, 0.0]), color=YELLOW_D, stroke_width=7)
        dot_d = Dot(np.array([x_c, yd, 0.0]), color=YELLOW_D, radius=0.1)
        lab_d = self.tag(MathTex("D", font_size=36).next_to(dot_d, UP, buff=0.15), "label-D")
        lab_h = self.tag(MathTex("h", font_size=40, color=YELLOW_D).next_to(perp, RIGHT, buff=0.2), "label-h")
        tri = Polygon(A, B, np.array([x_c, yd, 0.0]), color=WHITE, stroke_width=3, fill_opacity=0.0)
        cap = self.tag(MathTex(r"h^2 = ab", font_size=48).to_corner(UP + LEFT, buff=0.5), "caption")
        self.play(Create(perp), FadeIn(dot_d), Write(lab_d), run_time=3.5)
        self.play(Write(lab_h), run_time=2)
        self.play(Create(tri), run_time=4)
        self.play(Write(cap), run_time=2.5)
        self.chapter_end("height")

        # --- chapter 3: h against the radius ---------------------------------------------------------------------
        radius_line = Line(O, np.array([0.0, cy + 5.0, 0.0]), color=BLUE_D, stroke_width=7)
        lab_r = self.tag(MathTex("r", font_size=40, color=BLUE_D).next_to(radius_line, LEFT, buff=0.2).shift(UP * 1.0), "label-r")
        cap2 = self.tag(MathTex(r"h \le r", font_size=48).to_corner(UP + LEFT, buff=0.5), "caption")
        self.play(FadeOut(tri), run_time=1.5)
        self.play(Create(radius_line), Write(lab_r), run_time=4.5)
        self.play(Transform(cap, cap2), run_time=3)
        self.chapter_end("compare")

        # --- chapter 4: when they are equal ----------------------------------------------------------------------
        t = ValueTracker(x_c)
        moving = always_redraw(lambda: Line(np.array([t.get_value(), cy, 0.0]),
                                            np.array([t.get_value(), cy + top_at(t.get_value()), 0.0]),
                                            color=YELLOW_D, stroke_width=7))
        moving_dot = always_redraw(lambda: Dot(np.array([t.get_value(), cy + top_at(t.get_value()), 0.0]),
                                               color=YELLOW_D, radius=0.1))
        moving_c = always_redraw(lambda: Dot(np.array([t.get_value(), cy, 0.0]), color=YELLOW_D, radius=0.1))
        cap3 = self.tag(MathTex(r"h = r \iff a = b", font_size=48).to_corner(UP + LEFT, buff=0.5), "caption")
        self.remove(perp, dot_d, dot_c, lab_d, lab_h, lab_c, lab_a, lab_b, seg_a, seg_b)
        self.add(moving, moving_dot, moving_c)
        self.play(t.animate.set_value(-4.0), run_time=3)  # C goes to the left, where h is small,
        self.play(t.animate.set_value(4.0), run_time=3.5)  # across to the right,
        self.play(t.animate.set_value(0.0), run_time=2.5)  # and back to the centre, where h = r
        self.play(Transform(cap, cap3), run_time=2.5)
        self.chapter_end("equality")
