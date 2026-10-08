"""Card 3B-M: transformations of a graph, g(x) = a f(x - h) + k. Entry: lib/subjects/math/clips/graph-transform.ts."""
from manim import Create, Dot, FadeIn, Line, VMobject, Write, ValueTracker, always_redraw, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

FUNCS = {"x2": lambda x: x * x, "abs": lambda x: abs(x), "x3": lambda x: x ** 3}


class GraphTransform(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("base", 0, 9), ("shift-h", 9, 21), ("scale", 21, 33), ("shift-k", 33, 44)]

    def construct(self):
        p = self.params
        f = FUNCS[p["f"]]
        a, h, k = int(p["a"]), int(p["h"]), int(p["k"])
        self.display = {"x": h + 0, "y": k + 0}
        sx, sy = 0.85, 0.55           # scene units per unit of x and y
        cy = -0.3
        S = lambda x, y: P(sx * x, cy + sy * y)
        ph, pa, pk, pp = ValueTracker(0.0), ValueTracker(1.0), ValueTracker(0.0), ValueTracker(-2.0)
        g = lambda x: pa.get_value() * f(x - ph.get_value()) + pk.get_value()

        def curve():
            pts = []
            for i in range(0, 561):
                x = -7.0 + 14.0 * i / 560
                y = g(x)
                if abs(sy * y + cy) <= 3.4 and abs(sx * x) <= 6.6:
                    pts.append(S(x, y))
            m = VMobject(color=BLUE_D, stroke_width=7)
            m.set_points_as_corners(pts if len(pts) > 1 else [S(0, 0), S(0, 0.01)])
            return m

        axes = [Line(S(-7.2, 0), S(7.2, 0), color=WHITE, stroke_width=3), Line(S(0, -6.2), S(0, 5.5), color=WHITE, stroke_width=3)]
        graph_static = curve()
        pt = Dot(S(0, 0), color=YELLOW_D, radius=0.14)
        lab = tex("(0,\\,0)", 36, YELLOW_D, "point")
        lab.next_to(pt, DOWN + RIGHT, buff=0.1)
        self.sequence("base", [([Create(a_) for a_ in axes], 2), ([Create(graph_static)], 3), ([FadeIn(pt), Write(lab)], 1.5)], hold=3)

        # from here the graph follows the trackers
        self.remove(graph_static, pt, lab)
        live = always_redraw(curve)
        live_pt = always_redraw(lambda: Dot(S(ph.get_value(), pk.get_value()), color=YELLOW_D, radius=0.14))
        probe = always_redraw(lambda: Dot(S(pp.get_value(), g(pp.get_value())), color=RED_D, radius=0.12))

        def point_label():
            m = tex(f"({int(round(ph.get_value()))},\\,{int(round(pk.get_value()))})", 36, YELLOW_D, "point")
            return m.next_to(S(ph.get_value(), pk.get_value()), DOWN + RIGHT, buff=0.1)
        live_lab = always_redraw(point_label)
        self.add(live, live_pt, probe, live_lab)

        def sweep():  # a probe that rides the graph to the other side, so a step that changes nothing still moves
            return [pp.animate.set_value(-pp.get_value())]
        cap1 = tex(r"f(x - h)", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        move_h = (lambda: [ph.animate.set_value(h)], 3.5) if h != 0 else (sweep, 3.5)
        self.sequence("shift-h", [([FadeIn(cap1)], 1.5), move_h, (sweep, 3.5)], hold=3)
        cap2 = tex(r"a \cdot f", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        move_a = (lambda: [pa.animate.set_value(a)], 3.5) if a != 1 else (sweep, 3.5)
        self.sequence("scale", [([FadeIn(cap2), FadeOut_(cap1)], 1.5), move_a, (sweep, 3.5)], hold=3)
        cap3 = tex(r"+\,k", 48, tag="caption").to_corner(UP + LEFT, buff=0.5)
        move_k = (lambda: [pk.animate.set_value(k)], 3.5) if k != 0 else (sweep, 3.5)
        self.sequence("shift-k", [([FadeIn(cap3), FadeOut_(cap2)], 1.5), move_k, (sweep, 3.5)], hold=3)

from manim import FadeOut as FadeOut_  # noqa: E402
