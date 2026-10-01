#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kiểm tra bộ tài liệu docs/tutor.

Chạy từ bất kỳ thư mục nào:  python3 docs/tutor/tools/check_docs.py
Thoát mã 1 nếu có vấn đề.

Kiểm:
  1. Mỗi .md có khối đầu (Trạng thái, Ngày) và "Tóm tắt".
  2. Fence ``` cân bằng; khối ```json hợp lệ (dùng ```jsonc nếu có chú thích);
     khối ```mermaid: kiểu hợp lệ, subgraph/end cân bằng (flowchart) hoặc
     alt/loop/opt/par/... với end cân bằng (sequenceDiagram), không lẻ dấu ".
  3. Liên kết tương đối tồn tại; "§N" trong chữ liên kết trỏ đúng mục.
  4. Tham chiếu `file:dòng` trỏ tới tệp có thật và dòng không vượt cuối tệp
     (gồm tệp ở gốc repo: middleware.ts, next.config.ts, Dockerfile, ...).
  5. NEO NỘI DUNG: với các tham chiếu quan trọng trong ANCHORS, chuỗi kỳ vọng
     phải xuất hiện trong khoảng dòng được trích (±2 dòng).
  6. Đủ loại tài liệu bắt buộc; ADR đánh số liên tục từ 0001; mỗi ADR có SWOT.
  7. ID `NFR-Xn` và `RISKS Rnn` được tham chiếu phải tồn tại trong NFR.md / RISKS.md.
  8. BẢNG TASK (tasks/*.md): id duy nhất; card đủ trường (Cấp, Cỡ, Phụ thuộc, Sở hữu,
     "Xong khi"); phụ thuộc tồn tại và không vòng; hai task không có quan hệ trước-sau
     không sở hữu chung file (trừ hai task tích hợp I-* của leader); bảng "Đợt" ở
     tasks/README.md khớp đợt tính từ phụ thuộc. Đặt PRINT_WAVES=1 để in bảng đợt tính được.

GIỚI HẠN (RISKS R24): nội dung chỉ được kiểm cho các tham chiếu có trong ANCHORS;
các tham chiếu khác chỉ được kiểm tồn tại và khoảng dòng.
"""
import glob
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, ".."))
REPO = os.path.normpath(os.path.join(DOCS, "..", ".."))
os.chdir(REPO)
ROOT = os.path.relpath(DOCS, REPO)

files = sorted(glob.glob(ROOT + "/**/*.md", recursive=True))
problems = []


def rd(p):
    return io.open(p, encoding="utf8").read()


def check_header():
    for f in files:
        t = rd(f)
        head = "\n".join(t.split("\n")[:14])
        if "**Tóm tắt:**" not in t[:4000]:
            problems.append(("no-summary", f))
        if not re.search(r"\*\*(Trạng thái|Status)\*\*", head):
            problems.append(("no-status", f))
        if not re.search(r"\*\*(Ngày|Date)\*\*", head):
            problems.append(("no-date", f))


def check_blocks():
    seq_open = re.compile(r"^\s*(alt|opt|loop|par|critical|break|rect)\b", re.M)
    for f in files:
        t = rd(f)
        if t.count("```") % 2:
            problems.append(("fence", f))
        for m in re.finditer(r"```json\n(.*?)```", t, re.S):
            try:
                json.loads(m.group(1))
            except Exception:
                line = t[: m.start()].count("\n") + 1
                problems.append(("json (dùng ```jsonc nếu có chú thích)", f, line))
        for m in re.finditer(r"```mermaid\n(.*?)```", t, re.S):
            body = m.group(1)
            first = body.strip().split("\n")[0].split()[0]
            if first not in ("flowchart", "erDiagram", "graph", "sequenceDiagram"):
                problems.append(("mermaid-type", f, first))
            ends = len(re.findall(r"^\s*end\s*$", body, re.M))
            if first in ("flowchart", "graph"):
                opens = len(re.findall(r"^\s*subgraph\b", body, re.M))
            elif first == "sequenceDiagram":
                opens = len(seq_open.findall(body))
            else:
                opens = ends
            if opens != ends:
                problems.append(("mermaid-block-end", f, opens, ends))
            for ln in body.split("\n"):
                if ln.count('"') % 2:
                    problems.append(("mermaid-quote", f, ln.strip()[:60]))
                if re.search(r"<[A-Za-z][^>]*>", ln.replace("<br/>", "")):
                    problems.append(("mermaid-html", f, ln.strip()[:60]))


def check_links():
    heads = {}
    for f in files:
        heads[os.path.abspath(f)] = re.findall(r"^#{2,3} (\d+[a-z]?)[\.\s]", rd(f), re.M)
    link = re.compile(r"\[([^\]\n]+)\]\(([^)#\s]+\.md|[^)#\s]+/)(#[^)]*)?\)")
    for f in files:
        t = rd(f)
        for m in link.finditer(t):
            text, target = m.group(1), m.group(2)
            path = os.path.normpath(os.path.join(os.path.dirname(f), target))
            if not os.path.exists(path):
                problems.append(("broken-link", f, target))
                continue
            sec = re.search(r"§\s*(\d+[a-z]?)", text)
            if sec and os.path.isfile(path) and path.endswith(".md"):
                if sec.group(1) not in heads.get(os.path.abspath(path), []):
                    problems.append(("missing-section", f, text, target))


PLANNED = (
    "lib/tutor", "lib/widgets", "lib/subjects", "lib/clips", "tests/tutor", "tests/widgets",
    "tests/subjects", "tests/clips", "tests/i18n/tutor", "skills/agent-runtime/competitive-programming",
    "skills/agent-runtime/olympiad-math", "eval/walkthrough", "eval/tutor", "e2e/tests/walkthrough",
    "scripts/generate-tutor", "scripts/render-clips", "lib/store/widget-runtime-state", "public/clips",
    "lib/server/agent-runtime/walkthrough-tools", "lib/server/agent-runtime/clip-tools",
    "tests/ci/", "tests/docs/", "e2e/tests/code-widget-blocked", "tests/runtime/tutor-learning",
    # Thêm khi chia task (tasks/*.md):
    "app/api/widgets/", "lib/hooks/use-code-widget-allowed", "components/scene-renderers/code-widget-blocked",
    "scripts/generate-skill-catalog", "scripts/split-curriculum", "lib/server/agent-runtime/content-moderation",
    "eval/sim-learner", "eval/manim-author", ".github/workflows/manim-author", "app/api/clips/",
    "scripts/manim-author-pr",
)

CODE_REF = re.compile(
    r"`((?:(?:lib|components|app|packages|scripts|tests|skills|public|eval|e2e|render-service|\.github)"
    r"/[A-Za-z0-9_@\-./\[\]]*?\.(?:ts|tsx|mjs|json|md|js|yml|py))"
    r"|middleware\.ts|next\.config\.ts|Dockerfile|docker-compose\.yml|README\.md|package\.json"
    r"|playwright\.config\.ts|vitest\.config\.ts|eslint\.config\.mjs|\.env\.example)"
    r"(?::(\d+(?:-\d+)?(?:,\s?\d+(?:-\d+)?)*))?`"
)


def parse_ranges(spec):
    out = []
    for part in (spec or "").replace(" ", "").split(","):
        if not part:
            continue
        a, _, b = part.partition("-")
        out.append((int(a), int(b or a)))
    return out

# Neo nội dung cho các tham chiếu mà thiết kế dựa vào (R24). Khoá: "path:a" hoặc "path:a-b".
ANCHORS = {
    "lib/server/agent-runtime/skills.ts:227": "constraints: null",
    "components/scene-renderers/InteractiveIframeHost.tsx:281": 'sandbox="allow-scripts allow-forms allow-popups"',
    "components/scene-renderers/InteractiveIframeHost.tsx:175-181": "postMessage",
    "lib/store/interactive-iframe-pool.ts:21": "IFRAME_POOL_CAP = 3",
    "lib/orchestration/prompt-builder.ts:186": "around 100 characters",
    "lib/choreography/timing.ts:34": "MAX_VIDEO_WAIT_MS",
    "lib/playback/action-navigation.ts:16-23": "'widget_setState'",
    "lib/server/agent-runtime/generation-tools.ts:581": "duplicate_scene",
    "lib/server/agent-runtime/generation-tools.ts:513-537": "generate_actions",
    "lib/server/agent-runtime/generation-tools.ts:130-143": "function outlineFromScene",
    "packages/@openmaic/dsl/src/interactive.ts:38": "type: WidgetType",
    "middleware.ts:55-58": "isProWorkbenchEnabled",
    "lib/config/feature-flags.ts:18-25": "OPENMAIC_AGENT_RUNTIME_ENABLED",
    "lib/config/feature-flags.ts:49-51": "NEXT_PUBLIC_PRO_WORKBENCH_ENABLED",
    "next.config.ts:62-66": "frame-ancestors",
    "packages/@openmaic/generation/src/interactive-post-processor.ts:72-74": "cdn.jsdelivr.net/npm/katex",
    "lib/server/agent-runtime/course-tools.ts:204-237": "export function buildDslCourseToolset",
    "lib/agent-runtime/stage-writer-tools.ts:20": "STAGE_WRITER_TOOL_NAMES",
    "components/slide-renderer/components/ThumbnailInteractive/index.tsx:82-88": "srcDoc={patchedHtml}",
    "app/api/stages/[id]/route.ts:118": "export async function PUT",
    "lib/export/use-export-pptx.ts:1263-1276": "interactive/",
    "components/scene-renderers/interactive-renderer.tsx:34-37": "patchHtmlForIframe",
    "lib/server/model-routes.ts:132-168": "export const LLM_STAGES",
    "lib/runtime/payload-validators.ts:33-37": "APP_RUNTIME_PAYLOAD_VALIDATORS",
    "packages/@openmaic/dsl/src/runtime.ts:152-157": "open `string`",
    "app/api/chat/route.ts:44-132": "statelessGenerate(",
    "packages/@openmaic/generation/templates/slide-actions/system.md:116-117": "MUST be the **last**",
    "lib/action/engine.ts:881-886": "executeWidgetSetState",
    "lib/utils/iframe.ts:288": "export function patchHtmlForIframe",
    "lib/logger.ts:10": "LOG_FORMAT",
    "app/api/classroom/route.ts:80-81": "sanitizeSceneContent",
    "README.md:418": "ASSET_QUOTA_BYTES",
    "render-service/README.md:138-141": "x-openmaic-client",
    "lib/server/agent-runtime/dsl-tools.ts:811-836": "Final-state placeholder guard",
    "lib/server/agent-runtime/document-writes.ts:32": "putSceneBringingCurrent",
    "Dockerfile:51-72": "ARG NEXT_PUBLIC_PERSISTENCE",
    "docker-compose.yml:5-22": "NEXT_PUBLIC_PERSISTENCE",
    "lib/playback/action-resume.ts:101-111": "canJumpWithinReconstructablePrefix",
    "packages/@openmaic/storage/src/server/asset.ts:108-109": "DEFAULT_MAX_ASSET_BYTES",
}


def check_code_refs():
    cited = {}
    for f in files:
        for m in CODE_REF.finditer(rd(f)):
            cited.setdefault(m.group(1), set()).update(parse_ranges(m.group(2)))
    cache = {}

    def lines_of(path):
        if path not in cache:
            cache[path] = io.open(path, encoding="utf8", errors="ignore").read().split("\n")
        return cache[path]

    n_refs = 0
    for path, ranges in sorted(cited.items()):
        n_refs += max(1, len(ranges))
        if path.startswith(PLANNED) or "*" in path:
            continue
        if not os.path.exists(path):
            problems.append(("missing-code-file", path))
            continue
        n = len(lines_of(path))
        if lines_of(path) and lines_of(path)[-1] == "":
            n -= 1
        for a, b in sorted(ranges):
            if b > n:
                problems.append(("line-beyond-eof", path, a, b, n))
    for key, needle in ANCHORS.items():
        path, rng = key.rsplit(":", 1)
        (a, b), = parse_ranges(rng)
        if not any(x <= b and a <= y for x, y in cited.get(path, ())):
            problems.append(("anchor-not-cited-in-docs", key))
        if not os.path.exists(path):
            problems.append(("anchor-missing-file", key))
            continue
        window = "\n".join(lines_of(path)[max(0, a - 3): b + 2])
        if needle not in window:
            problems.append(("anchor-content-drift", key, needle))
    return n_refs


EXPECTED = [
    "README.md", "REQUIREMENTS.md", "NFR.md", "ARCHITECTURE.md", "DATA-MODEL.md", "INTERFACES.md",
    "SECURITY.md", "OPERATIONS.md", "TEST-STRATEGY.md", "CONTENT-DESIGN.md", "RISKS.md", "GLOSSARY.md",
    "ONBOARDING.md", "REVIEW-2026-09-29.md", "decisions/README.md",
    "phase-1-base-layer/SCHEMA.md", "phase-2-competitive-programming/SCHEMA.md",
    "phase-3-olympiad-math/SCHEMA.md",
]


def check_inventory():
    for e in EXPECTED:
        if not os.path.exists(os.path.join(ROOT, e)):
            problems.append(("missing-doc", e))
    adrs = sorted(glob.glob(ROOT + "/decisions/[0-9][0-9][0-9][0-9]-*.md"))
    nums = [int(os.path.basename(a)[:4]) for a in adrs]
    if nums != list(range(1, len(nums) + 1)):
        problems.append(("adr-numbering", nums))
    index = rd(os.path.join(ROOT, "decisions/README.md"))
    for a in adrs:
        if "Strengths" not in rd(a):
            problems.append(("adr-no-swot", a))
        if "(" + os.path.basename(a) + ")" not in index:
            problems.append(("adr-not-in-index", a))
    return len(adrs)


def check_ids():
    nfr = rd(os.path.join(ROOT, "NFR.md"))
    risks = rd(os.path.join(ROOT, "RISKS.md"))
    nfr_ids = set(re.findall(r"^\| (NFR-[A-Z]\d+) \|", nfr, re.M))
    risk_ids = set(re.findall(r"^\| (R\d{2}) \|", risks, re.M))
    for f in files:
        t = rd(f)
        for m in re.finditer(r"\bNFR-[A-Z]\d+\b", t):
            if m.group(0) not in nfr_ids:
                problems.append(("unknown-nfr-id", f, m.group(0)))
        for m in re.finditer(r"RISKS R(\d{2})\b", t):
            if "R" + m.group(1) not in risk_ids:
                problems.append(("unknown-risk-id", f, "R" + m.group(1)))


TASK_ID = r"[0-9A-Z][0-9A-Za-z]*-[0-9A-Z][0-9A-Za-z]*"
TASK_ID_IN_TEXT = re.compile(r"(?<![\w-])(" + TASK_ID + r")(?![\w-])")
TASK_LEVELS = {"W", "W+", "L", "U"}
TASK_SIZES = {"S", "M", "—"}


def _cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _owned(cell):
    return [p for p in re.findall(r"`([^`]+)`", cell)]


def parse_tasks():
    """Trả {id: {file, level, size, deps, owns, has_done}} từ card (### id · tên) và bảng (cột ID/Phụ thuộc/Sở hữu)."""
    tasks = {}
    heading = re.compile(r"^### (" + TASK_ID + r") · ")
    for f in sorted(glob.glob(ROOT + "/tasks/*.md")):
        lines = rd(f).split("\n")
        i = 0
        while i < len(lines):
            ln = lines[i]
            m = heading.match(ln)
            if m:
                tid = m.group(1)
                fields, has_done, j = {}, False, i + 1
                while j < len(lines) and not lines[j].startswith(("### ", "## ")):
                    row = re.match(r"^\| (Cấp|Cỡ|Phụ thuộc|Sở hữu) \| (.*) \|\s*$", lines[j])
                    if row:
                        fields[row.group(1)] = row.group(2)
                    if lines[j].startswith("**Xong khi"):
                        has_done = True
                    j += 1
                if tid in tasks:
                    problems.append(("task-duplicate-id", f, tid))
                for need in ("Cấp", "Cỡ", "Phụ thuộc", "Sở hữu"):
                    if need not in fields:
                        problems.append(("task-missing-field", f, tid, need))
                if not has_done:
                    problems.append(("task-missing-done", f, tid))
                level = fields.get("Cấp", "").strip()
                size = fields.get("Cỡ", "").strip()
                if level and level not in TASK_LEVELS:
                    problems.append(("task-bad-level", f, tid, level))
                if size and size not in TASK_SIZES:
                    problems.append(("task-bad-size", f, tid, size))
                tasks[tid] = {
                    "file": f, "level": level, "size": size,
                    "deps": TASK_ID_IN_TEXT.findall(fields.get("Phụ thuộc", "")),
                    "owns": _owned(fields.get("Sở hữu", "")),
                }
                i += 1  # quét tiếp trong card: card có thể chứa bảng task (ví dụ bảng task M)
                continue
            if ln.startswith("|"):
                head = _cells(ln)
                if {"ID", "Phụ thuộc", "Sở hữu"} <= set(head):
                    ci, cd, co = head.index("ID"), head.index("Phụ thuộc"), head.index("Sở hữu")
                    cl = head.index("Cấp") if "Cấp" in head else None
                    j = i + 2
                    while j < len(lines) and lines[j].startswith("|"):
                        c = _cells(lines[j])
                        tid = c[ci].strip("`")
                        if not re.fullmatch(TASK_ID, tid):
                            problems.append(("task-bad-id", f, tid))
                        elif tid in tasks:
                            problems.append(("task-duplicate-id", f, tid))
                        else:
                            level = c[cl] if cl is not None else "W"
                            if level not in TASK_LEVELS:
                                problems.append(("task-bad-level", f, tid, level))
                            tasks[tid] = {
                                "file": f, "level": level, "size": "M",
                                "deps": TASK_ID_IN_TEXT.findall(c[cd]),
                                "owns": _owned(c[co]),
                            }
                        j += 1
                    i = j
                    continue
            i += 1
    return tasks


def _paths_overlap(a, b):
    import fnmatch
    if a == b:
        return True
    if a.endswith("/") and b.startswith(a) or b.endswith("/") and a.startswith(b):
        return True
    return fnmatch.fnmatch(a, b) or fnmatch.fnmatch(b, a)


def check_tasks():
    tasks = parse_tasks()
    if not tasks:
        return 0
    for tid, t in tasks.items():
        for d in t["deps"]:
            if d not in tasks:
                problems.append(("task-unknown-dep", t["file"], tid, d))
            if d == tid:
                problems.append(("task-self-dep", t["file"], tid))
    anc, state, wave = {}, {}, {}

    def visit(tid):
        if state.get(tid) == "done":
            return anc[tid]
        if state.get(tid) == "doing":
            problems.append(("task-cycle", tid))
            return set()
        state[tid] = "doing"
        acc, lvl = set(), 0
        for d in tasks[tid]["deps"]:
            if d in tasks:
                acc |= {d} | visit(d)
                lvl = max(lvl, wave.get(d, 0))
        anc[tid], wave[tid], state[tid] = acc, lvl + 1, "done"
        return acc

    for tid in tasks:
        visit(tid)
    ids = sorted(tasks)
    for x in range(len(ids)):
        for y in range(x + 1, len(ids)):
            a, b = ids[x], ids[y]
            if a in anc[b] or b in anc[a]:
                continue
            if a.startswith("I-") and b.startswith("I-"):
                continue
            for pa in tasks[a]["owns"]:
                for pb in tasks[b]["owns"]:
                    if _paths_overlap(pa, pb):
                        problems.append(("task-parallel-file-conflict", a, b, pa, pb))
    by_wave = {}
    for tid, w in wave.items():
        by_wave.setdefault(w, []).append(tid)

    def order_key(tid):
        head, _, tail = tid.partition("-")
        rank = {"0": 0, "1a": 1, "1b": 2, "1c": 3, "G1": 4, "1d": 5, "I": 6}
        return (rank.get(head, 7), head, tail)

    computed = {w: sorted(v, key=order_key) for w, v in by_wave.items()}
    if os.environ.get("PRINT_WAVES") == "1":
        for w in sorted(computed):
            print("| %d | %s |" % (w, ", ".join(computed[w])))
    readme = os.path.join(ROOT, "tasks/README.md")
    if os.path.exists(readme):
        stated = {}
        for m in re.finditer(r"^\| (\d+) \| ([^|]+) \|\s*$", rd(readme), re.M):
            stated[int(m.group(1))] = set(TASK_ID_IN_TEXT.findall(m.group(2)))
        if stated != {w: set(v) for w, v in computed.items()}:
            problems.append(("task-wave-table-drift", readme, "chạy PRINT_WAVES=1 để lấy bảng đúng"))
    return len(tasks)


def main():
    check_header()
    check_blocks()
    check_links()
    n_refs = check_code_refs()
    n_adr = check_inventory()
    check_ids()
    n_tasks = check_tasks()
    print("md files:", len(files), "| ADRs:", n_adr, "| code refs:", n_refs, "| anchors:", len(ANCHORS),
          "| tasks:", n_tasks)
    for p in problems:
        print("PROBLEM:", p)
    print("TOTAL PROBLEMS:", len(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
