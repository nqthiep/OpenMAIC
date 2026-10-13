# Handoff

Read `AGENTS.md` first. This file holds the current assignment at the top and closed assignments below.

## Assignment: Cycle 7 — close remaining code backlog, finish access-control leftovers, deployment readiness

- Requested by: parent agent (scrum coordinator). Owner request (verbatim): "Tôi muốn bạn thiết kế và xây dựng tiếp ứng dụng này cho đến khi hoàn thiện."
- Assignment status: In progress
- Branch and commit: `it-math` @ `f24aa7f`, pushed: yes
- Last updated: 2026-10-13 14:20 UTC

Sprint goal: đóng mọi mục backlog còn làm được bằng code, hoàn thiện phần dở của access-control, để ứng dụng ở trạng thái sẵn sàng deploy; các mục cần quyết định của chủ sở hữu hoặc chuyên gia thì ghi quyết định/khuyến nghị, không tự ý quyết thay.

### Task table
| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 0 | Setup: clone, read AGENTS.md/HANDOFF.md, pnpm install, verify push | Done | Commits local (20168bd4); push blocked on GitHub auth (see blockers) |
| 1 | B47 — body caps for remaining routes (stage, chat, generate, generate-classroom, pbl) | Done | `9786e2f2`: 19 routes + `PAYLOAD_TOO_LARGE` code; measured caps (1 MiB metadata / 10 MiB content); new test `bounded-body-content-routes.test.ts` 80 pass; tsc 0 errors; related suites 825 pass (2 B50 flakes pass alone) |
| 2 | B52 — audit ~50 raw error log sites in provider-touching files | Done | `f5534e53`: audited 90 sites; upstream-capable errors now log `describeUnexpectedError` summary (26 sites in 20 files); local errors kept (redaction covers registered secrets); new test `provider-error-log-summary.test.ts` 4 pass; tsc 0; related suites 2603 pass (2 pre-existing media-orchestrator failures identical on pristine tree) |
| 3 | B48 — verify adapter-level `MaterialExtractionError` vendor text; keep only our message | Done | `b271f650`: yes it could (extract.ts wrapped `error.message` verbatim); now fixed text + original as cause; selection errors keep own message; new test 2 pass; tsc 0 |
| 4 | B49 — fix non-Error throw wording under visitor's key on non-model routes | In progress | Finding non-model routes with the "model provider" wording |
| 5 | B51 — evaluate suffix redaction; register aliases for real misses | Todo | |
| 6 | B53 — agent entry tree raw frames: check for readers; drop or document retention | Todo | |
| 7 | B50 — timing-sensitive tests: explicit budgets/retry like B27 | Todo | `tests/server/classroom-generation-retry.test.ts`, local media real pipeline |
| 8 | P4.4 — claim anonymous data on sign-in/register (small scope); decision in `scrum/DECISIONS-04.md` | Todo | Read `scrum/specs/claim-anonymous-data.md`; conflict rule: account data wins on id collision |
| 9 | i18n server error messages: all server error responses must be error codes; UI maps codes → 12 locales | Todo | `pnpm check:i18n-keys` must pass |
| 10 | B26 — watch: if full run reproduces the intermittent failure, capture stack, no blind fix | Todo | |
| 11 | Write decisions/recommendations into `scrum/DECISIONS-04.md` (B30, B8, B1–B3, P4.5, B13/B35/B36/B17) | Todo | No code for P4.5 (no provider chosen) |
| 12 | Final verification: `npx tsc --noEmit`, full `pnpm test`, ESLint, Prettier, `pnpm check:i18n-keys`; write "Cycle 7" into `scrum/BACKLOG.md` | Todo | Record measured numbers (test files, tests) |

Not in scope this cycle: B29 (NO-GO stands), B13/B35/B36/B17 (need native reviewers / content experts).

### Done so far
- Fresh clone of `it-math` at `f24aa7f` into `~/workspace/OpenMAIC`; `pnpm install` completed; push access verified.

### Decisions and reasons
- Work strictly serial, one In-progress row at a time (repo lesson: parallel agents editing shared files caused transient failures).

### Next step (exact)
- Task 1: find routes in groups stage/chat/generate/generate-classroom/pbl that read JSON bodies without a cap; measure realistic request sizes.

### Open questions and blockers
- **Push to GitHub is blocked on authentication.** `git ls-remote` works (read), but push needs auth: no GitHub token in env, no credential helper, `gh` not logged in, and the `github` skill CLI reports `not_connected`. Commits are being made locally on `it-math`. The owner must connect GitHub (device-flow) or push from their machine. This affects every commit in this cycle.

### How to verify
- `npx tsc --noEmit`: expected 0 errors.
- `pnpm test` (Vitest): expected 0 failures.
- `pnpm lint`, `pnpm check`, `pnpm check:i18n-keys`: all pass.

### Environment notes
- Node v24.20.0 (repo `.nvmrc` wants 22; engines `>=22.19.0`, so 24 is acceptable). pnpm 10.28.0 installed globally. Required environment variables by name only.

## Closed assignments

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
