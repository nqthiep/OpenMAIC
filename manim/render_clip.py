"""Driver of the clip renderer: the command behind MANIM_RENDER_CMD (cards 3A-04, 3C-02).

  python manim/render_clip.py        with CLIP_TEMPLATE, CLIP_PARAMS (JSON), CLIP_OUT, optional CLIP_ID / CLIP_LOCALE

Renders the template's scene once at 1280x720, 30 fps, then writes into CLIP_OUT: <chapter>.mp4 and <chapter>.png for
each chapter (cut with ffmpeg at the planned boundaries), master.mp4, layout.json and manifest.json (with the numbers the
scene put in `display`). Exit code 0 only when all of that is written. This file runs OUTSIDE the template sandbox, it is
not itself an LLM-written template.
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "templates"))

W, H, FPS = 1280, 720, 30
PROFILE = "qm-720p30"


def load_scene_class(template: Path):
    spec = importlib.util.spec_from_file_location(f"clip_{template.stem}", template)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from _base import ClipScene
    classes = [v for v in vars(mod).values()
               if isinstance(v, type) and issubclass(v, ClipScene) and v is not ClipScene and v.__module__ == mod.__name__]
    if len(classes) != 1:
        raise SystemExit(f"{template.name}: expected exactly one ClipScene subclass, found {len(classes)}")
    return classes[0]


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main() -> int:
    from manim import config, __version__
    template = Path(os.environ["CLIP_TEMPLATE"])
    out = Path(os.environ["CLIP_OUT"])
    out.mkdir(parents=True, exist_ok=True)
    cls = load_scene_class(template)
    cls.params = json.loads(os.environ.get("CLIP_PARAMS", "{}"))
    cls.locale = os.environ.get("CLIP_LOCALE") or None

    with tempfile.TemporaryDirectory() as media:
        config.media_dir = media
        config.pixel_width, config.pixel_height, config.frame_rate = W, H, FPS
        config.disable_caching = True
        config.verbosity = "WARNING"
        config.progress_bar = "none"
        config.output_file = "master"
        config.write_to_movie = True
        scene = cls()
        scene.render()
        masters = list(Path(media).rglob("master.mp4"))
        if len(masters) != 1:
            raise SystemExit("the scene produced no master.mp4")
        master = Path(media) / "full.mp4"
        ffmpeg("-i", str(masters[0]), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an", str(master))

        chapters = []
        for m in scene.marks:
            cid, a, b = m["id"], m["startSec"], m["endSec"]
            ffmpeg("-i", str(master), "-ss", f"{a:.4f}", "-t", f"{b - a:.4f}", "-c:v", "libx264",
                   "-pix_fmt", "yuv420p", "-r", str(FPS), "-an", "-movflags", "+faststart", str(out / f"{cid}.mp4"))
            # the poster is the picture shortly before the end of the chapter, when its drawing is complete
            ffmpeg("-ss", f"{max(b - 0.5, a):.4f}", "-i", str(master), "-frames:v", "1", str(out / f"{cid}.png"))
            chapters.append({"id": cid, "file": f"{cid}.mp4", "posterFile": f"{cid}.png", "startSec": a, "endSec": b,
                             "sizeBytes": (out / f"{cid}.mp4").stat().st_size})

    (out / "layout.json").write_text(json.dumps({"frame": {"w": 14.2222, "h": 8.0}, "keyframes": scene.keyframes}))
    manifest = {
        "clipId": os.environ.get("CLIP_ID") or template.stem.replace("_", "-"),
        "engineVersion": f"manim-{__version__}",
        "templateRev": cls.TEMPLATE_REV,
        "profile": PROFILE,
        "w": W, "h": H, "fps": FPS,
        "durationSec": scene.marks[-1]["endSec"],
        "chapters": chapters,
        "display": scene.display,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
