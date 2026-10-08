"""Card 3B-M: left Riemann sums approaching the integral. Entry: lib/subjects/math/clips/riemann-integral.ts."""
import math

from manim import Create, FadeIn, FadeOut, Line, Polygon, Rectangle, Write, Transform, VGroup, LaggedStart, Indicate, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, plot, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class RiemannIntegral(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("area", 0, 9), ("rectangles", 9, 21), ("refine", 21, 35), ("limit", 35, 46)]

    def construct(self):
        c, a, b, n = [int(v) for v in self.params["c"]], int(self.params["a"]), int(self.params["b"]), int(self.params["n"])
        f = lambda x: sum(k * x ** i for i, k in enumerate(c))
        F = lambda x: sum(k * x ** (i + 1) / (i + 1) for i, k in enumerate(c))
        left_sum = lambda m_: sum(f(a + k * (b - a) / m_) * (b - a) / m_ for k in range(m_))
        exact = F(b) - F(a)
        r4 = lambda v: round(v * 10000) / 10000 + 0.0
        self.display = {"sum": r4(left_sum(n)), "exact": r4(exact)}
        xs = [a + (b - a) * i / 200 for i in range(201)]
        ys = [f(x) for x in xs]
        lo, hi = min(0.0, min(ys)), max(0.0, max(ys))
        span = max(hi - lo, 1e-9)
        sy = min(1.6, 4.6 / span)
        sx = min(2.2, 9.0 / (b - a))
        x_mid = (a + b) / 2
        y_mid = (lo + hi) / 2
        S = lambda x, y: P(-1.0 + sx * (x - x_mid), -0.2 + sy * (y - y_mid))
        axis = Line(S(a - 0.5, 0), S(b + 0.5, 0), color=WHITE, stroke_width=4)
        graph = plot(f, a, b, S, color=BLUE_D)
        area = Polygon(S(a, 0), *[S(x, y) for x, y in zip(xs, ys)], S(b, 0), color=BLUE_D, stroke_width=0, fill_color=BLUE_D, fill_opacity=0.3)
        self.sequence("area", [([Create(axis)], 2), ([Create(graph)], 3), ([FadeIn(area)], 2)], hold=2.5)

        def rects(m_):
            dx = (b - a) / m_
            out = VGroup()
            for k in range(m_):
                x = a + k * dx
                y = f(x)
                r = Polygon(S(x, 0), S(x + dx, 0), S(x + dx, y), S(x, y), color=GREEN_D if y >= 0 else RED_D, stroke_width=2 if m_ <= 16 else 1,
                            fill_color=GREEN_D if y >= 0 else RED_D, fill_opacity=0.45)
                out.add(r)
            return out
        r0 = rects(n)
        cap = tex(rf"L_{{{n}}}", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("rectangles", [([FadeOut(area)], 1.5), ([LaggedStart(*[FadeIn(r_) for r_ in r0], lag_ratio=0.15)], 5), ([Write(cap)], 2.5)], hold=3)

        n2, n3 = min(2 * n, 64), min(4 * n, 64)
        cap2 = tex(rf"L_{{{n2}}}", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        cap3 = tex(rf"L_{{{n3}}}", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("refine", [(lambda: [Transform(r0, rects(n2)), Transform(cap, cap2)], 4.5), (lambda: [Transform(r0, rects(n3)), Transform(cap, cap3)], 4.5),
                                 (lambda: [Transform(r0, rects(n))], 2.5)], hold=3)
        cap4 = tex(rf"L_{{{n}}} = {left_sum(n):.3f}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        cap5 = tex(rf"\int_{{{a}}}^{{{b}}} f = {exact:.3f}", 44, YELLOW_D, "integral").next_to(cap4, DOWN, buff=0.3).align_to(cap4, LEFT)
        self.sequence("limit", [([Transform(cap, cap4)], 2.5), ([Write(cap5)], 3), (lambda: [Indicate(cap5, scale_factor=1.2)], 2.5)], hold=3)
