"""Card 3B-M: lattice paths and Pascal's rule. Entry: lib/subjects/math/clips/lattice-paths.ts."""
import math

from manim import Create, Dot, FadeIn, FadeOut, Line, MathTex, Write, Indicate, LaggedStart, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

COLORS = [BLUE_D, GREEN_D, RED_D, YELLOW_D]


class LatticePaths(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("grid", 0, 9), ("paths", 9, 21), ("pascal", 21, 35), ("binomial", 35, 46)]

    def construct(self):
        m, n = int(self.params["m"]), int(self.params["n"])
        g = [[1 if r == 0 or c == 0 else 0 for c in range(m + 1)] for r in range(n + 1)]
        for r in range(1, n + 1):
            for c in range(1, m + 1):
                g[r][c] = g[r - 1][c] + g[r][c - 1]
        count = g[n][m]
        self.display = {"count": count}
        s = min(1.1, 7.5 / m, 4.4 / n)
        x0, y0 = -3.0 - m * s / 2, -n * s / 2 - 0.2
        pt = lambda c, r: P(x0 + c * s, y0 + r * s)
        lines = [Line(pt(0, r), pt(m, r), color=WHITE, stroke_width=3, stroke_opacity=0.6) for r in range(n + 1)] + \
                [Line(pt(c, 0), pt(c, n), color=WHITE, stroke_width=3, stroke_opacity=0.6) for c in range(m + 1)]
        dots = [Dot(pt(c, r), color=WHITE, radius=0.07) for r in range(n + 1) for c in range(m + 1)]
        ls = tex("S", 40, GREEN_D, "start").move_to(pt(0, 0) + P(-0.45, -0.4))
        lf = tex("F", 40, RED_D, "finish").move_to(pt(m, n) + P(0.45, 0.4))
        self.sequence("grid", [([Create(l_) for l_ in lines], 3), ([FadeIn(d_) for d_ in dots], 1.5), ([Write(ls), Write(lf)], 2)], hold=2.5)

        def path(moves, shift):
            c = r = 0
            pts = [pt(0, 0)]
            for mv in moves:
                c, r = (c + 1, r) if mv == "R" else (c, r + 1)
                pts.append(pt(c, r))
            return [Line(pts[i] + shift, pts[i + 1] + shift, color=COLORS[0], stroke_width=9) for i in range(len(pts) - 1)]
        R, U = "R" * m, "U" * n
        alt = "".join(("R" if i % 2 == 0 and i // 2 < m else "U") if (i // 2 < m or i // 2 < n) else "" for i in range(2 * max(m, n)))
        rs, us = m, n
        stair = []
        while rs > 0 or us > 0:
            if rs > 0:
                stair.append("R"); rs -= 1
            if us > 0:
                stair.append("U"); us -= 1
        routes = [R + U, U + R, "".join(stair), ("U" * (n // 2) + "R" * m + "U" * (n - n // 2))]
        paths = []
        for k, mv in enumerate(routes):
            segs = path(mv, P(0.06 * (k - 1.5), 0.06 * (1.5 - k)))
            for sg in segs:
                sg.set_color(COLORS[k])
            paths.append(segs)
        self.sequence("paths", [([Create(sg) for sg in paths[k]], 2.5) for k in range(4)] + [([Indicate(lf, scale_factor=1.6)], 1.5)], hold=2.5)

        # Pascal: each number is the sum of the one to its left and the one below; one text object per row
        rows = []
        for r in range(n + 1):
            row = MathTex(*[str(g[r][c]) for c in range(m + 1)], font_size=36)
            row.label_id = f"row{r}"
            for c, part in enumerate(row):
                part.move_to(pt(c, r))
            rows.append(row)
        self.remove(*[sg for p_ in paths for sg in p_], ls, lf)
        steps = [(lambda r=r: [Write(rows[r])], 1.4) for r in range(n + 1)]
        self.sequence("pascal", steps + [(lambda: [Indicate(rows[n][m], scale_factor=1.8, color=YELLOW_D)], 2)], hold=2.5)

        cap = tex(rf"\binom{{{m + n}}}{{{n}}} = {count}", 52, tag="caption").to_corner(UP + RIGHT, buff=0.5)
        self.sequence("binomial", [([Write(cap)], 3), (lambda: [Indicate(rows[n][m], scale_factor=2.0, color=YELLOW_D)], 3), (lambda: [Indicate(cap, scale_factor=1.2)], 2.5)], hold=2.5)
