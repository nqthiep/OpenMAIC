# Handoff

Read `AGENTS.md` first. This file holds the current assignment at the top and closed assignments below.

## Assignment: Resolve the open items left by cycle 7

- Requested by: repository owner. Request (verbatim): "Hãy giải quyết tiếp các phần mà bạn chưa làm đi"
- Interpretation: finish the items listed as not done at the end of cycle 7 (B48 residual, B54, B55, B47, B51, B52, B53, B26), and record a decision or a precise blocker for each of the rest. The owner asked for decisions to be made with the expert team, not asked back. Where a decision needs a person (for example native translators or content reviewers), the blocker is recorded. [Inference]
- Assignment status: In progress
- Branch and commit: `claude/hopeful-sagan-267tw5` @ `404a31a` (last pushed commit before this assignment), pushed: yes
- Note on branches: `it-math` is at `f760943`. It is not updated by this assignment.
- Last updated: 2026-10-13 (UTC)

### Task table

| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | B48 residual: apply decision D-31 to the media path. Adapter errors reach the stored reason only as a fixed message. Our own `MaterialExtractionError` messages keep their text. Record D-32. Update the tests that pin the pass-through | Done | `lib/server/material-extraction/extract.ts` (plain adapter errors → `EXTRACTION_FAILURE_TEXT`; selection kept outside the try). New test "stores the fixed reason when an adapter throws a plain error with vendor text": fails on the previous module, passes on the fix. `vitest run tests/agent-runtime/material-extraction.test.ts tests/document/local-media-extractor.test.ts`: 11 passed. D-32 in `scrum/DECISIONS-03.md`. The ASR tests pin our own messages (`LocalMediaExtractionError` is an alias), so they were not changed |
| 2 | B51: check every secret-bearing environment name in `.env.example` and in code against the suffix rule. Decide and record: accept, or widen the rule | Done | Gap found: `AWS_BEARER_TOKEN_BEDROCK` (a bearer token) and `ALIDOCMIND_ACCESS_KEY_ID` were not redacted. Fixed in `lib/log-secrets.ts`: keyword matches as a segment; digit-only values are not registered. Tests in `tests/server/log-redaction.test.ts` (new case fails on the old rule; numeric guard passes on both). `vitest run tests/server/log-redaction.test.ts tests/server/error-summary.test.ts`: 18 passed. D-33 in `scrum/DECISIONS-03.md` |
| 3 | B53: find every reader of the agent entry tree. Decide and record | Done | Readers: `runner.ts` and `personal-history-tools.ts` only (model context). No `app/` file imports them. Clients read `agent_session_events`. D-34 in `scrum/DECISIONS-03.md`. Guard test `tests/server/entry-tree-route-guard.test.ts` passes; a temporary forbidden route import was caught and removed. Unchecked: whether tool results are shown verbatim in the UI `[Unverified]` |
| 4 | B52: classify the raw error-object log sites in provider-touching files. Decide per class. Change the sites where the message can carry upstream text | Done | About 142 single-line sites (a floor). Decision D-35: keep the error object in operator logs, since the registry redacts secrets (D-26, D-33) and our own messages are the diagnostic. No visitor text is logged (D-27). Residual, `[Unverified]`: a provider's own message can echo request text. The owner's log retention and privacy policy decides any change (follow-up recorded in D-35) |
| 5 | B54: narrow-width layout for the Settings dialog (`components/settings/index.tsx`), and the home composer row at 360 px. Verify with the 360 px script | Done | Settings: columns stack below `sm` (nav row scrolls sideways, list max height 44 units, panel fills the rest; resize handles hidden below `sm`). At 360 px: no offender, "Disable alice" at left 138 to right 210 of a 360 px viewport, and clickable. Composer (`app/page.tsx`): toolbar and agent row scroll sideways; the Interactive Mode label is `sr-only` below `sm` (`components/generation/interactive-mode-button.tsx`). At 360 px the send button right edge is 316 and clickable. At 1280 px the sidebar is 191 px (was 192), the handles show, and the composer does not scroll. Scratch scripts `check-360-v4.js`, `check-360-home.js`, `check-desktop.js` (not in the repo). Screenshots reviewed |
| 6 | B55: find the cause of the dev-log "Ecmascript file had an error" (`instrumentation.ts`, `packages/@openmaic/storage/src/server/reference.ts`) and of the "Persistence is unavailable" toast. Fix or record the cause | Done | (a) Edge warning: `process.once` in `instrumentation.ts` moved to `lib/server/process-signals.ts`; count 0 after restart. (b) Toast: the runtime was off, so `/api/stages` answered 404. Message now names the runtime (`stageListFailureMessage`); browser check shows the new text. (c) Next 16 deprecation: `middleware.ts` renamed to `proxy.ts`; access tests 18 passed; no deprecation line in the log. Decision D-36 in `scrum/DECISIONS-03.md`. Tests: `tests/utils/stage-list-failure.test.ts` (4 cases) |
| 7 | B47: measure request sizes from repo fixtures and tests. Set caps on the stage, chat, generate, classroom and pbl routes with the bounded reader. Add tests | Blocked | Stage routes capped (1 MiB create and rename, 10 MiB save, by precedent; test added; 137 stage route tests pass). Classroom was already capped. Chat, generate and pbl routes not capped: no precedent and no measured sizes in this environment. Reopen condition and reasons in D-37 (`scrum/DECISIONS-03.md`). Needs production request-size data |
| 8 | B26: reproduce the intermittent `tests/accounts/routes.test.ts` failure by repeated runs. Record the result or the root cause | Done | Not reproduced: 6 isolated runs passed (`b26-1..6.log`); full runs passed in cycle 7 (run 2) and this cycle (run 3, `test-run-3.log`). Root cause not found. Recorded as "not reproduced" in `scrum/BACKLOG.md`, cycle 8. Watch item |
| 9 | Open product and content items (B1, B2, B3, B8, B13, B17, B29, B30, B35, B36): record for each a decision or a blocker with its owner in `scrum/BACKLOG.md` | Done | "Open items: decision or blocker recorded" table in the cycle 8 section of `scrum/BACKLOG.md`. B1, B2, B3, B30: owner decision needed (recommendation for B1 recorded). B8: deferred with reasons. B13, B17, B35: human reviewers needed. B29, B36: verification needs a two-reader browser check or a provider for sample generation |
| 10 | Verification: `npx tsc --noEmit`, `pnpm test`, `pnpm check`, `pnpm check:i18n-keys`, ESLint on changed files | Todo | `tsc` exit 0; `pnpm test`: 747 files passed, 9 skipped; 8239 tests passed, 79 skipped; ESLint 0 errors (one pre-existing warning). `pnpm check` and `pnpm check:i18n-keys` still to run after the last edits |
| 11 | Commit, push to `claude/hopeful-sagan-267tw5`, update the backlog and this file | Todo | |

