"""Card 3B-M: the Pythagorean theorem by dissection (two arrangements of four triangles in a square of side a + b).
Entry: lib/subjects/math/clips/pythagoras-dissection.ts."""
import math

import numpy as np
from manim import Create, FadeIn, FadeOut, Polygon, Write, Transform, VGroup, Indicate, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

COL = [BLUE_D, GREEN_D, RED_D, "#B58AE0"]


class PythagorasDissection(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("triangles", 0, 9), ("big-square", 9, 20), ("rearrange", 20, 34), ("conclude", 34, 45)]

    def construct(self):
        a, b = int(self.params["a"]), int(self.params["b"])
        c2 = a * a + b * b
        c = math.sqrt(c2)
        self.display = {"c2": c2, "c": round(c * 1000) / 1000}
        s = a + b
        u = 4.4 / s
        cx, cy = -1.0, -0.3                        # centre of the big square
        at = lambda x, y, ox=cx, oy=cy, k=1.0: P(ox + k * u * (x - s / 2), oy + k * u * (y - s / 2))
        tri = lambda R_, Pa, Pb, col, **kw: Polygon(at(*R_, **kw), at(*Pa, **kw), at(*Pb, **kw), color=col, stroke_width=4, fill_color=col, fill_opacity=0.5)

        # (right-angle vertex, end of the leg a, end of the leg b) of the four triangles in each arrangement
        first = [((0, 0), (a, 0), (0, b)), ((s, 0), (s, a), (a, 0)), ((s, s), (b, s), (s, a)), ((0, s), (0, b), (b, s))]
        second = [((0, a), (a, a), (0, s)), ((a, s), (0, s), (a, a)), ((a, 0), (a, a), (s, 0)), ((s, a), (s, 0), (a, a))]
        # a loose layout of the four triangles in a 2 x 2 block (every triangle with its legs along the axes)
        gap = 0.5
        cells = [(-1, 1), (1, 1), (-1, -1), (1, -1)]
        def loose(i):
            sx, sy = cells[i]
            ox, oy = cx + sx * (a * u / 2 + gap), cy + sy * (b * u / 2 + gap)
            R_ = (ox - a * u / 2, oy - b * u / 2)
            return Polygon(P(*R_), P(R_[0] + a * u, R_[1]), P(R_[0], R_[1] + b * u), color=COL[i], stroke_width=4, fill_color=COL[i], fill_opacity=0.5)
        tris = [loose(i) for i in range(4)]
        t0 = tris[0].get_vertices()
        la = tex("a", 36, WHITE, "a").move_to(P(*(0.5 * (t0[0] + t0[1]))[:2]) + P(0.0, -0.4))
        lb = tex("b", 36, WHITE, "b").move_to(P(*(0.5 * (t0[0] + t0[2]))[:2]) + P(-0.4, 0.0))
        lc = tex("c", 36, YELLOW_D, "c").move_to(P(*(0.5 * (t0[1] + t0[2]))[:2]) + P(0.45, 0.45))
        self.sequence("triangles", [([FadeIn(t_) for t_ in tris], 2), ([Write(la), Write(lb), Write(lc)], 1.5), (lambda: [Indicate(t_, scale_factor=1.15) for t_ in tris], 2.5)], hold=3)

        outline = Polygon(at(0, 0), at(s, 0), at(s, s), at(0, s), color=WHITE, stroke_width=5)
        mid = Polygon(at(a, 0), at(s, a), at(b, s), at(0, b), color=YELLOW_D, stroke_width=5, fill_color=YELLOW_D, fill_opacity=0.35)
        lab_s = tex("a+b", 36, WHITE, "side").move_to(at(s / 2, 0) + P(0.0, -0.45))
        lab_c2 = tex("c^2", 40, YELLOW_D, "c2").move_to(at(s / 2, s / 2))
        targets = [tri(*first[i], COL[i]) for i in range(4)]
        self.sequence("big-square", [([FadeOut(la), FadeOut(lb), FadeOut(lc), Create(outline)], 2.5),
                                     (lambda: [Transform(tris[i], targets[i]) for i in range(4)], 4), ([FadeIn(mid), Write(lab_c2), Write(lab_s)], 3)], hold=2.5)

        gaps = [Polygon(at(0, 0), at(a, 0), at(a, a), at(0, a), color=YELLOW_D, stroke_width=4, fill_color=YELLOW_D, fill_opacity=0.35),
                Polygon(at(a, a), at(s, a), at(s, s), at(a, s), color=RED_D, stroke_width=4, fill_color=RED_D, fill_opacity=0.35)]
        l_a2 = tex("a^2", 40, YELLOW_D, "a2").move_to(at(a / 2, a / 2))
        l_b2 = tex("b^2", 40, RED_D, "b2").move_to(at((a + s) / 2, (a + s) / 2))
        targets2 = [tri(*second[i], COL[i]) for i in range(4)]
        self.sequence("rearrange", [([FadeOut(mid), FadeOut(lab_c2)], 2), (lambda: [Transform(tris[i], targets2[i]) for i in range(4)], 5),
                                    ([FadeIn(gaps[0]), FadeIn(gaps[1]), Write(l_a2), Write(l_b2)], 3)], hold=2.5)

        # side by side: the first arrangement again (with c^2) and the second (with a^2, b^2), smaller
        k = 0.66
        left = [outline.copy(), mid.copy(), *[t_.copy() for t_ in targets]]
        right = VGroup(outline, *tris, *gaps)
        cap = tex(rf"{a * a} + {b * b} = {c2}", 52, tag="caption").to_corner(UP + RIGHT, buff=0.5)
        left_g = VGroup(*left)
        self.remove(l_a2, l_b2, lab_s)
        self.add(left_g)
        self.sequence("conclude", [(lambda: [left_g.animate.scale(k).move_to(P(-3.8, -0.3)), right.animate.scale(k).move_to(P(1.7, -0.3))], 4),
                                   ([Write(cap)], 3), (lambda: [Indicate(left[1], scale_factor=1.05), Indicate(gaps[0], scale_factor=1.05), Indicate(gaps[1], scale_factor=1.05)], 2.5)], hold=2.5)
