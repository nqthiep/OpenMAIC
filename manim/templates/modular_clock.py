"""Card 3B-M: powers modulo n on a clock face. Entry: lib/subjects/math/clips/modular-clock.ts."""
import math

from manim import Arrow, Circle, Create, Dot, FadeIn, FadeOut, MathTex, Write, Indicate, LaggedStart, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class ModularClock(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("clock", 0, 9), ("multiply", 9, 21), ("powers", 21, 35), ("cycle", 35, 46)]

    def construct(self):
        n, a = int(self.params["n"]), int(self.params["a"])
        seen, powers, x = {}, [], a % n
        k = 0
        while x not in seen:
            seen[x] = k
            powers.append(x)
            x = (x * a) % n
            k += 1
        start, period = seen[x], k - seen[x]
        self.display = {"period": period}
        R = 2.9
        cx, cy = 3.2, -0.2
        at = lambda i, r=R: P(cx + r * math.sin(2 * math.pi * i / n), cy + r * math.cos(2 * math.pi * i / n))
        ring = Circle(radius=R, color=WHITE, stroke_width=4).move_to(P(cx, cy))
        dots = [Dot(at(i), color=WHITE, radius=0.09) for i in range(n)]
        # the numbers 0..n-1 are the parts of ONE text object, each part set at its place on the ring
        nums = MathTex(*[str(i) for i in range(n)], font_size=28)
        nums.label_id = "numbers"
        for i, part in enumerate(nums):
            part.move_to(at(i, R + 0.42))
        self.sequence("clock", [([Create(ring)], 3), ([LaggedStart(*[FadeIn(d_) for d_ in dots], lag_ratio=0.1)], 3), ([Write(nums)], 2)], hold=2.5)

        # a -> a^2 -> a^3 ... mod n as arrows between the points of the ring
        order = powers + [powers[start]]
        arrows = [Arrow(at(order[i]), at(order[i + 1]), buff=0.12, color=YELLOW_D, stroke_width=5, max_tip_length_to_length_ratio=0.25)
                  for i in range(len(order) - 1) if order[i] != order[i + 1]]
        marks = {v: Dot(at(v), color=YELLOW_D, radius=0.15) for v in set(powers)}
        cap = tex(rf"x \mapsto {a}x \bmod {n}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        steps = [([Write(cap)], 2)]
        per = [(lambda ar=ar: [Create(ar)], 1.0) for ar in arrows]
        self.sequence("multiply", steps + per, hold=2.5)

        # the sequence written out in rows of at most 8 values (one text object per row)
        vals = order
        rows = []
        for r0 in range(0, len(vals), 8):
            chunk = vals[r0:r0 + 8]
            parts = []
            for i, v in enumerate(chunk):
                parts.append(str(v))
                if i < len(chunk) - 1:
                    parts.append(r"\to")
            row = MathTex(*parts, font_size=36)
            row.label_id = f"row{r0 // 8}"
            row.move_to(P(-3.6, 1.5 - 0.9 * (r0 // 8)))
            row.align_to(P(-6.4, 0), LEFT)
            rows.append(row)
        self.sequence("powers", [(lambda r=r: [Write(r)], 2.5) for r in rows] + [(lambda: [Indicate(m_, scale_factor=1.5) for m_ in marks.values()], 2.5)], hold=2.5)

        cyc = [powers[i] for i in range(start, len(powers))]
        cap2 = tex(rf"\text{{period}} = {period}", 48, YELLOW_D, "caption").to_corner(UP + LEFT, buff=0.5)
        self.remove(cap)
        self.sequence("cycle", [([Write(cap2)], 2.5), (lambda: [Indicate(marks[v], scale_factor=1.8, color=RED_D) for v in cyc], 3),
                                (lambda: [Indicate(marks[v], scale_factor=1.8, color=RED_D) for v in cyc], 3)], hold=2.5)
