import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from allowlist import check_source

CLEAN = '''
import math
import numpy as np
from manim import Circle, Create, MathTex
from _base import ClipScene

class Demo(ClipScene):
    def construct(self):
        r = math.sqrt(2)
        c = Circle(radius=np.float64(r))
        self.play(Create(c))
        self.record("r", r)
'''


def test_clean_template_passes():
    assert check_source(CLEAN) == []


@pytest.mark.parametrize(
    "snippet",
    [
        "__import__('os')",
        "getattr(__builtins__, 'ev' + 'al')",
        "from os import system",
        "().__class__.__bases__",
        "import subprocess",
        "import socket",
        "open('/etc/passwd')",
        "eval('1')",
        "exec('x = 1')",
        "compile('1', 'f', 'eval')",
        "globals()",
        "locals()",
        "vars()",
        "setattr(object, 'x', 1)",
        "from manim import *\nimport os",
        "import importlib",
        "import os.path",
        "from . import x",
        "x = {}.__class__",
        "def f():\n    global a",
        "y = 'x'.__len__()",
        "name = '__builtins__'",
    ],
)
def test_forbidden_forms_are_caught(snippet):
    problems = check_source(snippet)
    assert problems, snippet
    assert all(p.split(":")[0].isdigit() for p in problems)


def test_syntax_error_is_reported_not_raised():
    assert check_source("def (:")[0].endswith(("syntax error: invalid syntax",)) or "syntax error" in check_source("def (:")[0]


def test_cli_exit_codes_and_output():
    with tempfile.TemporaryDirectory() as d:
        good = Path(d, "good.py")
        good.write_text(CLEAN)
        bad = Path(d, "bad.py")
        bad.write_text("import os\n")
        here = Path(__file__).parent / "allowlist.py"
        ok = subprocess.run([sys.executable, str(here), str(good)], capture_output=True, text=True)
        assert ok.returncode == 0 and ok.stdout == ""
        ko = subprocess.run([sys.executable, str(here), str(bad)], capture_output=True, text=True)
        assert ko.returncode == 1
        assert "1:" in ko.stdout and "os" in ko.stdout
