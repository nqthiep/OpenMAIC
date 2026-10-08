"""Card 3B-M: figurate sums (1+3+...+(2n-1) = n^2 and 1+2+...+n = n(n+1)/2). Entry: lib/subjects/math/clips/figurate-sums.ts."""
import math

from manim import (Dot, FadeIn, FadeOut, Line, LaggedStart, Rotate, Write, Create, VGroup, Indicate, UP, DOWN, LEFT, RIGHT)
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

PALETTE = [BLUE_D, GREEN_D, RED_D, YELLOW_D, "#B58AE0", "#E0905A", "#5AC8B8"]


class FigurateSums(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("dots", 0, 10), ("grow", 10, 23), ("count", 23, 36), ("induction", 36, 48)]

    def construct(self):
        kind, n = self.params["series"], int(self.params["n"])
        total = n * n if kind == "odd" else n * (n + 1) // 2
        self.display = {"n": n, "sum": total}
        d = min(0.62, 6.0 / (2 * n))
        top = 2.0
        col = lambda k: PALETTE[(k - 1) % len(PALETTE)]

        if kind == "odd":
            # row k has 2k-1 dots, centred (a pyramid); later each row becomes the k-th L-shaped layer of an n x n square
            rows = [[Dot(P((j - (k - 1)) * d, top - (k - 1) * d - 0.3), color=col(k), radius=0.13 * d / 0.62 + 0.03)
                     for j in range(2 * k - 1)] for k in range(1, n + 1)]
            cells = lambda k: [(k - 1, j) for j in range(k)] + [(i, k - 1) for i in range(k - 2, -1, -1)]
            to = lambda i, j: P((i - (n - 1) / 2) * d - 1.5, (j - (n - 1) / 2) * d - 0.2)
            moves = lambda: [dot.animate.move_to(to(*cell)) for k in range(1, n + 1) for dot, cell in zip(rows[k - 1], cells(k))]
        else:
            # a staircase: row k has k dots, left aligned in a grid of n+1 columns
            grid = lambda c, r: P((c - n / 2) * d - 1.5, top - r * d - 0.3)
            rows = [[Dot(grid(c, k - 1), color=col(k), radius=0.13 * d / 0.62 + 0.03) for c in range(k)] for k in range(1, n + 1)]
        everything = VGroup(*[x for r in rows for x in r])
        steps = [(lambda r=r: [LaggedStart(*[FadeIn(x) for x in r], lag_ratio=0.2)], 1) for r in rows]
        terms = ", ".join(str(2 * j - 1 if kind == "odd" else j) for j in range(1, min(n, 4) + 1))
        head = tex(rf"{terms}, \ldots", 48, tag="terms").to_corner(UP + LEFT, buff=0.5)
        self.sequence("dots", steps + [([Write(head)], 2), (lambda: [Indicate(x, scale_factor=1.5) for x in everything], 2.5),
                                       (lambda: [Indicate(x, scale_factor=1.5) for x in everything], 2.5)], hold=2.5)

        if kind == "odd":
            self.sequence("grow", [(moves, 7), (lambda: [Indicate(x, scale_factor=1.5) for x in rows[-1]], 3)], hold=3)
            w = n * d
            lab_w = tex("n", 40, tag="n-width").move_to(P(-1.5, -(n - 1) * d / 2 - 0.2 - w / 2 - 0.5))
            lab_h = tex("n", 40, tag="n-height").move_to(P(-1.5 - w / 2 - 0.5, -0.2))
            cap = tex(rf"1+3+\cdots+{2 * n - 1} = {n}^2 = {total}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
            self.sequence("count", [([Write(lab_w), Write(lab_h)], 2), ([FadeOut(head), Write(cap)], 2.5), (lambda: [Indicate(x, scale_factor=1.4) for x in everything], 3)], hold=3)
            # induction: the first n-1 layers dim, the last layer (2n-1 dots) lights up
            ind = tex(rf"S_k + (2k+1) = S_{{k+1}}", 44, tag="induction").move_to(P(4.3, 0.0))
            old = [x for r in rows[:-1] for x in r]
            self.sequence("induction", [(lambda: [x.animate.set_opacity(0.3) for x in old], 3),
                                        (lambda: [Indicate(x, scale_factor=1.6) for x in rows[-1]], 3), ([Write(ind)], 3)], hold=2.5)
        else:
            # a second staircase, turned half a turn about the centre of the n x (n+1) rectangle, completes it
            copy = VGroup(*[x.copy().set_color(WHITE) for x in everything])
            centre = grid(n / 2, (n - 1) / 2)
            self.add(copy)
            self.sequence("grow", [(lambda: [Rotate(copy, math.pi, about_point=centre)], 5), (lambda: [Indicate(x, scale_factor=1.4) for x in copy], 3)], hold=3)
            lab_w = tex(rf"{n + 1}", 40, tag="n+1").move_to(P(-1.5, top - n * d - 0.3 - 0.2))
            lab_h = tex(rf"{n}", 40, tag="n").move_to(P(-1.5 - (n + 1) * d / 2 - 0.5, top - (n - 1) * d / 2 - 0.3))
            cap = tex(rf"2S = {n}\cdot {n + 1}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
            self.sequence("count", [([Write(lab_w), Write(lab_h)], 2), ([FadeOut(head), Write(cap)], 2.5), (lambda: [Indicate(x, scale_factor=1.4) for x in everything], 3)], hold=3)
            cap2 = tex(rf"1+2+\cdots+{n} = {total}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
            ind = tex(r"S_k + (k+1) = S_{k+1}", 44, tag="induction").move_to(P(4.3, 0.0))
            old = [x for r in rows[:-1] for x in r]
            self.sequence("induction", [([FadeOut(copy), FadeOut(lab_w), FadeOut(lab_h), FadeOut(cap), FadeIn(cap2)], 2),
                                        (lambda: [x.animate.set_opacity(0.3) for x in old], 2.5),
                                        (lambda: [Indicate(x, scale_factor=1.6) for x in rows[-1]], 3), ([Write(ind)], 2.5)], hold=2.5)