### Done so far

- Nothing yet in this assignment. Previous assignment (cycle 7) is closed below.

### Decisions and reasons

- None yet.

### Next step (exact)

- Row 1: open `lib/server/material-extraction/extract.ts` around lines 136–148 and wrap the adapter error. Then update the pinned reasons in `tests/agent-runtime/material-extraction.test.ts` (lines near 123, 152, 241, 272, 303).

### Open questions and blockers

- None for the agent. Items 9 needs native reviewers (B13) and subject-matter reviewers (B17, B35, B36) who are not in this environment. The blocker is recorded, not worked around.

### How to verify

- `npx tsc --noEmit`: expected exit 0.
- `pnpm test`: expected 0 failed files. Last full run: 745 files passed, 9 skipped; 8230 tests passed, 79 skipped.
- `pnpm check`, `pnpm check:i18n-keys`: expected exit 0.
- B54 check (scratch, not in the repo): see the "How to verify" section of the closed cycle 7 assignment below.

### Environment notes

- Node `>=22.19.0`, pnpm `10.28.0` (see `package.json`). Required environment variables by name only.
- Chromium: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. Use `executablePath: '/opt/pw-browsers/chromium'`. Do not run `playwright install`.
- PostgreSQL 16 is installed but not running. Start it with `pg_ctlcluster 16 main start` (needs root). Create a throwaway database and role for each browser check, and give the password through an environment variable, never in a file.
- Dev server for account checks: set `DATABASE_URL`, `NEXT_PUBLIC_PERSISTENCE=1`, `ACCOUNT_REGISTRATION=open` and `ADMIN_USERNAMES`. Stop it by PID from `ps`, not with `pkill -f`.
- Scratch browser scripts from cycle 7 are in the session scratchpad, not in the repository: `check-360-v3.js` (Settings Accounts panel) and `check-360-v2.js` (sign-in dialog and home).

