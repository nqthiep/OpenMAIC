"""Card 3B-M: the epsilon definition of a limit. Entry: lib/subjects/math/clips/limit-epsilon.ts."""
from manim import Dot, FadeIn, FadeOut, Line, Rectangle, Write, Create, LaggedStart, ValueTracker, always_redraw, VGroup, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class LimitEpsilon(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("sequence", 0, 10), ("band", 10, 21), ("find-n", 21, 36), ("shrink", 36, 48)]

    def construct(self):
        seq, eps = self.params["seq"], float(self.params["eps"])
        hund = round(eps * 100)                     # epsilon in hundredths, an integer
        L = 1 if seq == "n1-over-n" else 0
        a = lambda k: (k + 1) / k if seq == "n1-over-n" else (1 / k if seq == "inv-n" else (-1) ** k / k)
        N = 100 // hund + 1                         # the first n from which |a_n - L| = 1/n < eps, always
        N2 = 200 // hund + 1                        # and for half the epsilon
        self.display = {"L": L, "N": N}
        top = N2 + 6
        sx, sy = 11.0 / top, 2.0                    # scene units per n, and per unit of the value
        X = lambda k: -5.7 + sx * k
        Y = lambda v: -0.3 + sy * (v - L)
        axis = Line(P(X(0), Y(L)), P(X(top + 0.5), Y(L)), color=WHITE, stroke_width=4)
        lab_l = tex(rf"L={L}", 40, YELLOW_D, "L").move_to(P(6.0, Y(L) + 0.5))
        radius = max(0.04, min(0.11, sx * 0.3))
        terms = [Dot(P(X(k), Y(a(k))), color=WHITE, radius=radius) for k in range(1, top + 1)]
        self.sequence("sequence", [([Create(axis), Write(lab_l)], 2.5), ([LaggedStart(*[FadeIn(d_) for d_ in terms], lag_ratio=0.1)], 5)], hold=2.5)

        # from here the band, the dots' colours and the line at N follow trackers
        et, nt = ValueTracker(eps), ValueTracker(float(top))
        band = lambda: Rectangle(width=sx * (top + 0.5), height=2 * sy * et.get_value(), color=BLUE_D, fill_opacity=0.25, stroke_width=3).move_to(
            P(X((top + 0.5) / 2), Y(L)))
        band_static = band()
        lab_up = tex(r"L+\varepsilon", 36, BLUE_D, "up").move_to(P(-6.0, Y(L + eps) + 0.5))
        lab_dn = tex(r"L-\varepsilon", 36, BLUE_D, "down").move_to(P(-6.0, Y(L - eps) - 0.5))
        self.sequence("band", [([FadeIn(band_static)], 3), ([Write(lab_up), Write(lab_dn)], 3)], hold=3)

        self.remove(*terms, band_static)
        live_band = always_redraw(band)
        live_terms = always_redraw(lambda: VGroup(*[Dot(P(X(k), Y(a(k))), radius=radius,
                                                        color=GREEN_D if abs(a(k) - L) < et.get_value() - 1e-9 else RED_D)
                                                    for k in range(1, top + 1)]))
        vline = always_redraw(lambda: Line(P(X(nt.get_value()), -3.4), P(X(nt.get_value()), 3.0), color=YELLOW_D, stroke_width=6))
        self.add(live_band, live_terms, vline)
        cap = tex(rf"N = {N}", 48, YELLOW_D, "caption").to_corner(UP + RIGHT, buff=0.5)
        self.sequence("find-n", [(lambda: [nt.animate.set_value(N - 0.5)], 6), ([Write(cap)], 2.5)], hold=3)
        cap2 = tex(rf"N = {N2}", 48, YELLOW_D, "caption").to_corner(UP + RIGHT, buff=0.5)
        self.sequence("shrink", [(lambda: [et.animate.set_value(eps / 2), nt.animate.set_value(N2 - 0.5)], 7), ([FadeOut(cap), FadeIn(cap2)], 2.5)], hold=2.5)
