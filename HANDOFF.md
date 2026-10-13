# Handoff

Read `AGENTS.md` first. This file holds the current assignment at the top and closed assignments below.

## Assignment: Continue the Scrum backlog (cycle 7)

- Requested by: repository owner. Request (verbatim): "Tiếp tục đi"
- Interpretation: the last open assignment was the Scrum mission (accounts, UX, security, reliability, content). Cycle 6 closed with a report. "Continue" means the next cycle from `scrum/BACKLOG.md`. [Inference]
- Assignment status: In progress
- Branch and commit: `claude/hopeful-sagan-267tw5` @ `c07b6a1` (two rule commits, local). Pushed: no, this cycle's commits are not pushed yet
- Note on branches: `it-math` is at `f760943` and has the same tree as this branch. The designated branch for this work is `claude/hopeful-sagan-267tw5`. `it-math` is not updated this cycle, and pushing to it needs a new instruction.
- Last updated: 2026-10-13 01:40 UTC

### Task table

| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | Reproduce B50: run the full suite once and record which timing-sensitive tests fail under load | Done | `pnpm test`: 2 failed, 742 files passed (753 total), 8225 tests passed, 2 failed. The 2 failures: `tests/lint-llm-entry-guard.test.ts` (one case, 12341 ms, timeout 5000 ms) and `tests/runtime/database-chat-cutover.test.ts` (one case, timeout 5000 ms). The two B50 files passed in this run. Log: scratchpad `test-run-1.log` |
| 2 | B50: make the timing-sensitive tests stable under load without skipping them: `tests/lint-llm-entry-guard.test.ts`, `tests/runtime/database-chat-cutover.test.ts`, and the two B50 files `tests/server/classroom-generation-retry.test.ts`, `tests/document/local-media-extractor.test.ts` | In progress | All four pass alone. Added explicit 30 s limits to the failing cases (the matrix `it` in `lint-llm-entry-guard`, and the clear-migration case in `database-chat-cutover`), following precedent `ccaeb6c`. The two B50 files passed in the full run and are unchanged. Confirm under load in row 6 |
| 3 | B49: a non-Error throw under a visitor's key on non-model routes gets "model provider" wording. Fix the wording and add a test | Done | Added `PROVIDER_FAILURE_TEXT` in `lib/server/error-summary.ts`, used by `web-search`, `parse-pdf`, `verify-pdf-provider` (not by tts, voice, transcription or extract-document, which use speech or model services). `tests/api/managed-key-upstream-text-routes.test.ts` updated, plus one new non-Error case. `vitest run` on the four affected test files: 32 passed; route tests for the three routes: 51 passed |
| 4 | B48: check whether adapter errors reach `MaterialExtractionError` with vendor text. Fix if reproduced; otherwise record it as not reproduced | Done | Reproduced by reading code: `lib/pdf/alidocmind-client.ts` put `JSON.stringify(body)` of the upstream response into a thrown message. That message is stored as the material's failure reason (`runner.ts`) and returned to the agent (`material-tools.ts`). Fixed: body goes to the log, message is fixed. New test `tests/document/alidocmind-submit-error.test.ts` (2 cases): fails on the original client, passes on the fix. Residual, not changed: short upstream status messages (`lines 154, 166, 209`) still reach the stored reason, and existing tests pin that pass-through. [Decision needed]: whether material reasons should be hidden from visitors on the operator's key |
| 5 | B37: 360 px layout check of the sign-in and account UI in Chromium (`/opt/pw-browsers/chromium`). Record measured overflow | Done | Setup: PostgreSQL 16 on localhost, a throwaway database, `NEXT_PUBLIC_PERSISTENCE=1`, `ACCOUNT_REGISTRATION=open`, `ADMIN_USERNAMES=admin`. Results at 360 px (scratch script, not in the repo): sign-in dialog 306 px wide, no internal overflow; page has no horizontal scroll (`scrollWidth - clientWidth` = −15). Settings → System → Accounts: the two-column Settings dialog clips the System pane, so the Accounts list actions are not reachable at this width (screenshot checked). Not fixed this cycle; recorded as B54 |
| 6 | Verification: `npx tsc --noEmit`, `pnpm test`, `pnpm check`, `pnpm check:i18n-keys`, ESLint on changed files | Done | `tsc --noEmit`: exit 0. `pnpm check:i18n-keys`: passed (12 locales). `pnpm test`: 745 files passed, 9 skipped; 8230 tests passed, 79 skipped; exit 0 (log: scratchpad `test-run-2.log`). `pnpm check`: exit 0. ESLint on the 9 changed `.ts` files: exit 0. Prettier fixed one new test file, then passed. Note: one green full run after the earlier red run; not repeated [Inference] |
| 7 | Record cycle 7 in `scrum/BACKLOG.md` and update this file | Done | New "Cycle 7" section at the end of `scrum/BACKLOG.md`, a row in the cycle log, B54 and B55 added. `prettier --check scrum/BACKLOG.md HANDOFF.md` passed |
| 8 | Commit and push to `claude/hopeful-sagan-267tw5` | Todo | |

