"""Card 3B-M: algebraic identities as areas (square-sum: (a+b)^2; diff-squares: a^2 - b^2 = (a+b)(a-b)).
Entry: lib/subjects/math/clips/alg-identity-area.ts. Letters and formulas only."""
import math

import numpy as np
from manim import Create, FadeIn, FadeOut, Line, Rectangle, Rotate, Indicate, Transform, Write, VGroup, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class AlgIdentityArea(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("figure", 0, 10), ("decompose", 10, 22), ("rearrange", 22, 36), ("formula", 36, 46)]

    def construct(self):
        kind, a, b = self.params["id"], int(self.params["a"]), int(self.params["b"])
        a2, b2 = a * a, b * b
        s = 5.0 / (a + b)
        height = (a + b) * s if kind == "square-sum" else a * s
        x0, y0 = -(a + b) * s / 2 - 1.5, -height / 2 - 0.2  # figure origin (lower left); room on the right for the formula

        def rect(x, y, w, h, color, op=0.55):
            return Rectangle(width=w * s, height=h * s, color=color, fill_opacity=op, stroke_width=3).move_to(
                P(x0 + (x + w / 2) * s, y0 + (y + h / 2) * s))

        def lab(text, x, y, w, h, color=WHITE, tag=None):
            size = max(28, min(40, 60 * min(w, h) * s))
            return tex(text, size, color, tag).move_to(P(x0 + (x + w / 2) * s, y0 + (y + h / 2) * s))

        if kind == "square-sum":
            self.display = {"total": (a + b) ** 2, "a2": a2, "ab": a * b, "b2": b2}
            outline = Rectangle(width=(a + b) * s, height=(a + b) * s, color=WHITE, stroke_width=4).move_to(
                P(x0 + (a + b) * s / 2, y0 + (a + b) * s / 2))
            ta = tex("a", 36, GREEN_D, "side-a").next_to(P(x0 + a * s / 2, y0), DOWN, buff=0.2)
            tb = tex("b", 36, RED_D, "side-b").next_to(P(x0 + (a + b / 2) * s, y0), DOWN, buff=0.2)
            self.sequence("figure", [([Create(outline)], 3), ([Write(ta), Write(tb)], 1.5)], hold=3.5)
            parts = [rect(0, 0, a, a, GREEN_D), rect(a, 0, b, a, YELLOW_D), rect(0, a, a, b, YELLOW_D),
                     rect(a, a, b, b, RED_D)]
            labels = [lab("a^2", 0, 0, a, a, tag="a2"), lab("ab", a, 0, b, a, tag="ab1"),
                      lab("ab", 0, a, a, b, tag="ab2"), lab("b^2", a, a, b, b, tag="b2")]
            self.sequence("decompose", [([FadeIn(p) for p in parts], 3), ([Write(t) for t in labels], 3)])
            gap = 0.5
            shifts = [P(-gap, -gap), P(gap, -gap), P(-gap, gap), P(gap, gap)]
            apart = [p.animate.shift(sh) for p, sh in zip(parts, shifts)] + [t.animate.shift(sh) for t, sh in zip(labels, shifts)]
            back = lambda: [p.animate.shift(-sh) for p, sh in zip(parts, shifts)] + [t.animate.shift(-sh) for t, sh in zip(labels, shifts)]
            pulses = [([Indicate(t, scale_factor=1.4)], 1.5) for t in labels]
            self.sequence("rearrange", [(apart, 3)] + pulses + [(back, 3)])
            f1 = tex(r"(a+b)^2", 48, tag="lhs").move_to(P(4.2, 1.0))
            f2 = tex(r"=\,a^2+2ab+b^2", 48, tag="rhs").move_to(P(4.2, 0.0))
            f3 = tex(rf"{(a + b) ** 2} = {a2} + {2 * a * b} + {b2}", 40, tag="numbers").move_to(P(4.2, -1.2))
            self.sequence("formula", [([Write(f1)], 2), ([Write(f2)], 3), ([Write(f3)], 3)])
        else:
            if a <= b:
                raise ValueError("diff-squares needs a > b")
            self.display = {"a2": a2, "b2": b2, "diff": a2 - b2, "prod": (a + b) * (a - b)}
            outline = Rectangle(width=a * s, height=a * s, color=WHITE, stroke_width=4).move_to(
                P(x0 + a * s / 2, y0 + a * s / 2))
            ta = tex("a", 36, GREEN_D, "side-a").next_to(P(x0 + a * s / 2, y0), DOWN, buff=0.2)
            corner = rect(a - b, a - b, b, b, RED_D, 0.25)
            tb = tex("b", 36, RED_D, "side-b").next_to(P(x0 + (a - b / 2) * s, y0 + a * s), UP, buff=0.15)
            self.sequence("figure", [([Create(outline)], 3), ([Write(ta), Write(tb)], 1.5)], hold=3.5)
            r1 = rect(0, 0, a, a - b, GREEN_D)                 # bottom strip, a wide
            r2 = rect(0, a - b, a - b, b, YELLOW_D)           # upper left piece
            l1 = lab("a(a-b)", 0, 0, a, a - b, tag="strip")
            l2 = lab("b(a-b)", 0, a - b, a - b, b, tag="piece")
            self.sequence("decompose", [([FadeIn(corner)], 2), ([FadeIn(r1), FadeIn(r2)], 3),
                                        ([Write(l1), Write(l2)], 3)])
            # r2 turns a quarter and joins the right end of r1: one rectangle (a+b) by (a-b)
            target = P(x0 + (a + b / 2) * s, y0 + (a - b) * s / 2)
            wl = tex(r"a+b", 36, tag="width").next_to(P(x0 + (a + b) * s / 2, y0), DOWN, buff=0.2)
            hl = tex(r"a-b", 36, tag="height").next_to(P(x0 + (a + b) * s, y0 + (a - b) * s / 2), RIGHT, buff=0.2)
            self.sequence("rearrange", [([FadeOut(corner), FadeOut(l2), FadeOut(ta), FadeOut(tb), FadeOut(outline)], 1.5),
                                        ([Rotate(r2, -math.pi / 2), ], 3), (lambda: [r2.animate.move_to(target)], 3),
                                        ([Write(wl), Write(hl)], 2)])
            f1 = tex(r"a^2-b^2", 48, tag="lhs").move_to(P(4.7, 1.0))
            f2 = tex(r"=\,(a+b)(a-b)", 48, tag="rhs").move_to(P(4.7, 0.0))
            f3 = tex(rf"{a2} - {b2} = {a + b} \cdot {a - b}", 40, tag="numbers").move_to(P(4.7, -1.2))
            self.sequence("formula", [([Write(f1)], 2), ([Write(f2)], 3), ([Write(f3)], 3)])
