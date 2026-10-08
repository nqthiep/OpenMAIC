"""Card 3B-M: inclusion-exclusion for three sets. Entry: lib/subjects/math/clips/inclusion-exclusion.ts."""
from manim import Circle, Create, FadeIn, FadeOut, Line, Write, Indicate, Transform, UP, DOWN, LEFT, RIGHT
from _base import ClipScene, P, tex, WHITE, BLUE_D, GREEN_D, RED_D, YELLOW_D

R = 1.9
CENTRES = {"A": (-1.0, 0.6), "B": (1.0, 0.6), "C": (0.0, -1.1)}
# where the count of each region is written: only A, only B, only C, A&B, A&C, B&C, all three
SPOTS = [(-1.95, 1.15), (1.95, 1.15), (0.0, -2.35), (0.0, 1.3), (-1.15, -0.55), (1.15, -0.55), (0.0, 0.0)]


class InclusionExclusion(ClipScene):
    TEMPLATE_REV = 1
    CHAPTERS = [("venn", 0, 9), ("add", 9, 20), ("subtract", 20, 33), ("add-back", 33, 45)]

    def construct(self):
        a, b, c, ab, ac, bc, abc = [int(v) for v in self.params["r"]]
        A, B, C = a + ab + ac + abc, b + ab + bc + abc, c + ac + bc + abc
        AB, AC, BC = ab + abc, ac + abc, bc + abc
        union = A + B + C - AB - AC - BC + abc
        self.display = {"union": union, "A": A, "B": B, "C": C}
        ox = -2.0   # the diagram sits left of the middle; the formulas go to the right
        pos = lambda x, y: P(ox + x, y + 0.2)
        circles = {k: Circle(radius=R, color=col, stroke_width=6).move_to(pos(*CENTRES[k]))
                   for k, col in (("A", BLUE_D), ("B", GREEN_D), ("C", RED_D))}
        names = {"A": tex("A", 40, BLUE_D, "nameA").move_to(pos(-2.9, 2.2)),
                 "B": tex("B", 40, GREEN_D, "nameB").move_to(pos(2.9, 2.2)),
                 "C": tex("C", 40, RED_D, "nameC").move_to(pos(2.0, -2.5))}
        counts = [a, b, c, ab, ac, bc, abc]
        nums = [tex(str(v), 36, tag=f"count{i}").move_to(pos(*SPOTS[i])) for i, v in enumerate(counts)]
        self.sequence("venn", [([Create(circles["A"])], 2), ([Create(circles["B"])], 2), ([Create(circles["C"])], 2),
                               ([Write(names["A"]), Write(names["B"]), Write(names["C"])], 1.5),
                               ([Write(t_) for t_ in nums], 2.5)], hold=2.5)

        fills = {k: circles[k].copy().set_fill(circles[k].get_color(), 0.3) for k in circles}
        # one caption that grows: at most 12 pieces of text may be on screen, and this keeps the count low
        def caption(s_, color=WHITE):
            return tex(s_, 44, color, "caption").to_corner(UP + RIGHT, buff=0.5)
        cap = caption(rf"{A} + {B} + {C}")
        self.sequence("add", [(lambda: [FadeIn(fills["A"])], 2), (lambda: [FadeIn(fills["B"])], 2), (lambda: [FadeIn(fills["C"])], 2),
                              ([Write(cap)], 3)], hold=2.5)

        def cross(x, y):
            return [Line(pos(x - 0.4, y - 0.4), pos(x + 0.4, y + 0.4), color=RED_D, stroke_width=12),
                    Line(pos(x - 0.4, y + 0.4), pos(x + 0.4, y - 0.4), color=RED_D, stroke_width=12)]
        marks = [cross(*SPOTS[3]), cross(*SPOTS[4]), cross(*SPOTS[5])]
        cap2 = caption(rf"{A} + {B} + {C} - {AB} - {AC} - {BC}")
        self.sequence("subtract", [([Create(m_) for m_ in marks[0]], 1.5), ([Create(m_) for m_ in marks[1]], 1.5),
                                   ([Create(m_) for m_ in marks[2]], 1.5), ([Transform(cap, cap2)], 3),
                                   (lambda: [Indicate(nums[i], scale_factor=1.8, color=RED_D) for i in (3, 4, 5)], 2.5)], hold=2.5)

        cap3 = caption(rf"{A} + {B} + {C} - {AB} - {AC} - {BC} + {abc} = {union}")
        self.sequence("add-back", [([Indicate(nums[6], scale_factor=2.0, color=YELLOW_D)], 3), ([Transform(cap, cap3)], 3),
                                   ([Indicate(nums[6], scale_factor=2.0, color=YELLOW_D)], 3)], hold=2.5)
