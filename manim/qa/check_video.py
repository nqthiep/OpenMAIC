"""Video and manifest gate of the clip QA (task 3A-05, SCHEMA Phase 3 §6.1 step 3, ADR 0007 decision 7a).

For one rendered clip (a manifest.json and the mp4 files beside it):
  * ffprobe: codec h264, pixel format yuv420p, the size and frame rate the entry asks for;
  * the length of every chapter file (8-25 s) and of the whole clip (20-90 s);
  * each length within 5 % of what the manifest says;
  * the manifest names exactly the chapters of the entry (ids and order).

Usage: python check_video.py MANIFEST.json [--entry-chapters id1,id2,...]
Prints one `problem` per line and exits 1 when there is any; exits 0 otherwise.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

CHAPTER_RANGE = (8.0, 25.0)
CLIP_RANGE = (20.0, 90.0)
TOLERANCE = 0.05
EXPECTED = {"w": 1280, "h": 720, "fps": 30}


def probe(path: Path) -> dict[str, Any]:
    """ffprobe summary of the first video stream: codec, pix_fmt, width, height, fps and duration (seconds)."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=codec_name,pix_fmt,width,height,r_frame_rate:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=60,
    ).stdout
    data = json.loads(out)
    stream = (data.get("streams") or [{}])[0]
    num, _, den = str(stream.get("r_frame_rate", "0/1")).partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    return {
        "codec": stream.get("codec_name"),
        "pix_fmt": stream.get("pix_fmt"),
        "w": stream.get("width"),
        "h": stream.get("height"),
        "fps": fps,
        "duration": float(data.get("format", {}).get("duration", 0.0)),
    }


def _within(measured: float, declared: float, tol: float = TOLERANCE) -> bool:
    return declared > 0 and abs(measured - declared) <= tol * declared


def check_file(name: str, info: dict[str, Any], expected: dict[str, int], declared_len: float | None,
               length_range: tuple[float, float]) -> list[str]:
    """Problems of one video file given its probe `info`."""
    problems: list[str] = []
    if info["codec"] != "h264":
        problems.append(f"{name}: codec is {info['codec']}, want h264")
    if info["pix_fmt"] != "yuv420p":
        problems.append(f"{name}: pixel format is {info['pix_fmt']}, want yuv420p")
    if (info["w"], info["h"]) != (expected["w"], expected["h"]):
        problems.append(f"{name}: size is {info['w']}x{info['h']}, want {expected['w']}x{expected['h']}")
    if abs(info["fps"] - expected["fps"]) > 0.01:
        problems.append(f"{name}: frame rate is {info['fps']:.2f}, want {expected['fps']}")
    lo, hi = length_range
    if not lo <= info["duration"] <= hi:
        problems.append(f"{name}: length {info['duration']:.2f}s is outside {lo:g}-{hi:g}s")
    if declared_len is not None and not _within(info["duration"], declared_len):
        problems.append(f"{name}: length {info['duration']:.2f}s differs from the manifest's {declared_len:.2f}s by more than 5%")
    return problems


def check_manifest_chapters(manifest: dict[str, Any], entry_chapters: list[str] | None) -> list[str]:
    """The manifest lists exactly the chapters of the entry, in order, with sane times."""
    problems: list[str] = []
    chapters = manifest.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        return ["manifest: no chapters"]
    ids = [c.get("id") for c in chapters]
    if len(set(ids)) != len(ids):
        problems.append("manifest: duplicate chapter id")
    if entry_chapters is not None and ids != entry_chapters:
        missing = [c for c in entry_chapters if c not in ids]
        extra = [c for c in ids if c not in entry_chapters]
        problems.append(f"manifest: chapters {ids} differ from the entry's {entry_chapters} (missing {missing}, extra {extra})")
    prev_end = 0.0
    for c in chapters:
        start, end = c.get("startSec"), c.get("endSec")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or end <= start:
            problems.append(f"manifest: chapter {c.get('id')} has bad times")
            continue
        if abs(start - prev_end) > 1e-6:
            problems.append(f"manifest: chapter {c.get('id')} starts at {start} but the previous one ends at {prev_end}")
        prev_end = end
    return problems


def check_clip(manifest_path: Path, entry_chapters: list[str] | None = None) -> list[str]:
    """Every problem of one clip directory: manifest, per-chapter files and the optional master."""
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    base = manifest_path.parent
    expected = {"w": manifest.get("w", EXPECTED["w"]), "h": manifest.get("h", EXPECTED["h"]),
                "fps": manifest.get("fps", EXPECTED["fps"])}
    problems = check_manifest_chapters(manifest, entry_chapters)
    total = 0.0
    for c in manifest.get("chapters") or []:
        path = base / str(c.get("file", ""))
        if not path.is_file():
            problems.append(f"{c.get('id')}: file {c.get('file')} is missing")
            continue
        declared = float(c["endSec"]) - float(c["startSec"]) if isinstance(c.get("startSec"), (int, float)) and isinstance(c.get("endSec"), (int, float)) else None
        problems += check_file(str(c.get("id")), probe(path), expected, declared, CHAPTER_RANGE)
        total += declared or 0.0
        poster = base / str(c.get("posterFile", ""))
        if not c.get("posterFile") or not poster.is_file():
            problems.append(f"{c.get('id')}: poster {c.get('posterFile')} is missing")
    declared_total = manifest.get("durationSec")
    if not (CLIP_RANGE[0] <= total <= CLIP_RANGE[1]):
        problems.append(f"clip: total length {total:.2f}s is outside {CLIP_RANGE[0]:g}-{CLIP_RANGE[1]:g}s")
    if isinstance(declared_total, (int, float)) and not _within(total, float(declared_total)):
        problems.append(f"clip: chapters add up to {total:.2f}s but the manifest says {declared_total}s")
    master = manifest.get("master")
    if isinstance(master, dict) and master.get("file"):
        path = base / master["file"]
        if not path.is_file():
            problems.append(f"master: file {master['file']} is missing")
        else:
            problems += check_file("master", probe(path), expected, float(declared_total) if isinstance(declared_total, (int, float)) else None, CLIP_RANGE)
    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: check_video.py MANIFEST.json [--entry-chapters a,b,c]", file=sys.stderr)
        return 2
    entry = None
    if "--entry-chapters" in argv:
        entry = argv[argv.index("--entry-chapters") + 1].split(",")
    problems = check_clip(Path(argv[1]), entry)
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
