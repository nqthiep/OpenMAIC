"""Card 3B-M: domino tilings and colouring (a chessboard with two cells removed). Entry: lib/subjects/math/clips/tiling-coloring.ts."""
from manim import Create, FadeIn, FadeOut, Line, Rectangle, Write, LaggedStart, Indicate, VGroup, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

DARK, LIGHT = "#0B0E15", "#E8E8E8"


class TilingColoring(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("board", 0, 9), ("color", 9, 20), ("count", 20, 34), ("conclude", 34, 46)]

    def construct(self):
        n, kind = int(self.params["n"]), self.params["removed"]
        removed = [(0, 0), (n - 1, n - 1)] if kind == "opposite-corners" else [(0, 0), (0, 1)]
        black = white = 0
        for r in range(n):
            for c in range(n):
                if (r, c) in removed:
                    continue
                if (r + c) % 2 == 0:
                    black += 1
                else:
                    white += 1
        self.display = {"black": black, "white": white}
        s = 5.0 / n
        x0, y0 = -3.6 - n * s / 2, -n * s / 2 - 0.2
        cell = lambda r, c: P(x0 + (c + 0.5) * s, y0 + (n - 1 - r + 0.5) * s)   # row 0 at the top
        sq = lambda r, c, col, op: Rectangle(width=s, height=s, color=WHITE, stroke_width=2, fill_color=col, fill_opacity=op).move_to(cell(r, c))
        outline = Rectangle(width=n * s, height=n * s, color=WHITE, stroke_width=5).move_to(P(x0 + n * s / 2, y0 + n * s / 2))
        grid = [Line(P(x0, y0 + k * s), P(x0 + n * s, y0 + k * s), color=WHITE, stroke_width=2, stroke_opacity=0.5) for k in range(1, n)] + \
               [Line(P(x0 + k * s, y0), P(x0 + k * s, y0 + n * s), color=WHITE, stroke_width=2, stroke_opacity=0.5) for k in range(1, n)]
        holes = [Rectangle(width=s, height=s, color=RED_D, stroke_width=4, fill_color="#20263A", fill_opacity=1.0).move_to(cell(*rc)) for rc in removed]
        dom_a = Rectangle(width=2 * s, height=s, color=YELLOW_D, stroke_width=6, fill_color=YELLOW_D, fill_opacity=0.3).move_to(P(4.2, 1.0))
        self.sequence("board", [([Create(outline), *[Create(g_) for g_ in grid]], 3), ([FadeIn(h_) for h_ in holes], 2), ([FadeIn(dom_a)], 2)], hold=2.5)

        cells = [sq(r, c, DARK if (r + c) % 2 == 0 else LIGHT, 0.85) for r in range(n) for c in range(n) if (r, c) not in removed]
        crosses = []
        for rc in removed:
            p_ = cell(*rc)
            crosses += [Line(p_ + P(-0.3 * s, -0.3 * s), p_ + P(0.3 * s, 0.3 * s), color=RED_D, stroke_width=8), Line(p_ + P(-0.3 * s, 0.3 * s), p_ + P(0.3 * s, -0.3 * s), color=RED_D, stroke_width=8)]
        self.sequence("color", [([LaggedStart(*[FadeIn(c_) for c_ in cells], lag_ratio=0.04)], 6), ([Create(x_) for x_ in crosses], 2.5)], hold=2.5)

        icon_b = Rectangle(width=0.5, height=0.5, color=WHITE, stroke_width=3, fill_color=DARK, fill_opacity=1).move_to(P(3.6, 1.3))
        icon_w = Rectangle(width=0.5, height=0.5, color=WHITE, stroke_width=3, fill_color=LIGHT, fill_opacity=1).move_to(P(3.6, 0.2))
        nb = tex(rf"= {black}", 52, tag="black").next_to(icon_b, RIGHT, buff=0.4)
        nw = tex(rf"= {white}", 52, tag="white").next_to(icon_w, RIGHT, buff=0.4)
        self.remove(dom_a)
        self.sequence("count", [([FadeIn(icon_b), Write(nb)], 3), ([FadeIn(icon_w), Write(nw)], 3), (lambda: [Indicate(nb, scale_factor=1.3), Indicate(nw, scale_factor=1.3)], 3)], hold=2.5)

        if kind == "opposite-corners":
            neq = tex(rf"{black} \ne {white}", 56, RED_D, "caption").move_to(P(4.2, -1.3))
            big = [Line(P(x0, y0), P(x0 + n * s, y0 + n * s), color=RED_D, stroke_width=12), Line(P(x0, y0 + n * s), P(x0 + n * s, y0), color=RED_D, stroke_width=12)]
            self.sequence("conclude", [([Write(neq)], 3), ([Create(b_) for b_ in big], 3), (lambda: [Indicate(neq, scale_factor=1.3)], 3)], hold=2.5)
        else:
            doms = []
            for r in range(n):
                for c in range(2 if r == 0 else 0, n, 2):
                    mid = (cell(r, c) + cell(r, c + 1)) / 2
                    doms.append(Rectangle(width=2 * s - 0.1, height=s - 0.1, color=GREEN_D, stroke_width=5, fill_color=GREEN_D, fill_opacity=0.3).move_to(mid))
            eq = tex(rf"{black} = {white}", 56, GREEN_D, "caption").move_to(P(4.2, -1.3))
            self.sequence("conclude", [([LaggedStart(*[FadeIn(d_) for d_ in doms], lag_ratio=0.08)], 6), ([Write(eq)], 3)], hold=2.5)
