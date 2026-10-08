"""Card 3B-M: the inscribed angle theorem. Entry: lib/subjects/math/clips/inscribed-angle.ts."""
import math

from manim import (Arc, Circle, Create, Dot, FadeIn, FadeOut, Line, Polygon, Write, ValueTracker, always_redraw, UP, DOWN, LEFT, RIGHT)
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


class InscribedAngle(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("circle", 0, 9), ("central", 9, 20), ("inscribed", 20, 35), ("cyclic", 35, 48)]

    def construct(self):
        arc = int(self.params["arc"])
        half = arc / 2
        self.display = {"central": arc, "inscribed": half}
        fmt = lambda v: f"{v:g}"
        R = 2.6
        cx, cy = -1.5, -0.2
        at = lambda deg, r=R: P(cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg)))
        ang_a, ang_b = 270 - arc / 2, 270 + arc / 2     # the arc AB runs along the bottom
        O, A, B = P(cx, cy), at(ang_a), at(ang_b)
        circle = Circle(radius=R, color=WHITE, stroke_width=5).move_to(O)
        dots = [Dot(O, color=YELLOW_D, radius=0.1), Dot(A, color=GREEN_D, radius=0.12), Dot(B, color=RED_D, radius=0.12)]
        out = lambda deg, d=0.45: P(cx + (R + d) * math.cos(math.radians(deg)), cy + (R + d) * math.sin(math.radians(deg)))
        lo = tex("O", 36, YELLOW_D, "O").move_to(O + P(0.0, 0.4))
        la = tex("A", 36, GREEN_D, "A").move_to(out(ang_a))
        lb = tex("B", 36, RED_D, "B").move_to(out(ang_b))
        self.sequence("circle", [([Create(circle)], 3), ([FadeIn(d_) for d_ in dots], 1.5), ([Write(lo), Write(la), Write(lb)], 2)], hold=2.5)

        oa, ob = Line(O, A, color=GREEN_D, stroke_width=6), Line(O, B, color=RED_D, stroke_width=6)
        # the central angle AOB opens downwards; its arc is drawn with a small radius inside the circle
        wedge = Arc(radius=0.8, start_angle=math.radians(ang_a), angle=math.radians(arc), arc_center=O, color=YELLOW_D, stroke_width=7)
        lc = tex(rf"{arc}^\circ", 36, YELLOW_D, "central").move_to(O + P(0.0, -1.25 if arc < 300 else -1.2))
        cap = tex(rf"\angle AOB = {arc}^\circ", 44, tag="caption").to_corner(UP + RIGHT, buff=0.5)
        self.sequence("central", [([Create(oa), Create(ob)], 3), ([Create(wedge)], 2.5), ([Write(lc)], 2), ([Write(cap)], 2.5)], hold=2.5)

        # P runs along the other arc (the upper one); the angle APB keeps its measure
        span = min(60.0, (360 - arc) / 2 - 8)
        t = ValueTracker(90.0 - span)
        Ppt = lambda: at(t.get_value())
        pa = always_redraw(lambda: Line(Ppt(), A, color=GREEN_D, stroke_width=5))
        pb = always_redraw(lambda: Line(Ppt(), B, color=RED_D, stroke_width=5))
        pd = always_redraw(lambda: Dot(Ppt(), color=YELLOW_D, radius=0.12))
        lp = always_redraw(lambda: tex("P", 36, YELLOW_D, "P").move_to(at(t.get_value(), R + 0.45)))
        la_ = tex(rf"{fmt(half)}^\circ", 36, BLUE_D, "inscribed")
        la_.add_updater(lambda m: m.move_to(P(*(Ppt() + (O - Ppt()) * 0.22)[:2]) + P(0.0, 0.0)))
        la_.update()
        cap2 = tex(rf"\angle APB = {fmt(half)}^\circ", 44, tag="caption2").next_to(cap, DOWN, buff=0.3).align_to(cap, RIGHT)
        self.add(pa, pb, pd, lp)
        self.sequence("inscribed", [([FadeIn(la_), Write(cap2)], 2), (lambda: [t.animate.set_value(90.0 + span)], 5),
                                    (lambda: [t.animate.set_value(90.0)], 4)], hold=2.5)

        # the cyclic quadrilateral APBQ, Q on the arc AB
        Q = at(270)
        self.remove(la_, lp)
        quad = Polygon(A, Ppt(), B, Q, color=YELLOW_D, stroke_width=5, fill_color=YELLOW_D, fill_opacity=0.12)
        dq = Dot(Q, color=YELLOW_D, radius=0.12)
        lq = tex("Q", 36, YELLOW_D, "Q").move_to(out(270))
        pang = tex(rf"{fmt(half)}^\circ", 36, BLUE_D, "angP").move_to(Ppt() + P(0.0, -0.75))
        qang = tex(rf"{fmt(180 - half)}^\circ", 36, RED_D, "angQ").move_to(Q + P(0.0, 0.75))
        cap3 = tex(rf"{fmt(half)}^\circ + {fmt(180 - half)}^\circ = 180^\circ", 44, tag="caption3").next_to(cap2, DOWN, buff=0.3).align_to(cap, RIGHT)
        self.sequence("cyclic", [([FadeIn(quad), FadeIn(dq), Write(lq)], 3), ([Write(pang)], 2), ([Write(qang)], 2), ([Write(cap3)], 3)], hold=2.5)
