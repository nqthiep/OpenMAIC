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
