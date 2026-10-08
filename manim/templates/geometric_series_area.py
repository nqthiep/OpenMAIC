"""Card 3B-M: the geometric series r + r^2 + ... as areas. Entry: lib/subjects/math/clips/geometric-series-area.ts."""
from manim import Create, FadeIn, FadeOut, Line, Rectangle, DashedLine, Write, Transform, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

PALETTE = [BLUE_D, GREEN_D, RED_D, YELLOW_D, "#B58AE0", "#E0905A", "#5AC8B8"]


class GeometricSeriesArea(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("square", 0, 9), ("cut", 9, 21), ("repeat", 21, 35), ("sum", 35, 46)]

    def construct(self):
        den = {"1/2": 2, "1/3": 3, "1/4": 4}[self.params["r"]]
        q = 1.0 / den
        partial = lambda k: sum(q ** j for j in range(1, k + 1))
        limit = 1.0 / (den - 1)
        self.display = {"limit": round(limit * 10000) / 10000, "s5": round(partial(5) * 10000) / 10000}
        L = 4.5
        x0, y0 = -6.2, -2.2   # lower left corner of the unit square
        square = Rectangle(width=L, height=L, color=WHITE, stroke_width=5).move_to(P(x0 + L / 2, y0 + L / 2))
        one = tex("1", 40, tag="side").next_to(square, DOWN, buff=0.25)
        self.sequence("square", [([Create(square)], 4), ([Write(one)], 1.5)], hold=3)

        # piece k: a strip of width r^k and full height, laid left to right
        left = [x0]
        strips = []
        for k in range(1, 8):
            w = L * q ** k
            strips.append(Rectangle(width=w, height=L, color=PALETTE[(k - 1) % len(PALETTE)], fill_opacity=0.55,
                                    stroke_width=2).move_to(P(left[-1] + w / 2, y0 + L / 2)))
            left.append(left[-1] + w)
        lab_r = tex(rf"r = \frac{{1}}{{{den}}}", 44, BLUE_D, "r").move_to(P(x0 + L * q / 2, y0 - 0.7))
        cap = tex("r", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("cut", [([FadeIn(strips[0])], 4), ([Write(lab_r)], 2.5), ([Write(cap)], 2)], hold=3)

        cap2 = tex(r"r + r^2 + r^3 + \cdots", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        steps = [(lambda k=k: [FadeIn(strips[k])], 1.4) for k in range(1, 7)] + [([Transform(cap, cap2)], 2)]
        self.sequence("repeat", steps, hold=3)

        # partial sums as a bar under the square, and the limit as a dashed line
        xl = x0 + L * limit
        mark = DashedLine(P(xl, y0 - 0.2), P(xl, y0 + L + 0.2), color=YELLOW_D, stroke_width=6)
        bar = Rectangle(width=L * q, height=0.3, color=BLUE_D, fill_opacity=0.8, stroke_width=2).move_to(P(x0 + L * q / 2, y0 - 1.4))
        def bar_at(k):
            w = L * partial(k)
            return Rectangle(width=w, height=0.3, color=BLUE_D, fill_opacity=0.8, stroke_width=2).move_to(P(x0 + w / 2, y0 - 1.4))
        lim_lab = tex(rf"\frac{{1}}{{{den - 1}}}", 44, YELLOW_D, "limit").move_to(P(xl + 0.9, y0 + L / 2))
        cap3 = tex(r"\sum = \frac{r}{1-r}", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        steps = [([Create(mark), Write(lim_lab)], 2), ([FadeIn(bar)], 1)]
        steps += [(lambda k=k: [Transform(bar, bar_at(k))], 1.2) for k in range(2, 6)]
        steps += [([FadeOut(cap), FadeIn(cap3)], 1.5)]
        self.sequence("sum", steps, hold=2.5)
