"""Tests of the real runner (3C-02) with a shell command standing in for Manim."""
import json
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest

import runner as runnermod

QA = Path(__file__).resolve().parents[1] / "qa"
OK_TEMPLATE = "from manim import Scene\n\nclass S(Scene):\n    def construct(self):\n        pass\n"


def job():
    return SimpleNamespace(template_id="t", params={"a": 1}, locale=None)


def setup(tmp_path, source=OK_TEMPLATE):
    tdir = tmp_path / "templates"
    tdir.mkdir(parents=True)
    (tdir / "t.py").write_text(source)
    out = tmp_path / "out"
    out.mkdir(parents=True)
    return tdir, out


def test_missing_command_template_and_allowlist(tmp_path, monkeypatch):
    monkeypatch.delenv("MANIM_RENDER_CMD", raising=False)
    tdir, out = setup(tmp_path)
    with pytest.raises(RuntimeError, match="MANIM_RENDER_CMD"):
        runnermod.make_runner(tdir, QA)(job(), out, threading.Event())
    run = runnermod.make_runner(tdir, QA, command="true")
    bad = SimpleNamespace(template_id="nope", params={}, locale=None)
    with pytest.raises(RuntimeError, match="template file missing"):
        run(bad, out, threading.Event())
    tdir2, out2 = setup(tmp_path / "x", "import os\nos.system('id')\n")
    with pytest.raises(RuntimeError, match="allowlist"):
        runnermod.make_runner(tdir2, QA, command="true")(job(), out2, threading.Event())


def test_exit_code_missing_manifest_and_secret(tmp_path, monkeypatch):
    monkeypatch.setenv("MANIM_SERVICE_TOKEN", "s3cret")
    tdir, out = setup(tmp_path)
    with pytest.raises(RuntimeError, match="exited 3: oops"):
        runnermod.make_runner(tdir, QA, command="echo oops >&2; exit 3")(job(), out, threading.Event())
    with pytest.raises(RuntimeError, match="no manifest"):
        runnermod.make_runner(tdir, QA, command="true")(job(), out, threading.Event())
    # the renderer sees the clip variables but not the service secret
    probe = 'echo "$CLIP_ID $CLIP_PARAMS ${MANIM_SERVICE_TOKEN:-none}" > "$CLIP_OUT/env.txt"; exit 0'
    with pytest.raises(RuntimeError, match="no manifest"):
        runnermod.make_runner(tdir, QA, command=probe)(job(), out, threading.Event())
    assert (out / "env.txt").read_text().strip() == 't {"a": 1} none'


def test_qa_failure_is_reported(tmp_path):
    tdir, out = setup(tmp_path)
    cmd = f"echo '{json.dumps({'chapters': [{'id': 'c', 'file': 'c.mp4', 'posterFile': 'c.png'}]})}' > \"$CLIP_OUT/manifest.json\""
    with pytest.raises(RuntimeError, match="qa:.*missing"):
        runnermod.make_runner(tdir, QA, command=cmd)(job(), out, threading.Event())


def test_cancel_kills_the_renderer(tmp_path):
    tdir, out = setup(tmp_path)
    ev = threading.Event()
    threading.Timer(0.3, ev.set).start()
    with pytest.raises(RuntimeError, match="cancelled"):
        runnermod.make_runner(tdir, QA, command="sleep 30", poll_s=0.05)(job(), out, ev)
