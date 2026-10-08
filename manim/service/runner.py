"""The real runner of the manim-service (task 3C-02): one job = one template, rendered by the command in
MANIM_RENDER_CMD with no network, then checked by the QA gates of manim/qa (allowlist before, video and layout after).

The command gets the same environment as `scripts/render-clips.ts` gives it (CLIP_ID, CLIP_PARAMS, CLIP_TEMPLATE,
CLIP_OUT, plus CLIP_LOCALE) and must write manifest.json, layout.json, <chapter>.mp4 and <chapter>.png into CLIP_OUT.
A runner raises on any problem; the job manager records the message as the job's error.
"""
from __future__ import annotations

import json
import os
import shlex
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Callable


# What the renderer process gets: nothing of the service's environment (no token, no other secret) and TeX locked down.
# kpathsea reads these variables ahead of texmf.cnf: no shell escape, and only files below the working directory or the TeX
# trees may be opened or written ("paranoid"), so `\\input{/etc/passwd}` and `\\write18` do nothing.
RENDER_ENV_KEEP = ("PATH", "HOME", "LANG", "LC_ALL", "TZ", "TEXMFHOME", "TEXMFVAR", "TEXMFCONFIG", "FONTCONFIG_FILE", "FONTCONFIG_PATH")
TEX_LOCKDOWN = {"shell_escape": "f", "openin_any": "p", "openout_any": "p"}
# Limits of the renderer process (setrlimit, in the child before exec): memory, CPU time, size of any file it writes, open files.
DEFAULT_LIMITS = {"memory_bytes": 3 * 1024**3, "cpu_seconds": 900, "file_bytes": 512 * 1024**2, "open_files": 512}


def render_env(job: Any, template: Path, out_dir: Path, base: dict[str, str] | None = None) -> dict[str, str]:
    base = os.environ if base is None else base
    env = {k: base[k] for k in RENDER_ENV_KEEP if k in base}
    env.update(TEX_LOCKDOWN)
    env.update({"CLIP_ID": job.template_id, "CLIP_PARAMS": json.dumps(job.params), "CLIP_TEMPLATE": str(template),
                "CLIP_OUT": str(out_dir), "CLIP_LOCALE": job.locale or ""})
    return env


def limit_prefix(limits: dict[str, int]) -> str:
    """`ulimit` calls that run in the child shell before the renderer: memory (KiB), CPU time, file size (512-byte blocks), open files.
    A limit the platform refuses (macOS has no RLIMIT_AS) is skipped; on Linux, in the image, all of them hold."""
    return (f"ulimit -c 0; ulimit -v {limits['memory_bytes'] // 1024} 2>/dev/null; ulimit -t {limits['cpu_seconds']} 2>/dev/null; "
            f"ulimit -f {limits['file_bytes'] // 512} 2>/dev/null; ulimit -n {limits['open_files']} 2>/dev/null; ")


def kill_group(proc: subprocess.Popen) -> None:
    """Kills the whole process group of the renderer (the shell, python, TeX, anything it forked)."""
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def make_runner(templates_dir: Path, qa_dir: Path, command: str | None = None, poll_s: float = 0.2,
                limits: dict[str, int] | None = None) -> Callable[[Any, Path, threading.Event], None]:
    sys.path.insert(0, str(qa_dir))
    import allowlist  # noqa: E402  (manim/qa)
    import check_bbox  # noqa: E402
    import check_video  # noqa: E402
    lim = {**DEFAULT_LIMITS, **(limits or {})}

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
        # own session, so one kill takes the whole tree with it; its own limits; a clean environment
        proc = subprocess.Popen(limit_prefix(lim) + "exec sh -c " + shlex.quote(cmd), shell=True, env=render_env(job, template, out_dir), stdout=subprocess.DEVNULL,
                                stderr=subprocess.PIPE, text=True, start_new_session=True, cwd=out_dir)
        while True:
            try:
                _, err = proc.communicate(timeout=poll_s)
                break
            except subprocess.TimeoutExpired:
                if cancelled.is_set():  # cancelled by DELETE or by the deadline
                    kill_group(proc)
                    proc.communicate()
                    raise RuntimeError("cancelled")
        kill_group(proc)  # a renderer that exited may have left children behind
        if proc.returncode != 0:
            raise RuntimeError(f"renderer exited {proc.returncode}: {(err or '').strip()[-300:]}")
        manifest = out_dir / "manifest.json"
        if not manifest.is_file():
            raise RuntimeError(f"renderer wrote no manifest.json: {(err or '').strip()[-300:]}")
        problems = check_video.check_clip(manifest)
        layout = out_dir / "layout.json"
        if layout.is_file():
            problems += check_bbox.check_layout(json.loads(layout.read_text(encoding="utf8")))
        if problems:
            raise RuntimeError("qa: " + "; ".join(problems[:3]))

    return run
