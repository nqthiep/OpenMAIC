"""Text layout gate of the clip QA (task 3A-05, SCHEMA Phase 3 §6.1 step 3, ADR 0007 decision 7b).

The scene base (`templates/_base.py`) writes `layout.json` after every `play()`: for each keyframe the boxes of all
`Text` and `MathTex` objects in scene units (the Manim frame is 14.2222 x 8). This gate reads that report and checks:
  * every box lies inside the frame, with a margin on each side;
  * no two text boxes overlap;
  * at most 12 tokens of text on screen at once;
  * no text smaller than the minimum font size.
Natural sentences are not checked here (the lint on the template source does that).

Report shape:
  {"frame": {"w": 14.2222, "h": 8.0}, "keyframes": [
      {"t": 3.5, "items": [{"id": "label-h", "kind": "MathTex", "bbox": [x0, y0, x1, y1], "tokens": 3, "fontSize": 36}]}]}
Usage: python check_bbox.py LAYOUT.json   -> prints problems, exit 1 when there are any.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

FRAME = {"w": 14.2222, "h": 8.0}
MARGIN = 0.3
MAX_TOKENS = 12
MIN_FONT_SIZE = 24.0


def _overlap(a: list[float], b: list[float]) -> bool:
    """Boxes [x0, y0, x1, y1] overlap when they share area (touching edges is allowed)."""
    return min(a[2], b[2]) - max(a[0], b[0]) > 1e-6 and min(a[3], b[3]) - max(a[1], b[1]) > 1e-6


def check_keyframe(kf: dict[str, Any], frame: dict[str, float] = FRAME) -> list[str]:
    t = kf.get("t")
    where = f"t={t}"
    problems: list[str] = []
    items = kf.get("items") or []
    half_w, half_h = frame["w"] / 2, frame["h"] / 2
    tokens = 0
    for it in items:
        bbox = it.get("bbox")
        iid = it.get("id", "?")
        if not (isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(v, (int, float)) for v in bbox)):
            problems.append(f"{where}: {iid}: no bounding box")
            continue
        x0, y0, x1, y1 = bbox
        if x1 <= x0 or y1 <= y0:
            problems.append(f"{where}: {iid}: empty bounding box")
        if x0 < -half_w + MARGIN or x1 > half_w - MARGIN or y0 < -half_h + MARGIN or y1 > half_h - MARGIN:
            problems.append(f"{where}: {iid}: outside the frame margin of {MARGIN}")
        size = it.get("fontSize")
        if isinstance(size, (int, float)) and size < MIN_FONT_SIZE:
            problems.append(f"{where}: {iid}: font size {size} is below {MIN_FONT_SIZE:g}")
        tokens += int(it.get("tokens", 0))
    boxes = [(it.get("id", "?"), it["bbox"]) for it in items
             if isinstance(it.get("bbox"), list) and len(it["bbox"]) == 4 and all(isinstance(v, (int, float)) for v in it["bbox"])]
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            if _overlap(boxes[i][1], boxes[j][1]):
                problems.append(f"{where}: {boxes[i][0]} overlaps {boxes[j][0]}")
    if tokens > MAX_TOKENS:
        problems.append(f"{where}: {tokens} tokens on screen, at most {MAX_TOKENS}")
    return problems


def check_layout(report: dict[str, Any]) -> list[str]:
    frame = report.get("frame") or FRAME
    kfs = report.get("keyframes")
    if not isinstance(kfs, list) or not kfs:
        return ["layout: no keyframes"]
    problems: list[str] = []
    for kf in kfs:
        problems += check_keyframe(kf, frame)
    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: check_bbox.py LAYOUT.json", file=sys.stderr)
        return 2
    problems = check_layout(json.loads(Path(argv[1]).read_text(encoding="utf8")))
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
