"""Parameter check and cache key of the manim-service (task 3C-01), written to agree with the TypeScript originals
(`lib/tutor/input-spec.ts`, `lib/clips/cache-key.ts`) byte for byte; `fixtures/parity.json` replays TypeScript's own answers.

Only the spec kinds that clip templates use are supported: int, number, enum, int-array and record. A template whose
spec uses another kind is refused when the service starts, never at the first request.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

KEY_VERSION = 1
STEP_EPSILON = 1e-9
SUPPORTED = {"int", "number", "enum", "int-array", "record"}


def is_int(v: Any) -> bool:
    """JavaScript's Number.isInteger: an int, or a float with no fractional part (JSON `2.0` parses to 2 in JS)."""
    if isinstance(v, bool):
        return False
    return isinstance(v, int) or (isinstance(v, float) and math.isfinite(v) and v.is_integer())


def is_number(v: Any) -> bool:
    return not isinstance(v, bool) and isinstance(v, (int, float)) and math.isfinite(v)


def unsupported_kinds(spec: dict[str, Any]) -> list[str]:
    """Spec kinds the service cannot check (recursively); empty when the spec is fully supported."""
    kind = spec.get("kind")
    if kind not in SUPPORTED:
        return [str(kind)]
    if kind == "record":
        out: list[str] = []
        for field in spec.get("fields", {}).values():
            out += unsupported_kinds(field)
        return out
    return []


def _in_range(v: float, r: list[float]) -> bool:
    return r[0] <= v <= r[1]


def validate_params(spec: dict[str, Any], raw: Any, path: str = "$") -> list[str]:
    """Problems of `raw` against `spec`; empty means valid. The messages follow the TypeScript issue names."""
    kind = spec["kind"]
    if kind == "int":
        if not is_int(raw):
            return [f"{path}: not-int"]
        return [] if _in_range(raw, spec["range"]) else [f"{path}: out-of-range"]
    if kind == "number":
        if not is_number(raw):
            return [f"{path}: not-number"]
        if not _in_range(raw, spec["range"]):
            return [f"{path}: out-of-range"]
        q = (raw - spec["range"][0]) / spec["step"]
        if not math.isfinite(q) or abs(q - math.floor(q + 0.5)) > STEP_EPSILON:
            return [f"{path}: not-on-step"]
        return []
    if kind == "enum":
        for x in spec["values"]:
            # JavaScript's === between a number and a number, or a string and a string; never a bool
            if isinstance(raw, bool) or isinstance(x, bool):
                continue
            if isinstance(x, str) and isinstance(raw, str) and x == raw:
                return []
            if is_number(x) and is_number(raw) and x == raw:
                return []
        return [f"{path}: not-in-enum"]
    if kind == "int-array":
        if not isinstance(raw, list):
            return [f"{path}: not-array"]
        if not _in_range(len(raw), spec["len"]):
            return [f"{path}: bad-length"]
        problems: list[str] = []
        last: Any = None
        for i, v in enumerate(raw):
            p = f"{path}[{i}]"
            if not is_int(v):
                problems.append(f"{p}: not-int")
            elif not _in_range(v, spec["range"]):
                problems.append(f"{p}: out-of-range")
            elif spec.get("strictlyIncreasing") and last is not None and not v > last:
                problems.append(f"{p}: not-increasing")
            else:
                last = v
        return problems
    if kind == "record":
        if not isinstance(raw, dict):
            return [f"{path}: not-object"]
        problems = []
        for k in raw:
            if k not in spec["fields"]:
                problems.append(f"{k if path == '$' else path + '.' + k}: unknown-key")
        for k, sub in spec["fields"].items():
            p = k if path == "$" else f"{path}.{k}"
            if k not in raw:
                problems.append(f"{p}: missing")
            else:
                problems += validate_params(sub, raw[k], p)
        return problems
    return [f"{path}: bad-spec"]


def _decimals(step: float) -> int:
    text = repr(step)
    return len(text.split(".")[1]) if "." in text else 0


def quantise(spec: dict[str, Any], value: Any) -> Any:
    """Numbers of the `number` kind snapped to their step, as in the TypeScript `quantise`; everything else unchanged."""
    kind = spec["kind"]
    if kind == "number":
        if not is_number(value):
            return value
        lo, step = spec["range"][0], spec["step"]
        q = math.floor((value - lo) / step + 0.5)
        return float(f"{lo + q * step:.{_decimals(step)}f}")
    if kind == "record" and isinstance(value, dict):
        return {k: (quantise(spec["fields"][k], v) if k in spec["fields"] else v) for k, v in value.items()}
    return value


def _plain(value: Any) -> Any:
    """Integer-valued floats become ints and -0 becomes 0, so the JSON text matches JavaScript's JSON.stringify."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        if math.isfinite(value) and value.is_integer():
            return int(value)
        return value
    if isinstance(value, list):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    return value


def canonical_json(value: Any) -> str:
    """Sorted keys, no spaces, non-ASCII kept as is: the same text as the TypeScript `canonicalJSON`."""
    return json.dumps(_plain(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def cache_key(template_id: str, template_rev: int, params: Any, spec: dict[str, Any], locale: str | None,
              profile: str, image_digest: str) -> str:
    """`sha256:` + sha256(canonicalJSON([1, templateId, templateRev, paramsCanon, localeOrNull, profile, imageDigest]))."""
    body = canonical_json([KEY_VERSION, template_id, template_rev, quantise(spec, params), locale, profile, image_digest])
    return "sha256:" + hashlib.sha256(body.encode("utf8")).hexdigest()
