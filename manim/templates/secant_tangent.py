"""Card 3B-M: from secants to the tangent. Entry: lib/subjects/math/clips/secant-tangent.ts."""
import math

import numpy as np
from manim import Create, Dot, FadeIn, FadeOut, Line, Write, Transform, ValueTracker, always_redraw, Indicate, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, plot, tex, line_in_box, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class SecantTangent(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("curve", 0, 10), ("secant", 10, 24), ("limit", 24, 42), ("tangent", 42, 53)]

    def construct(self):
        c, x0 = [int(v) for v in self.params["c"]], int(self.params["x0"])
        f = lambda x: sum(k * x ** i for i, k in enumerate(c))
        fp = lambda x: sum(i * k * x ** (i - 1) for i, k in enumerate(c) if i > 0)
        slope = lambda h: (f(x0 + h) - f(x0)) / h
        r4 = lambda v: round(v * 10000) / 10000 + 0.0
        self.display = {"f0": f(x0) + 0, "fprime": fp(x0) + 0, "slope1": r4(slope(1)), "slope01": r4(slope(0.01))}
        sx, sy = 1.55, 0.6
        S = lambda x, y: P(-1.0 + sx * x, -0.2 + sy * y)
        box = (-6.6, 6.6, -3.4, 3.1)
        axes = [Line(S(-3.8, 0), S(3.8, 0), color=WHITE, stroke_width=3), Line(S(0, -5.2), S(0, 5.0), color=WHITE, stroke_width=3)]
        graph = plot(f, -3.8, 3.8, S, color=BLUE_D)
        Pp = S(x0, f(x0))
        dP = Dot(Pp, color=YELLOW_D, radius=0.13)
        lP = tex("P", 36, YELLOW_D, "P").move_to(Pp + P(-0.4, 0.4))
        self.sequence("curve", [([Create(a_) for a_ in axes], 2), ([Create(graph)], 3), ([FadeIn(dP), Write(lP)], 1.5)], hold=3)

        def secant_line(h):
            q = S(x0 + h, f(x0 + h))
            d = q - Pp
            e0, e1 = line_in_box(Pp, d, box)
            return Line(e0, e1, color=GREEN_D, stroke_width=6)
        tt = ValueTracker(1.0)
        # first the secant for h = 1, drawn once (Create does not work on a redrawn object)
        ln1 = secant_line(1.0)
        dq1 = Dot(S(x0 + 1, f(x0 + 1)), color=GREEN_D, radius=0.12)
        lq = tex("Q", 36, GREEN_D, "Q").move_to(S(x0 + 1, f(x0 + 1)) + P(0.4, 0.4))
        cap = tex(rf"h = 1,\; m = {slope(1):.2f}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("secant", [([Create(ln1)], 3), ([FadeIn(dq1), Write(lq)], 2.5), ([Write(cap)], 3)], hold=2.5)

        live_ln = always_redraw(lambda: secant_line(tt.get_value()))
        live_q = always_redraw(lambda: Dot(S(x0 + tt.get_value(), f(x0 + tt.get_value())), color=GREEN_D, radius=0.12))
        live_lq = always_redraw(lambda: tex("Q", 36, GREEN_D, "Q").move_to(S(x0 + tt.get_value(), f(x0 + tt.get_value())) + P(0.4, 0.4)))
        self.remove(ln1, dq1, lq)
        self.add(live_ln, live_q, live_lq)
        caps = {h: tex(rf"h = {h:g},\; m = {slope(h):.2f}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5) for h in (0.5, 0.1, 0.01)}
        steps = []
        for h in (0.5, 0.1, 0.01):
            steps.append((lambda h=h: [tt.animate.set_value(h), Transform(cap, caps[h])], 4))
        self.sequence("limit", steps, hold=3)

        tangent = Line(*line_in_box(Pp, np.array([1.0 * sx, fp(x0) * sy]), box), color=RED_D, stroke_width=7)
        capt = tex(rf"f'({x0}) = {fp(x0)}", 48, RED_D, "tangent").next_to(cap, DOWN, buff=0.3).align_to(cap, LEFT)
        self.sequence("tangent", [([Create(tangent)], 4), ([Write(capt)], 3), (lambda: [Indicate(capt, scale_factor=1.2)], 2.5)], hold=3)
