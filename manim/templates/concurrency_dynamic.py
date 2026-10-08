"""Card 3B-M: concurrent lines of a triangle (altitudes, medians, perpendicular bisectors, angle bisectors) while the
vertex C runs parallel to AB. Entry: lib/subjects/math/clips/concurrency-dynamic.ts."""
import math

import numpy as np
from manim import (Arrow, Create, Dot, FadeIn, FadeOut, Line, Polygon, Write, ValueTracker, always_redraw, Indicate, UP, DOWN, LEFT, RIGHT)
from _base import ClipScene, P, View, tex, line_in_box, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

NAMES = {"orthocenter": "H", "centroid": "G", "circumcenter": "O", "incenter": "I"}


def center_of(kind, A, B, C):
    ax, ay = A; bx, by = B; cx, cy = C
    if kind == "centroid":
        return ((ax + bx + cx) / 3, (ay + by + cy) / 3)
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    if kind == "circumcenter":
        return (ux, uy)
    if kind == "orthocenter":
        return (ax + bx + cx - 2 * ux, ay + by + cy - 2 * uy)
    a, b, c = math.dist(B, C), math.dist(C, A), math.dist(A, B)
    s = a + b + c
    return ((a * ax + b * bx + c * cx) / s, (a * ay + b * by + c * cy) / s)


def lines_of(kind, A, B, C):
    """Three (point, direction) pairs in problem coordinates."""
    def mid(p, q): return ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    def perp(p, q): return (-(q[1] - p[1]), q[0] - p[0])  # a perpendicular of the side p->q
    def unit(p, q):
        d = math.dist(p, q)
        return ((q[0] - p[0]) / d, (q[1] - p[1]) / d)
    out = []
    for P_, Q, R in ((A, B, C), (B, C, A), (C, A, B)):
        if kind == "orthocenter":
            out.append((P_, perp(Q, R)))
        elif kind == "centroid":
            m = mid(Q, R); out.append((P_, (m[0] - P_[0], m[1] - P_[1])))
        elif kind == "circumcenter":
            out.append((mid(Q, R), perp(Q, R)))
        else:
            u, w = unit(P_, Q), unit(P_, R); out.append((P_, (u[0] + w[0], u[1] + w[1])))
    return out


class ConcurrencyDynamic(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("triangle", 0, 9), ("lines", 9, 21), ("meet", 21, 32), ("move", 32, 48), ("special", 48, 58)]

    def construct(self):
        p = self.params
        A, B, C0 = (p["x1"], p["y1"]), (p["x2"], p["y2"]), (p["x3"], p["y3"])
        kind = p["center"]
        d = (B[0] - A[0], B[1] - A[1])
        dd = d[0] ** 2 + d[1] ** 2
        t_right = -((C0[0] - A[0]) * d[0] + (C0[1] - A[1]) * d[1]) / dd  # C(t) makes a right angle at A
        t_special = t_right if abs(t_right) > 0.2 else t_right + 0.8
        t_move = 0.5

        def C_at(t): return (C0[0] + t * d[0], C0[1] + t * d[1])

        cx, cy = center_of(kind, A, B, C0)
        self.display = {"cx": round(cx * 1000) / 1000 + 0.0, "cy": round(cy * 1000) / 1000 + 0.0}

        samples = [-t_move, 0, t_move, t_special]
        pts = [A, B] + [C_at(t) for t in samples] + [center_of(kind, A, B, C_at(t)) for t in samples]
        view = View(pts, box=(0.0, -0.2, 10.0, 5.2), cap=1.3)
        zoom = ValueTracker(1.0)  # about the center of the first position; used by the "meet" chapter
        cpt = view(*center_of(kind, A, B, C0))

        def S(q):
            v = view(q[0], q[1])
            return cpt + zoom.get_value() * (v - cpt)
        name = NAMES[kind]
        colors = [GREEN_D, RED_D, BLUE_D]
        track = ValueTracker(0.0)

        def tri_pts(): return A, B, C_at(track.get_value())

        def make_tri():
            a_, b_, c_ = tri_pts()
            return Polygon(S(a_), S(b_), S(c_), color=WHITE, stroke_width=4)

        def make_line(i):
            a_, b_, c_ = tri_pts()
            (q, dr) = lines_of(kind, a_, b_, c_)[i]
            e0, e1 = line_in_box(S(q), (dr[0], dr[1]))
            return Line(e0, e1, color=colors[i], stroke_width=4)

        def make_dot():
            a_, b_, c_ = tri_pts()
            return Dot(S(center_of(kind, a_, b_, c_)), color=YELLOW_D, radius=0.11)

        # chapters 1-2 draw static copies (Create does not work on a redrawn object); from chapter 3 on they follow the trackers
        tri, lin, dot = make_tri(), [make_line(i) for i in range(3)], make_dot()
        live = (always_redraw(make_tri), [always_redraw(lambda i=i: make_line(i)) for i in range(3)],
                always_redraw(make_dot))
        la = tex("A", 36, tag="A").add_updater(lambda m: m.move_to(S(A) + P(-0.35, -0.3)))
        lb = tex("B", 36, tag="B").add_updater(lambda m: m.move_to(S(B) + P(0.35, -0.3)))
        lc = tex("C", 36, tag="C").add_updater(lambda m: m.move_to(S(C_at(track.get_value())) + P(0, 0.4)))
        ln = tex(name, 36, YELLOW_D, "center").add_updater(
            lambda m: m.move_to(S(center_of(kind, *tri_pts())) + P(0.35, 0.3)))
        for m in (la, lb, lc, ln):
            m.update()

        # 1. the triangle, and the arrow that says C runs parallel to AB
        arrow_dir = P(d[0], d[1]); arrow_dir = arrow_dir / np.linalg.norm(arrow_dir) * 1.6
        arrow = Arrow(S(C0), S(C0) + arrow_dir, buff=0, color=YELLOW_D, stroke_width=6)
        cap = tex(r"C \parallel AB", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.sequence("triangle", [([Create(tri)], 3), ([Write(la), Write(lb), Write(lc)], 2),
                                   ([Create(arrow), Write(cap)], 2)])
        # 2. the three lines
        self.sequence("lines", [([Create(lin[0])], 3), ([Create(lin[1])], 3), ([Create(lin[2])], 3)])
        # 3. the crossing: the figure grows about the center while the vertex labels step aside
        self.remove(la, lb, lc, tri, *lin)
        self.add(live[0], *live[1], live[2], )
        self.remove(dot)
        dot = live[2]
        self.sequence("meet", [([FadeIn(dot), Write(ln)], 2), ([FadeOut(arrow)], 1),
                               (lambda: [zoom.animate.set_value(2.4)], 4), ([Indicate(dot, scale_factor=2.0)], 2),
                               (lambda: [zoom.animate.set_value(1.0)], 3)])
        # 4. C runs parallel to AB; everything follows
        self.add(la, lb, lc)
        cap2 = tex(r"C(t) = C + t\,\overrightarrow{AB}", 44, tag="caption").to_corner(UP + LEFT, buff=0.5)
        self.play(FadeOut(cap), FadeIn(cap2), run_time=0.5)
        self.sequence("move", [(lambda: [track.animate.set_value(t_move)], 4), (lambda: [track.animate.set_value(-t_move)], 6),
                               (lambda: [track.animate.set_value(0.0)], 4)])
        # 5. a special position
        self.sequence("special", [(lambda: [track.animate.set_value(t_special)], 6)])
