"""Scene base of the clip templates (card 3A-04). A template subclasses `ClipScene`, fills `CHAPTERS` and `TEMPLATE_REV`,
reads its parameters from `self.params` and, in `construct`, calls `self.chapter_end(<id>)` when a chapter's content is
done. The driver (`manim/render_clip.py`) renders the scene once, then cuts the chapter files, the posters and the
manifest. The base also records, after every `play` and `wait`, the boxes of all Text and MathTex objects
(`layout.json`, read by `manim/qa/check_bbox.py`).

Templates may import only manim, numpy, math and this module (manim/qa/allowlist.py), so everything that touches files
lives in the driver, not here.
"""
from manim import (  # noqa: F401  (re-exported to the templates through `from _base import *`)
    BLUE_D, DOWN, GREEN_D, LEFT, ORIGIN, RED_D, RIGHT, UP, WHITE, YELLOW_D,
    Scene, Text, MathTex, Tex,
)

FRAME_W = 14.2222
FRAME_H = 8.0
FPS = 30
MIN_HOLD = 1.5
MAX_HOLD = 4.0


class ClipScene(Scene):
    # set by the template
    TEMPLATE_REV = 1
    CHAPTERS: list[tuple[str, float, float]] = []  # (id, startSec, endSec): the plan of the entry
    # set by the driver before the scene is built
    params: dict = {}
    locale: str | None = None

    def setup(self):
        self.display: dict[str, float] = {}
        self.marks: list[dict] = []
        self.keyframes: list[dict] = []
        self._chapter_i = 0
        self.camera.background_color = "#20263A"  # not black: the frame gate rejects near-black pictures

    # --- time ----------------------------------------------------------------------------------------------------

    def now(self) -> float:
        return float(self.renderer.time)

    def sequence(self, chapter_id: str, steps: list, hold: float = 2.0) -> None:
        """Plays `steps` one after another, dividing the time up to the closing hold in proportion to their weights, then
        ends the chapter. A step is `(animations, weight)`; `animations` is one animation or a list played together."""
        cid, start, end = self.CHAPTERS[self._chapter_i]
        if cid != chapter_id:
            raise ValueError(f"chapter {chapter_id} is played, but {cid} is next in the plan")
        budget = end - hold - self.now()
        if budget <= 0:
            raise ValueError(f"chapter {cid} has no time left for its steps")
        total = sum(w for _, w in steps)
        for anims, w in steps:
            anims = anims() if callable(anims) else anims  # a step may be built lazily, after the earlier steps ran
            anims = anims if isinstance(anims, (list, tuple)) else [anims]
            self.play(*anims, run_time=max(budget * w / total, 2 / FPS))
        self.chapter_end(chapter_id)

    def chapter_end(self, chapter_id: str) -> None:
        """Holds the last picture until the planned end of the chapter, then marks the boundary."""
        cid, start, end = self.CHAPTERS[self._chapter_i]
        if cid != chapter_id:
            raise ValueError(f"chapter {chapter_id} ended, but {cid} is next in the plan")
        gap = end - self.now()
        if gap < -0.5 / FPS:
            raise ValueError(f"chapter {cid} overran its plan by {-gap:.2f}s")
        if not (MIN_HOLD <= gap <= MAX_HOLD):
            # the frame gate wants a still closing hold of 1.5-4 s (check_ssim.py); say so while writing the template
            raise ValueError(f"chapter {cid} ends with a {gap:.2f}s hold, want {MIN_HOLD}-{MAX_HOLD}s")
        self.wait(gap)
        self.marks.append({"id": cid, "startSec": start, "endSec": end})
        self._chapter_i += 1

    def tear_down(self):
        if self._chapter_i != len(self.CHAPTERS):
            raise ValueError(f"{len(self.CHAPTERS) - self._chapter_i} chapter(s) never ended")

    # --- layout record -------------------------------------------------------------------------------------------

    def _record(self) -> None:
        items = []
        seen = set()
        for top in self.mobjects:
            for mob in top.get_family():
                if not isinstance(mob, (Text, MathTex, Tex)) or id(mob) in seen:
                    continue
                seen.add(id(mob))
                if mob.get_fill_opacity() < 0.05 and mob.get_stroke_opacity() < 0.05:
                    continue
                kind = "Text" if isinstance(mob, Text) else "MathTex"
                x0, x1 = float(mob.get_left()[0]), float(mob.get_right()[0])
                y0, y1 = float(mob.get_bottom()[1]), float(mob.get_top()[1])
                items.append({
                    "id": getattr(mob, "label_id", None) or f"{kind}{len(items)}",
                    "kind": kind,
                    "bbox": [round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3)],
                    "tokens": len(mob.text.split()) if isinstance(mob, Text) else 1,
                    "fontSize": float(getattr(mob, "font_size", 36)),
                })
        if not self.keyframes or self.keyframes[-1]["items"] != items:
            self.keyframes.append({"t": round(self.now(), 3), "items": items})

    def play(self, *args, **kwargs):
        super().play(*args, **kwargs)
        self._record()

    def wait(self, duration=1.0, *args, **kwargs):
        super().wait(duration, *args, **kwargs)
        self._record()

    @staticmethod
    def tag(mob, label_id: str):
        """Names a text object in layout.json (so a QA message says which label is wrong)."""
        mob.label_id = label_id
        return mob


# --- helpers shared by the templates ---------------------------------------------------------------------------------
import numpy as np  # noqa: E402
from manim import Line as _Line  # noqa: E402


def P(x: float, y: float = 0.0) -> np.ndarray:
    return np.array([float(x), float(y), 0.0])


def tex(s: str, size: float = 40, color=WHITE, tag: str | None = None):
    """A MathTex that the layout gate can name."""
    m = MathTex(s, font_size=size, color=color)
    if tag:
        m.label_id = tag
    return m


class View:
    """Maps problem coordinates to scene units: uniform scale and offset so that `points` fit in the box
    (cx, cy, w, h); `cap` limits the scale so a small figure is not blown up."""

    def __init__(self, points, box=(0.0, -0.2, 11.0, 5.4), cap: float = 1.2, y_up: bool = True):
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        dx, dy = max(x1 - x0, 1e-9), max(y1 - y0, 1e-9)
        self.s = min(box[2] / dx, box[3] / dy, cap)
        self.ox = box[0] - self.s * (x0 + x1) / 2
        self.oy = box[1] - self.s * (y0 + y1) / 2

    def __call__(self, x: float, y: float = 0.0) -> np.ndarray:
        return P(self.ox + self.s * x, self.oy + self.s * y)


def line_in_box(p, d, box=(-6.5, 6.5, -3.4, 3.0)):
    """The two ends of the line through scene point `p` with direction `d`, clipped to the box (x0, x1, y0, y1)."""
    x0, x1, y0, y1 = box
    ts = []
    for k, (lo, hi) in enumerate(((x0, x1), (y0, y1))):
        if abs(d[k]) > 1e-12:
            ts += [(lo - p[k]) / d[k], (hi - p[k]) / d[k]]
    pts = []
    for t in ts:
        q = np.array([p[0] + t * d[0], p[1] + t * d[1]])
        if x0 - 1e-6 <= q[0] <= x1 + 1e-6 and y0 - 1e-6 <= q[1] <= y1 + 1e-6:
            pts.append((t, q))
    if len(pts) < 2:
        return P(p[0], p[1]), P(p[0], p[1])
    pts.sort(key=lambda a: a[0])
    return P(*pts[0][1]), P(*pts[-1][1])
