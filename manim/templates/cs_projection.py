"""Card 3B-M: Cauchy-Schwarz by projection. Entry: lib/subjects/math/clips/cs-projection.ts."""
import math

import numpy as np
from manim import (Arrow, Create, DashedLine, Dot, FadeIn, FadeOut, Line, Polygon, Write, ValueTracker, always_redraw,
                   Indicate, UP, LEFT, RIGHT, DOWN)
from _base import ClipScene, P, View, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class CsProjection(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("vectors", 0, 10), ("projection", 10, 24), ("inequality", 24, 37), ("equality", 37, 48)]

    def construct(self):
        p = self.params
        u = np.array([float(p["ux"]), float(p["uy"])])
        v = np.array([float(p["vx"]), float(p["vy"])])
        nu, nv = float(np.linalg.norm(u)), float(np.linalg.norm(v))
        dot = float(u @ v)
        proj = abs(dot) / nu
        self.display = {"dot": int(dot), "normU": round(nu * 1000) / 1000, "normV": round(nv * 1000) / 1000,
                        "proj": round(proj * 1000) / 1000}
        uh = u / nu
        # the angle by which v must turn to be parallel to u (the smaller turn, either direction of u)
        theta = math.atan2(u[0] * v[1] - u[1] * v[0], dot)       # angle from u to v
        turn = -theta if abs(theta) <= math.pi / 2 else -(theta - math.copysign(math.pi, theta))
        if abs(turn) < 1e-9:
            turn = 0.0
        rim = [uh * nv, -uh * nv, np.array([-uh[1], uh[0]]) * nv, np.array([uh[1], -uh[0]]) * nv]
        foot0 = uh * (dot / nu)
        view = View([(0, 0), tuple(u), tuple(v), tuple(foot0)] + [tuple(r) for r in rim], box=(0.0, -0.2, 9.5, 5.2), cap=1.5)
        S = lambda q: view(q[0], q[1])
        ang = ValueTracker(0.0)

        def v_now():
            a = ang.get_value()
            c, s_ = math.cos(a), math.sin(a)
            return np.array([c * v[0] - s_ * v[1], s_ * v[0] + c * v[1]])

        def foot_now():
            vn = v_now()
            return uh * float(vn @ uh)

        o = S((0, 0))

        def build(kind):
            """The pieces that depend on the angle of v, as they are now."""
            vn, fn = v_now(), foot_now()
            if kind == "v":
                return Arrow(o, S(vn), buff=0, color=GREEN_D, stroke_width=7)
            if kind == "vlabel":
                return tex("v", 44, GREEN_D, "v").move_to(S(vn) + P(0.35, 0.3))
            if kind == "perp":
                if np.linalg.norm(fn) < 1e-6:  # v is perpendicular to u: the foot is the origin, the dashes lie on v itself
                    return Line(S(vn), o, color=RED_D, stroke_width=9)
                return (DashedLine(S(vn), S(fn), color=WHITE, stroke_width=6)
                        if np.linalg.norm(vn - fn) > 1e-6 else Line(o, o, stroke_width=0))
            if kind == "proj":
                return (Line(o, S(fn), color=YELLOW_D, stroke_width=10)
                        if np.linalg.norm(fn) > 1e-6 else Dot(o, color=YELLOW_D, radius=0.18))
            if kind == "plabel":
                return tex("p", 40, YELLOW_D, "proj").move_to((o + S(fn)) / 2 + P(0.0, -0.45))
            return Polygon(o, S(vn), S(fn), color=YELLOW_D, stroke_width=3, fill_color=YELLOW_D, fill_opacity=0.35)

        arrow_u = Arrow(o, S(u), buff=0, color=BLUE_D, stroke_width=7)
        lu = tex("u", 44, BLUE_D, "u").move_to(S(u) + P(0.35, 0.3))
        arrow_v, lv = build("v"), build("vlabel")
        self.sequence("vectors", [([Create(arrow_u), Write(lu)], 3), ([Create(arrow_v), Write(lv)], 3)], hold=3)

        axis_dir = P(*uh)
        axis_line = Line(o - axis_dir * 6.5, o + axis_dir * 6.5, color=BLUE_D, stroke_width=3, stroke_opacity=0.8)
        perp, pj, lpj, tri = build("perp"), build("proj"), build("plabel"), build("tri")
        cap1 = tex(r"\text{proj} = \frac{|u\cdot v|}{|u|}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("projection", [([Create(axis_line)], 1.5), ([Create(perp)], 2), ([Create(pj), Write(lpj)], 1.5),
                                     ([Write(cap1)], 3)], hold=2.5)

        cap2 = tex(rf"|u\cdot v| = {abs(int(dot))} \le {nu:.2f}\cdot {nv:.2f}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("inequality", [([FadeIn(tri)], 2), ([Indicate(lpj, scale_factor=1.6)], 2),
                                     ([FadeOut(cap1), FadeIn(cap2)], 2), ([Indicate(arrow_v, scale_factor=1.25, color=RED_D)], 2)],
                      hold=3)

        # from here v turns: the pieces that depend on it are redrawn every frame
        self.remove(arrow_v, lv, perp, pj, lpj, tri)
        live = [always_redraw(lambda k=k: build(k)) for k in ("tri", "perp", "proj", "v", "vlabel", "plabel")]
        self.add(*live)
        cap3 = tex(r"u \parallel v \iff |u\cdot v| = |u||v|", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        if turn == 0.0:  # already parallel: swing v out and back so the viewer sees the equality hold
            steps = [(lambda: [ang.animate.set_value(0.9)], 3), (lambda: [ang.animate.set_value(0.0)], 3)]
        else:
            steps = [(lambda: [ang.animate.set_value(turn)], 5)]
        self.sequence("equality", steps + [([FadeOut(cap2), FadeIn(cap3)], 1.5)], hold=2.5)
