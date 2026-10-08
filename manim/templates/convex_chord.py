"""Card 3B-M: the chord of a convex graph (Jensen). Entry: lib/subjects/math/clips/convex-chord.ts."""
from manim import (Create, Dot, FadeIn, FadeOut, Line, ParametricFunction, Rectangle, Write, ValueTracker, always_redraw,
                   Transform, DOWN, UP, LEFT)
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

FUNCS = {"x2": lambda x: x * x, "abs": lambda x: abs(x), "x4": lambda x: x ** 4}


class ConvexChord(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("graph", 0, 9), ("chord", 9, 20), ("point", 20, 34), ("inequality", 34, 46)]

    def construct(self):
        p = self.params
        f = FUNCS[p["f"]]
        x1, x2, t = int(p["x1"]), int(p["x2"]), float(p["t"])
        lhs = f(t * x1 + (1 - t) * x2)
        rhs = t * f(x1) + (1 - t) * f(x2)
        self.display = {"lhs": round(lhs * 10000) / 10000, "rhs": round(rhs * 10000) / 10000}
        lo, hi = min(x1, x2) - 1, max(x1, x2) + 1
        ymax = max(1.0, max(f(lo + (hi - lo) * k / 200) for k in range(201)))
        X = lambda x: -6.0 + 10.0 * (x - lo) / (hi - lo)
        Y = lambda y: -3.0 + 4.8 * y / ymax
        axis = Line(P(X(lo), Y(0)), P(X(hi), Y(0)), color=WHITE, stroke_width=3)
        curve = ParametricFunction(lambda u: P(X(u), Y(f(u))), t_range=[lo, hi, 0.02], color=BLUE_D, stroke_width=6)
        l1 = tex("x_1", 36, GREEN_D, "x1").move_to(P(X(x1), Y(0) - 0.5))
        l2 = tex("x_2", 36, RED_D, "x2").move_to(P(X(x2), Y(0) - 0.5))
        d1 = Dot(P(X(x1), Y(0)), color=GREEN_D, radius=0.1)
        d2 = Dot(P(X(x2), Y(0)), color=RED_D, radius=0.1)
        self.sequence("graph", [([Create(axis)], 1.5), ([Create(curve)], 3), ([FadeIn(d1), FadeIn(d2), Write(l1), Write(l2)], 1.5)],
                      hold=3)

        g1 = Dot(P(X(x1), Y(f(x1))), color=GREEN_D, radius=0.11)
        g2 = Dot(P(X(x2), Y(f(x2))), color=RED_D, radius=0.11)
        v1 = Line(d1.get_center(), g1.get_center(), color=GREEN_D, stroke_width=3)
        v2 = Line(d2.get_center(), g2.get_center(), color=RED_D, stroke_width=3)
        chord = Line(g1.get_center(), g2.get_center(), color=YELLOW_D, stroke_width=6)
        self.sequence("chord", [([Create(v1), Create(v2)], 2), ([FadeIn(g1), FadeIn(g2)], 1), ([Create(chord)], 3)], hold=3)

        s = ValueTracker(0.0)   # the mixture m(s) = s x1 + (1 - s) x2, drawn from x2 (s = 0) to x1 (s = 1)
        mx = lambda: s.get_value() * x1 + (1 - s.get_value()) * x2
        on_axis = always_redraw(lambda: Dot(P(X(mx()), Y(0)), color=WHITE, radius=0.1))
        up = always_redraw(lambda: Line(P(X(mx()), Y(0)), P(X(mx()), Y(f(mx()))), color=BLUE_D, stroke_width=5))
        gp = always_redraw(lambda: Dot(P(X(mx()), Y(f(mx()))), color=BLUE_D, radius=0.11))
        cp = always_redraw(lambda: Dot(P(X(mx()), Y(s.get_value() * f(x1) + (1 - s.get_value()) * f(x2))),
                                       color=YELLOW_D, radius=0.11))
        gap = always_redraw(lambda: Line(P(X(mx()), Y(f(mx()))),
                                         P(X(mx()), Y(s.get_value() * f(x1) + (1 - s.get_value()) * f(x2))),
                                         color=RED_D, stroke_width=5))
        cap = tex(r"t:\;0 \to 1", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.add(on_axis, up, gp, cp, gap)
        self.sequence("point", [([Write(cap)], 1.5), (lambda: [s.animate.set_value(1.0)], 6), (lambda: [s.animate.set_value(0.5)], 3)],
                      hold=3)

        bar_l = Rectangle(width=0.55, height=max(Y(lhs) - Y(0), 0.02), color=BLUE_D, fill_opacity=0.7, stroke_width=2)
        bar_r = Rectangle(width=0.55, height=max(Y(rhs) - Y(0), 0.02), color=YELLOW_D, fill_opacity=0.7, stroke_width=2)
        bar_l.move_to(P(5.1, Y(0) + bar_l.height / 2))
        bar_r.move_to(P(6.0, Y(0) + bar_r.height / 2))
        bl = tex("L", 36, BLUE_D, "L").move_to(P(5.1, Y(0) - 0.5))
        br = tex("R", 36, YELLOW_D, "R").move_to(P(6.0, Y(0) - 0.5))
        cap2 = tex(rf"{lhs:.2f} \le {rhs:.2f}", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("inequality", [(lambda: [s.animate.set_value(t)], 3), ([FadeOut(cap), FadeIn(cap2)], 1.5),
                                     ([FadeIn(bar_l), Write(bl)], 2), ([FadeIn(bar_r), Write(br)], 2)], hold=3)