## Closed assignments

### Assignment: Continue the Scrum backlog (cycle 7) (closed 2026-10-13)

- Requested by: repository owner. Request (verbatim): "Tiếp tục đi"
- Interpretation: the next cycle from `scrum/BACKLOG.md`. [Inference]
- Assignment status: Done for cycle 7
- Branch and commit: `claude/hopeful-sagan-267tw5`, commits `c735894` (code and tests), `6cc3d46` (backlog and handoff), `fe9f5be` and `404a31a` (handoff). Pushed: yes

| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | Reproduce B50: run the full suite once and record which timing-sensitive tests fail under load | Done | Run 1: 2 failed. `tests/lint-llm-entry-guard.test.ts` (one case, 12341 ms, limit 5000 ms) and `tests/runtime/database-chat-cutover.test.ts` (one case, limit 5000 ms). Log: scratchpad `test-run-1.log` |
| 2 | B50: make the timing-sensitive tests stable under load without skipping them | Done | Explicit 30 s limits on the two failing cases (`c735894`). All four named files pass alone. Full run 2 passed. [Inference] One green full run does not prove stability under load |
| 3 | B49: non-Error throw on non-model routes gets "model provider" wording | Done | `PROVIDER_FAILURE_TEXT` in `lib/server/error-summary.ts`, used by `web-search`, `parse-pdf`, `verify-pdf-provider` (`c735894`). Tests: 32 passed (four files), 51 passed (route tests) |
| 4 | B48: check whether adapter errors reach `MaterialExtractionError` with vendor text | Done (partly) | `lib/pdf/alidocmind-client.ts` put the upstream body in a thrown message. Fixed: body goes to the log (`c735894`). New test `tests/document/alidocmind-submit-error.test.ts` fails on the old client and passes on the fix. Residual: the media path still passes adapter messages (addressed in the current assignment, row 1) |
| 5 | B37: 360 px check of the sign-in and account UI | Done | Sign-in dialog 306 px, no internal overflow. Page: no horizontal scroll. Settings → System → Accounts: the two-column dialog clips the System pane; the Disable and Enable buttons are not reachable at 360 px. Opened B54 |
| 6 | Verification | Done | `tsc` exit 0; `pnpm test` 745 files passed, 9 skipped, 8230 tests passed, 79 skipped; `pnpm check` and `pnpm check:i18n-keys` exit 0; ESLint on changed `.ts` files exit 0 |
| 7 | Record cycle 7 in `scrum/BACKLOG.md` and this file | Done | Cycle 7 section and cycle-log row in `scrum/BACKLOG.md`; B54 and B55 added |
| 8 | Commit and push | Done | `c735894`, `6cc3d46`, `fe9f5be`, `404a31a`; `git ls-remote` shows `404a31a` |

- The `it-math` history was not added to this branch. A fast-forward to `it-math` would have published its 435 history commits here.
- Open at the end of cycle 7: B54, B55, B48 residual, B47, B51, B52, B53, B26, and the older product and content items listed in `scrum/BACKLOG.md`.

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
