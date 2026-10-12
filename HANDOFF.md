# Handoff

Read `AGENTS.md` first. This file holds the current assignment at the top and closed assignments below.

## Assignment: Write task-tracking and handoff rules into AGENTS.md and CLAUDE.md

- Requested by: repository owner (no name given in the request)
- Original request (verbatim): "Hãy viết rule vào AGENTS.md và CLAUDE.md rằng mỗi khi thực hiện một công việc được giao thì nó phải tạo bảng chứa đánh sách các task và status. Khi hoàn thành một task thì nó phải đánh dấu đúng status hiện tại của task đó. Và phải note các thông tin đầy đủ dưới dạng handoff, để nếu hết credit token thì có thể sẵn sàng giao cho coding agent khác thực hiện tiếp tục."
- Assignment status: Done
- Branch and commit: `it-math` @ `aea86a6` (rule files), pushed: yes
- Last updated: 2026-10-12 10:45 UTC

### Task table

| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | Check whether AGENTS.md or CLAUDE.md already exists | Done | `git ls-files` and `find` over the repo found neither; both created new |
| 2 | Write the rules to `AGENTS.md` | Done | `AGENTS.md` created at repo root |
| 3 | Write the same rules to `CLAUDE.md` | Done | `diff AGENTS.md CLAUDE.md` printed nothing (identical) |
| 4 | Check required sections and formatting | Done | All seven sections present; `node_modules/.bin/prettier --check AGENTS.md CLAUDE.md` passed |
| 5 | Record this assignment in `HANDOFF.md` | Done | This file |
| 6 | Commit and push the three rule files to `it-math` (stop hook asked for it) | Done | Commit `aea86a6`; `git ls-remote origin refs/heads/it-math` shows `aea86a6`; fast-forward, no force |

### Done so far

- `AGENTS.md`: task-tracking rules (status words, when to mark `Done`), handoff rules, handoff template, repo commands, git rules, reporting rules.
- `CLAUDE.md`: byte-identical copy of `AGENTS.md`.
- `HANDOFF.md`: this file.

### Decisions and reasons

- Rule files are written in English. The repo's agent-facing docs (`scrum/BACKLOG.md`) are English. The user's request was in Vietnamese, so the rule summary in the reply is in Vietnamese.
- `HANDOFF.md` sits at the repo root so a new agent finds it without searching.
- Handoff rule 6 lets `HANDOFF.md` be committed and pushed even when a task is otherwise not to be committed. Reason: a lost container loses uncommitted files.
- The first draft left commit and push out of scope. A stop-hook message then asked for both, so they became row 6.

### Next step (exact)

- None for this assignment. The three files are committed and pushed on `it-math`. Any follow-up work starts with a new assignment section above this one.

### Open questions and blockers

- None.

### How to verify

- `diff AGENTS.md CLAUDE.md`: expected no output.
- `node_modules/.bin/prettier --check AGENTS.md CLAUDE.md`: expected `All matched files use Prettier code style!`.

### Environment notes

- Node `>=22.19.0`, pnpm `10.28.0` (see `package.json`). Required environment variables by name only.

## Closed assignments

### Assignment: Replace it-math tree with claude/hopeful-sagan-267tw5 (closed 2026-10-12)

- Requested by: repository owner. Instruction: keep this branch's code and replace the code on `it-math`.
- Assignment status: Done
- Branch and commit: `it-math` @ `31ef8ea`, pushed: yes

| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | Attempt merge of `claude/hopeful-sagan-267tw5` into `it-math` | Done | Merge produced 95 conflict hunks in 46 files, plus 3 add/add and 14 modify/delete conflicts. Aborted with `git merge --abort`. Nothing pushed |
| 2 | Replace `it-math` tree with this branch's tree, keeping history | Done | Merge commit with `-s ours`, parents `8213662` and `4bbcaaf`; tree hash `8722070` equals `claude/hopeful-sagan-267tw5^{tree}` |
| 3 | Push `it-math` without force | Done | Fast-forward; `git ls-remote origin refs/heads/it-math` shows `31ef8ea` |

- Effect: code added by the 435 `it-math`-only commits is no longer on the branch tip. It remains in history. Revert `31ef8ea` to restore it.
- Not run: `tsc` and tests were not re-run at this step. The tree is identical to `4bbcaaf`, which was verified in cycle 6 (see `scrum/BACKLOG.md`).
