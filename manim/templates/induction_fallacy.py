"""Card 3B-M: two induction fallacies (all horses one colour; n^2 + n is odd without a base case).
Entry: lib/subjects/math/clips/induction-fallacy.ts. Language-independent: dots, brackets and formulas."""
from manim import Circle, Create, Dot, FadeIn, FadeOut, Line, Write, Indicate, Rectangle, VGroup, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D


def bracket(x0, x1, y, color, up=True):
    """A square bracket spanning x0..x1 at height y (opening downwards when `up`)."""
    d = -0.25 if up else 0.25
    return VGroup(Line(P(x0, y), P(x1, y), color=color, stroke_width=7), Line(P(x0, y), P(x0, y + d), color=color, stroke_width=7),
                  Line(P(x1, y), P(x1, y + d), color=color, stroke_width=7))


class InductionFallacy(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("claim", 0, 9), ("step", 9, 21), ("crack", 21, 35), ("fix", 35, 46)]

    def construct(self):
        n, kind = int(self.params["n"]), self.params["kind"]
        self.display = {"failAt": 2 if kind == "all-same-color" else 1}
        tick = lambda x, y: VGroup(Line(P(x - 0.25, y), P(x - 0.08, y - 0.22), color=GREEN_D, stroke_width=9),
                                   Line(P(x - 0.08, y - 0.22), P(x + 0.3, y + 0.3), color=GREEN_D, stroke_width=9))
        cross = lambda x, y: VGroup(Line(P(x - 0.25, y - 0.25), P(x + 0.25, y + 0.25), color=RED_D, stroke_width=9),
                                    Line(P(x - 0.25, y + 0.25), P(x + 0.25, y - 0.25), color=RED_D, stroke_width=9))

        if kind == "all-same-color":
            sp = min(1.0, 9.0 / n)
            xs = [(i - (n - 1) / 2) * sp for i in range(n)]
            horses = [Circle(radius=0.3 * min(1.0, sp), color=BLUE_D, fill_opacity=0.8, stroke_width=3).move_to(P(x, -0.2)) for x in xs]
            claim = tex(rf"P({n})", 56, tag="claim").to_corner(UP + LEFT, buff=0.5)
            self.sequence("claim", [([FadeIn(h) for h in horses], 3), ([Write(claim)], 2.5), (lambda: [Indicate(h, scale_factor=1.3) for h in horses], 2)], hold=2.5)
            k = n - 1  # two groups of k horses inside n
            g1 = bracket(xs[0] - 0.4 * sp, xs[k - 1] + 0.4 * sp, 0.9, GREEN_D)
            g2 = bracket(xs[1] - 0.4 * sp, xs[n - 1] + 0.4 * sp, -1.3, RED_D, up=False)
            overlap = tex(rf"{k}-1 = {k - 1}", 44, YELLOW_D, "overlap").move_to(P(0, 2.1))
            self.sequence("step", [([Create(g1)], 3), ([Create(g2)], 3), ([Write(overlap)], 2.5)], hold=2.5)
            # k = 1 -> 2: two groups of a single horse; they share nothing
            two = [Circle(radius=0.55, color=BLUE_D, fill_opacity=0.8, stroke_width=4).move_to(P(-1.3, -0.2)),
                   Circle(radius=0.55, color=BLUE_D, fill_opacity=0.8, stroke_width=4).move_to(P(1.3, -0.2))]
            h1, h2 = bracket(-2.0, -0.6, 1.1, GREEN_D), bracket(0.6, 2.0, -1.5, RED_D, up=False)
            zero = tex(r"1-1 = 0", 52, RED_D, "zero").move_to(P(0, 2.1))
            self.remove(*horses, g1, g2, overlap)
            xmark = cross(0.0, -0.2)
            self.sequence("crack", [([FadeIn(t_) for t_ in two], 2), ([Create(h1), Create(h2)], 3), ([Write(zero)], 2.5),
                                    ([Create(xmark)], 2.5), (lambda: [Indicate(xmark, scale_factor=1.6)], 2)], hold=2.5)
            base = tex(r"P(1)", 48, tag="base").move_to(P(-3.0, 0.4))
            stepf = tex(r"P(k)\Rightarrow P(k+1)", 48, tag="step").move_to(P(2.6, 0.4))
            self.remove(*two, h1, h2, zero, xmark, claim)
            self.sequence("fix", [([Write(base), Write(stepf)], 3), ([Create(tick(-3.0, -0.8))], 2), ([Create(tick(2.6, -0.8))], 2),
                                  (lambda: [Indicate(base, scale_factor=1.3), Indicate(stepf, scale_factor=1.3)], 2.5)], hold=2.5)
        else:
            claim = tex(r"n^2 + n \text{ odd}", 56, tag="claim").move_to(P(0, 1.2))
            self.sequence("claim", [([Write(claim)], 3), (lambda: [Indicate(claim, scale_factor=1.2)], 2.5), (lambda: [Indicate(claim, scale_factor=1.2)], 2.5)], hold=2.5)
            stepf = tex(r"(k+1)^2 + (k+1) = (k^2 + k) + 2(k+1)", 48, tag="step").move_to(P(0, -0.6))
            self.sequence("step", [([Write(stepf)], 5), (lambda: [Indicate(stepf, scale_factor=1.15)], 2.5)], hold=2.5)
            val = n * n + n
            trial = tex(rf"{n}^2 + {n} = {val}", 52, tag="trial").move_to(P(0, -2.0))
            xmark = cross(3.8, -2.0)
            self.sequence("crack", [([Write(trial)], 3), ([Create(xmark)], 2.5), (lambda: [Indicate(xmark, scale_factor=1.6)], 2.5),
                                    (lambda: [Indicate(trial, scale_factor=1.2, color=RED_D)], 2.5)], hold=2.5)
            base = tex(r"P(1)", 48, tag="base").move_to(P(-3.0, 0.8))
            stepf2 = tex(r"P(k)\Rightarrow P(k+1)", 48, tag="step2").move_to(P(2.6, 0.8))
            self.remove(trial, xmark, claim, stepf)
            one = tex(r"1^2 + 1 = 2", 44, RED_D, "one").move_to(P(-3.0, -0.6))
            self.sequence("fix", [([Write(base), Write(stepf2)], 2.5), ([Write(one), Create(cross(-3.0, -1.8))], 2.5),
                                  ([Create(tick(2.6, -0.4))], 2), (lambda: [Indicate(base, scale_factor=1.3, color=RED_D), Indicate(stepf2, scale_factor=1.3)], 2.5)], hold=2.5)
