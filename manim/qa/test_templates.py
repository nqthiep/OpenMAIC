"""Every file in manim/templates passes the AST allowlist and belongs to a clip of the catalog (needs no Manim)."""
import re
from pathlib import Path

import pytest

import allowlist

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = sorted(p for p in (ROOT / "manim" / "templates").glob("*.py") if p.name != "_base.py")
CLIP_FILES = {p.stem for p in (ROOT / "lib" / "subjects" / "math" / "clips").glob("*.ts") if p.stem != "index"}


@pytest.mark.parametrize("path", TEMPLATES, ids=lambda p: p.name)
def test_template_is_allowed_and_known(path):
    assert allowlist.check_source(path.read_text(encoding="utf8")) == []
    assert path.stem.replace("_", "-") in CLIP_FILES
    assert re.search(r"^class \w+\(ClipScene\):", path.read_text(encoding="utf8"), re.M)
