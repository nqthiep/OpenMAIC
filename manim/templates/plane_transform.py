"""Card 3B-M: transformations of the plane (rotation, reflection, homothety, multiplication by i) on a triangle.
Entry: lib/subjects/math/clips/plane-transform.ts."""
import math

import numpy as np
from manim import Create, Dot, FadeIn, FadeOut, Line, Polygon, Write, ValueTracker, always_redraw, Arc, Arrow, Indicate, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, View, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


def image(mode, x, y):
    return (-y, x) if mode in ("rotate90", "mult-i") else ((x, -y) if mode == "reflect-x" else (2 * x, 2 * y))


class PlaneTransform(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("shape", 0, 9), ("transform", 9, 21), ("invariants", 21, 34), ("complex", 34, 46)]

    def construct(self):
        p = self.params
        mode = p["mode"]
        V = [(p["x1"], p["y1"]), (p["x2"], p["y2"]), (p["x3"], p["y3"])]
        W = [image(mode, x, y) for x, y in V]
        area = lambda T: abs((T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[1][1] - T[0][1]) * (T[2][0] - T[0][0])) / 2
        self.display = {"areaBefore": area(V) + 0.0, "areaAfter": area(W) + 0.0}
        view = View(V + W + [(0, 0)], box=(-2.4, -0.3, 8.2, 5.0), cap=1.0)
        S = lambda q: view(q[0], q[1])
        tau = ValueTracker(0.0)

        def moved(q, t):
            x, y = q
            if mode in ("rotate90", "mult-i"):
                c, s_ = math.cos(math.pi / 2 * t), math.sin(math.pi / 2 * t)
                return (c * x - s_ * y, s_ * x + c * y)
            if mode == "reflect-x":
                return (x, y * (1 - 2 * t))
            return (x * (1 + t), y * (1 + t))

        axes = [Line(S((-10, 0)), S((10, 0)), color=WHITE, stroke_width=3, stroke_opacity=0.7),
                Line(S((0, -10)), S((0, 10)), color=WHITE, stroke_width=3, stroke_opacity=0.7)]
        axes = [Line(P(-6.6 + 0.0, S((0, 0))[1]), P(3.6 + 0.0, S((0, 0))[1]), color=WHITE, stroke_width=3, stroke_opacity=0.7),
                Line(P(S((0, 0))[0], -3.6), P(S((0, 0))[0], 3.0), color=WHITE, stroke_width=3, stroke_opacity=0.7)]
        tri0 = Polygon(*[S(q) for q in V], color=BLUE_D, stroke_width=6, fill_color=BLUE_D, fill_opacity=0.25)
        names = ["A", "B", "C"]
        outward = lambda q: np.array(S(q)) + (np.array(S(q)) - np.array(S((sum(v[0] for v in V) / 3, sum(v[1] for v in V) / 3)))) * 0.25
        labs = [tex(nm, 36, BLUE_D, nm).move_to(P(*outward(q)[:2])) for nm, q in zip(names, V)]
        self.sequence("shape", [([Create(a_) for a_ in axes], 2), ([Create(tri0)], 3), ([Write(l_) for l_ in labs], 2)], hold=2.5)

        ghost = tri0.copy().set_fill(opacity=0.0).set_stroke(opacity=0.5)
        live = always_redraw(lambda: Polygon(*[S(moved(q, tau.get_value())) for q in V], color=RED_D, stroke_width=6,
                                             fill_color=RED_D, fill_opacity=0.25))
        self.add(ghost, live)
        labs2 = [tex(nm + "'", 36, RED_D, nm + "p").move_to(P(*(np.array(S(q))[:2] + (np.array(S(q))[:2] - np.array(S((sum(v[0] for v in W) / 3, sum(v[1] for v in W) / 3)))[:2]) * 0.25)))
                 for nm, q in zip(names, W)]
        self.sequence("transform", [(lambda: [tau.animate.set_value(1.0)], 6), ([Write(l_) for l_ in labs2], 2)], hold=3)

        d = lambda q1, q2: math.dist(q1, q2)
        ab, abp = d(V[0], V[1]), d(W[0], W[1])
        left = [tex(rf"AB = {ab:.2f}", 40, BLUE_D, "ab").move_to(P(4.6, 1.8)), tex(rf"[ABC] = {area(V):g}", 40, BLUE_D, "areaBefore").move_to(P(4.6, 0.9))]
        right = [tex(rf"A'B' = {abp:.2f}", 40, RED_D, "abp").move_to(P(4.6, -0.2)), tex(rf"[A'B'C'] = {area(W):g}", 40, RED_D, "areaAfter").move_to(P(4.6, -1.1))]
        self.sequence("invariants", [([Write(t_) for t_ in left], 3), ([Write(t_) for t_ in right], 3), (lambda: [Indicate(left[0], scale_factor=1.2), Indicate(right[0], scale_factor=1.2)], 2.5)], hold=2.5)

        # the complex view: the vertex A as x + iy, multiplied by i, turns a quarter
        self.remove(*labs, *labs2, *left, *right)
        zx, zy = V[0]
        cap = tex(rf"z = {zx} {'+' if zy >= 0 else '-'} {abs(zy)}i", 44, tag="z").to_corner(UP + RIGHT, buff=0.5)
        wx, wy = -zy, zx
        cap2 = tex(rf"iz = {wx} {'+' if wy >= 0 else '-'} {abs(wy)}i", 44, tag="iz").next_to(cap, DOWN, buff=0.3).align_to(cap, RIGHT)
        o = S((0, 0))
        va = Arrow(o, S(V[0]), buff=0, color=BLUE_D, stroke_width=7)
        vb = Arrow(o, S(W[0]) if mode in ("rotate90", "mult-i") else S((wx, wy)), buff=0, color=RED_D, stroke_width=7)
        self.remove(ghost, live)
        self.add(tri0.set_fill(opacity=0.1))
        self.sequence("complex", [([Create(va)], 2.5), ([Write(cap)], 2), ([Create(vb)], 3), ([Write(cap2)], 2.5)], hold=2.5)
