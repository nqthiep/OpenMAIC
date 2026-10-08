"""Card 3B-M: the Euclidean algorithm with squares. Entry: lib/subjects/math/clips/euclid-rectangle.ts."""
import math

from manim import VGroup, Create, FadeIn, FadeOut, Rectangle, Write, Indicate, Transform, LaggedStart, UP, LEFT, DOWN, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

PALETTE = [BLUE_D, GREEN_D, RED_D, "#B58AE0", "#E0905A", "#5AC8B8"]


class EuclidRectangle(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("rectangle", 0, 9), ("squares", 9, 21), ("repeat", 21, 35), ("gcd", 35, 46)]

    def construct(self):
        a, b = int(self.params["a"]), int(self.params["b"])
        big, small = max(a, b), min(a, b)
        # cuts: [(side, count, square origins, equation)] while the rectangle shrinks
        x0, y0, w, h = 0, 0, big, small
        cuts = []
        while w > 0 and h > 0:
            if w >= h:
                n, side = w // h, h
                sq = [(x0 + k * side, y0) for k in range(n)]
                eq = (w, n, side, w - n * side)
                x0, w = x0 + n * side, w - n * side
            else:
                n, side = h // w, w
                sq = [(x0, y0 + k * side) for k in range(n)]
                eq = (h, n, side, h - n * side)
                y0, h = y0 + n * side, h - n * side
            cuts.append((side, n, sq, eq))
        g = cuts[-1][0]
        self.display = {"gcd": g, "squares": sum(c[1] for c in cuts)}
        s = min(10.5 / big, 5.2 / small, 1.0)
        ox, oy = -big * s / 2, -small * s / 2 - 0.3
        sq_of = lambda ox_, oy_, side, color, op=0.5: Rectangle(
            width=side * s, height=side * s, color=color, fill_opacity=op, stroke_width=2 if s > 0.3 else 1).move_to(
            P(ox + (ox_ + side / 2) * s, oy + (oy_ + side / 2) * s))

        frame = Rectangle(width=big * s, height=small * s, color=WHITE, stroke_width=4).move_to(P(0, oy + small * s / 2))
        la = tex(str(big), 40, tag="width").next_to(frame, DOWN, buff=0.2)
        lb = tex(str(small), 40, tag="height").next_to(frame, LEFT, buff=0.2)
        self.sequence("rectangle", [([Create(frame)], 3), ([Write(la), Write(lb)], 2)], hold=3)

        squares = []
        for i, (side, n, origins, eq) in enumerate(cuts):
            squares.append([sq_of(px, py, side, PALETTE[i % len(PALETTE)]) for px, py in origins])
        # first cut, with its equation
        x, q, y, r = cuts[0][3]
        eq0 = tex(rf"{x} = {q}\cdot {y} + {r}", 48, tag="equation").to_corner(UP + LEFT, buff=0.5)
        self.sequence("squares", [(lambda: [LaggedStart(*[FadeIn(m) for m in squares[0]], lag_ratio=0.15)], 5), ([Write(eq0)], 3)],
                      hold=3)

        # the rest of the cuts; each step swaps the equation
        steps = []
        prev = eq0
        for i in range(1, len(cuts)):
            x, q, y, r = cuts[i][3]
            new = tex(rf"{x} = {q}\cdot {y} + {r}", 48, tag="equation").to_corner(UP + LEFT, buff=0.5)
            steps.append((lambda i=i: [LaggedStart(*[FadeIn(m) for m in squares[i]], lag_ratio=0.15)], 3))
            steps.append((lambda prev=prev, new=new: [Transform(prev, new)], 1.5))
        if not steps:  # a single cut: say that nothing is left over
            all0 = VGroup(*squares[0])
            steps = [(lambda: [Indicate(all0, scale_factor=1.05, color=YELLOW_D)], 3), ([Indicate(eq0, scale_factor=1.3)], 3),
                     (lambda: [Indicate(all0, scale_factor=1.05, color=YELLOW_D)], 3), ([Indicate(eq0, scale_factor=1.3)], 3)]
        self.sequence("repeat", steps, hold=3)

        last = squares[-1]
        cap = tex(rf"\gcd({a},{b}) = {g}", 48, tag="caption")
        cap.to_corner(UP + LEFT, buff=0.5)
        self.sequence("gcd", [([FadeOut(eq0), Write(cap)], 2.5),
                              (lambda: [m.animate.set_fill(YELLOW_D, 0.95) for m in last], 3),
                              ([Indicate(cap, scale_factor=1.2)], 2.5)], hold=3)
