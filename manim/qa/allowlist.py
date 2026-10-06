"""AST allowlist for LLM-written Manim template files (task 3A-06, ADR 0014 decision 4).

Usage: python allowlist.py FILE.py   -> exit 0 if clean; else print `line: reason` and exit 1.

Only `manim`, `numpy`, `math` and `_base` may be imported. Dangerous names are refused wherever
they appear (a call, an attribute, a bare reference, an alias); so is any attribute that starts
with `__`; `getattr`/`setattr`/`delattr` are refused outright (a "dynamic name" cannot be proven
static, so the safe rule is no use at all).
"""
import ast
import sys

ALLOWED_MODULES = {"manim", "numpy", "math", "_base"}
BANNED_NAMES = {
    "os", "sys", "subprocess", "socket", "open", "eval", "exec", "compile", "__import__",
    "globals", "locals", "vars", "getattr", "setattr", "delattr", "input", "breakpoint",
    "importlib", "builtins", "__builtins__", "shutil", "pathlib", "ctypes", "pickle", "marshal",
}


def check_source(source: str) -> list[str]:
    """Return a list of 'line: reason' strings; empty means the source passes."""
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return [f"{e.lineno or 0}: syntax error: {e.msg}"]
    problems: list[str] = []

    def bad(node: ast.AST, why: str) -> None:
        problems.append(f"{getattr(node, 'lineno', 0)}: {why}")

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_MODULES:
                    bad(node, f"import of '{alias.name}' is not allowed")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if node.level or root not in ALLOWED_MODULES:
                bad(node, f"import from '{'.' * node.level}{node.module or ''}' is not allowed")
        elif isinstance(node, ast.Name):
            if node.id in BANNED_NAMES:
                bad(node, f"name '{node.id}' is not allowed")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                bad(node, f"attribute '{node.attr}' is not allowed")
            if node.attr in BANNED_NAMES:
                bad(node, f"attribute '{node.attr}' is not allowed")
        elif isinstance(node, ast.alias):
            if node.name in BANNED_NAMES:
                bad(node, f"name '{node.name}' is not allowed")
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            bad(node, "global/nonlocal is not allowed")
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if node.value.startswith("__") and node.value.endswith("__") and len(node.value) > 4:
                bad(node, f"dunder string '{node.value}' is not allowed")
    return sorted(set(problems), key=lambda s: int(s.split(":")[0]))


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: allowlist.py FILE.py", file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as f:
        problems = check_source(f.read())
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