### Done so far

- Branch reset: `claude/hopeful-sagan-267tw5` now starts at `origin/claude/hopeful-sagan-267tw5` (`4bbcaaf`). The two rule commits were cherry-picked on top (`f598bb5`, `c07b6a1`). The tree equals `it-math`'s tree. The `it-math` history was not added to this branch.

### Decisions and reasons

- Scope of cycle 7: B50, B49, B48 and B37. Reason: each is small and checkable. B47 needs measured request sizes, which this environment cannot produce. B51, B52 and B53 are not started and remain open in the backlog.
- Branch: the designated branch is `claude/hopeful-sagan-267tw5`. Earlier fast-forwarding it to `it-math` would have published 435 history commits there. That was reverted, and only the two rule commits were cherry-picked.

### Next step (exact)

- Row 1: `pnpm test` (full suite, about four minutes). Record the failing test names and their timings in row 1's evidence.

### Open questions and blockers

- None.

### How to verify

- `pnpm test`: baseline from cycle 6 is 702 test files passed, 9 skipped (see `scrum/BACKLOG.md`). Record this run's figures.
- `npx tsc --noEmit`: expected 0 errors.

### Environment notes

- Node `>=22.19.0`, pnpm `10.28.0` (see `package.json`). Required environment variables by name only.
- Chromium: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. Use `executablePath: '/opt/pw-browsers/chromium'`. Do not run `playwright install`.

## Closed assignments

### Assignment: Write task-tracking and handoff rules into AGENTS.md and CLAUDE.md (closed 2026-10-12)

- Requested by: repository owner. Request (verbatim): "Hãy viết rule vào AGENTS.md và CLAUDE.md rằng mỗi khi thực hiện một công việc được giao thì nó phải tạo bảng chứa đánh sách các task và status. Khi hoàn thành một task thì nó phải đánh dấu đúng status hiện tại của task đó. Và phải note các thông tin đầy đủ dưới dạng handoff, để nếu hết credit token thì có thể sẵn sàng giao cho coding agent khác thực hiện tiếp tục."
- Assignment status: Done
- Branch and commit: `it-math` @ `f760943`, pushed: yes. Equivalent commits on `claude/hopeful-sagan-267tw5`: `f598bb5`, `c07b6a1`, not pushed

| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | Check whether AGENTS.md or CLAUDE.md already exists | Done | `git ls-files` and `find` over the repo found neither; both created new |
| 2 | Write the rules to `AGENTS.md` | Done | `AGENTS.md` created at repo root |
| 3 | Write the same rules to `CLAUDE.md` | Done | `diff AGENTS.md CLAUDE.md` printed nothing (identical) |
| 4 | Check required sections and formatting | Done | All seven sections present; `node_modules/.bin/prettier --check AGENTS.md CLAUDE.md` passed |
| 5 | Record this assignment in `HANDOFF.md` | Done | This file |
| 6 | Commit and push the three rule files to `it-math` (stop hook asked for it) | Done | Commit `aea86a6`, then `f760943` for the handoff update; `git ls-remote origin refs/heads/it-math` shows `f760943` |

- Rule files are written in English. The repo's agent-facing docs (`scrum/BACKLOG.md`) are English.
- Handoff rule 6 allows `HANDOFF.md` to be committed and pushed even when other files are not.

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
