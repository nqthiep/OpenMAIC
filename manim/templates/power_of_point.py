"""Card 3B-M: the power of a point. Entry: lib/subjects/math/clips/power-of-point.ts."""
import math

import numpy as np
from manim import Circle, Create, Dot, FadeIn, FadeOut, Line, Write, ValueTracker, always_redraw, Indicate, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, View, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class PowerOfPoint(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("circle", 0, 9), ("secant-1", 9, 20), ("secant-2", 20, 33), ("tangent", 33, 45)]

    def construct(self):
        R, px, py = int(self.params["R"]), int(self.params["px"]), int(self.params["py"])
        power = px * px + py * py - R * R
        self.display = {"power": power}
        d = math.hypot(px, py)
        view = View([(-R, -R), (R, R), (px, py)], box=(-2.0, -0.2, 8.0, 5.4), cap=1.2)
        S = lambda x, y: view(x, y)
        O, Pp = S(0, 0), S(px, py)
        circle = Circle(radius=R * view.s, color=WHITE, stroke_width=5).move_to(O)
        dO, dP = Dot(O, color=YELLOW_D, radius=0.1), Dot(Pp, color=RED_D, radius=0.12)
        lo = tex("O", 36, YELLOW_D, "O").move_to(O + P(0.0, -0.45))
        side = 1.0 if px <= 0 else -1.0
        lp = tex("P", 36, RED_D, "P").move_to(Pp + P(0.0, 0.45))
        self.sequence("circle", [([Create(circle)], 3), ([FadeIn(dO), FadeIn(dP), Write(lo), Write(lp)], 2.5)], hold=3)

        def secant(theta):
            """Q on the circle at angle theta; the line P-Q meets the circle again at B (t2 = power / |Q-P|^2)."""
            q = (R * math.cos(theta), R * math.sin(theta))
            dx, dy = q[0] - px, q[1] - py
            l2 = dx * dx + dy * dy
            if l2 < 1e-9:
                return q, q, 0.0, 0.0
            t2 = power / l2
            b = (px + t2 * dx, py + t2 * dy)
            return q, b, math.sqrt(l2), abs(t2) * math.sqrt(l2)

        def line_for(theta):
            q, b, _, _ = secant(theta)
            pts = [np.array([px, py]), np.array(q), np.array(b)]
            dx, dy = q[0] - px, q[1] - py
            L = math.hypot(dx, dy) or 1.0
            ts = [((pt - pts[0]) @ np.array([dx, dy])) / L for pt in pts]
            lo_t, hi_t = min(ts) - 0.5, max(ts) + 0.5
            u = np.array([dx, dy]) / L
            return Line(S(*(pts[0] + u * lo_t)), S(*(pts[0] + u * hi_t)), color=GREEN_D, stroke_width=6)

        # the first secant goes through the circle point for the first slope that is not P itself
        th0 = 0.0
        for sl in (0.5, 1.0, 2.0, -0.5, -1.0, 0.0):
            qx, qy = R * (1 - sl * sl) / (1 + sl * sl), 2 * R * sl / (1 + sl * sl)
            if math.hypot(qx - px, qy - py) > 0.5:
                th0 = math.atan2(qy, qx)
                break
        q, b, pa, pb = secant(th0)
        ln = line_for(th0)
        dA, dB = Dot(S(*q), color=GREEN_D, radius=0.11), Dot(S(*b), color=GREEN_D, radius=0.11)
        la = tex("A", 36, GREEN_D, "A").move_to(S(*q) + P(0.0, 0.45))
        lb = tex("B", 36, GREEN_D, "B").move_to(S(*b) + P(0.0, -0.45))
        cap = tex(rf"PA \cdot PB = {pa:.2f} \cdot {pb:.2f}", 44, tag="caption").to_corner(UP + RIGHT, buff=0.5)
        cap_p = tex(rf"= {abs(power)}", 44, YELLOW_D, "product").next_to(cap, DOWN, buff=0.3).align_to(cap, RIGHT)
        self.sequence("secant-1", [([Create(ln)], 3), ([FadeIn(dA), FadeIn(dB), Write(la), Write(lb)], 2.5), ([Write(cap)], 2.5), ([Write(cap_p)], 2)], hold=2.5)

        # the line turns about P: Q walks along the circle, the product stays the same
        tt = ValueTracker(th0)
        live_ln = always_redraw(lambda: line_for(tt.get_value()))
        live_a = always_redraw(lambda: Dot(S(*secant(tt.get_value())[0]), color=GREEN_D, radius=0.11))
        live_b = always_redraw(lambda: Dot(S(*secant(tt.get_value())[1]), color=GREEN_D, radius=0.11))
        self.remove(ln, dA, dB, la, lb)
        self.add(live_ln, live_a, live_b)
        self.sequence("secant-2", [(lambda: [tt.animate.set_value(th0 + 0.9)], 4), (lambda: [tt.animate.set_value(th0 - 0.9)], 5),
                                   ([Indicate(cap_p, scale_factor=1.3)], 2.5)], hold=2.5)

        if power > 0:
            # the secant becomes the tangent PT: rotate until A and B coincide at T
            ang = math.acos(R / d)
            base = math.atan2(py, px)
            theta_t = base + ang
            t2 = tex(rf"PT^2 = {power}", 44, tag="caption2")
            t2.next_to(cap_p, DOWN, buff=0.3).align_to(cap_p, RIGHT)
            self.sequence("tangent", [(lambda: [tt.animate.set_value(theta_t)], 6), ([Write(t2)], 3), (lambda: [Indicate(live_a, scale_factor=2.0)], 2.5)], hold=2.5)
        else:
            from manim import Line as L_
            o_ = S(px, py)
            cross = [L_(o_ + P(-0.5, -0.5), o_ + P(0.5, 0.5), color=RED_D, stroke_width=9), L_(o_ + P(-0.5, 0.5), o_ + P(0.5, -0.5), color=RED_D, stroke_width=9)]
            neg = tex(rf"OP^2 - R^2 = {power}", 44, tag="caption2").next_to(cap_p, DOWN, buff=0.3).align_to(cap_p, RIGHT)
            self.sequence("tangent", [([Create(c_) for c_ in cross], 3), ([Write(neg)], 3), (lambda: [Indicate(c_, scale_factor=1.5) for c_ in cross], 3)], hold=2.5)
