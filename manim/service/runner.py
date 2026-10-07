"""The real runner of the manim-service (task 3C-02): one job = one template, rendered by the command in
MANIM_RENDER_CMD with no network, then checked by the QA gates of manim/qa (allowlist before, video and layout after).

The command gets the same environment as `scripts/render-clips.ts` gives it (CLIP_ID, CLIP_PARAMS, CLIP_TEMPLATE,
CLIP_OUT, plus CLIP_LOCALE) and must write manifest.json, layout.json, <chapter>.mp4 and <chapter>.png into CLIP_OUT.
A runner raises on any problem; the job manager records the message as the job's error.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Callable


def make_runner(templates_dir: Path, qa_dir: Path, command: str | None = None,
                poll_s: float = 0.2) -> Callable[[Any, Path, threading.Event], None]:
    sys.path.insert(0, str(qa_dir))
    import allowlist  # noqa: E402  (manim/qa)
    import check_bbox  # noqa: E402
    import check_video  # noqa: E402

    def run(job: Any, out_dir: Path, cancelled: threading.Event) -> None:
        cmd = command or os.environ.get("MANIM_RENDER_CMD")
        if not cmd:
            raise RuntimeError("MANIM_RENDER_CMD is not set")
        template = templates_dir / f"{job.template_id.replace('-', '_')}.py"
        if not template.is_file():
            raise RuntimeError(f"template file missing: {job.template_id}")
        bad = allowlist.check_source(template.read_text(encoding="utf8"))
        if bad:
            raise RuntimeError("allowlist: " + "; ".join(bad[:3]))
        env = {**os.environ, "CLIP_ID": job.template_id, "CLIP_PARAMS": json.dumps(job.params),
               "CLIP_TEMPLATE": str(template), "CLIP_OUT": str(out_dir), "CLIP_LOCALE": job.locale or ""}
        env.pop("MANIM_SERVICE_TOKEN", None)  # the template process never sees the service secret
        proc = subprocess.Popen(cmd, shell=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        while True:
            try:
                _, err = proc.communicate(timeout=poll_s)
                break
            except subprocess.TimeoutExpired:
                if cancelled.is_set():  # cancelled by DELETE or by the deadline
                    proc.kill()
                    proc.communicate()
                    raise RuntimeError("cancelled")
        if proc.returncode != 0:
            raise RuntimeError(f"renderer exited {proc.returncode}: {(err or '').strip()[-300:]}")
        manifest = out_dir / "manifest.json"
        if not manifest.is_file():
            raise RuntimeError("renderer wrote no manifest.json")
        problems = check_video.check_clip(manifest)
        layout = out_dir / "layout.json"
        if layout.is_file():
            problems += check_bbox.check_layout(json.loads(layout.read_text(encoding="utf8")))
        if problems:
            raise RuntimeError("qa: " + "; ".join(problems[:3]))

    return run
