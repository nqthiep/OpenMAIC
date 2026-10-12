# Agent instructions

These rules apply to every coding agent working in this repository. `CLAUDE.md` mirrors this file; keep the two identical.

## At the start of every session

1. Read this file.
2. Read `HANDOFF.md`. If it lists an open assignment, continue from the first row whose status is not `Done` or `Dropped`. Do not redo completed rows.
3. Run `git status` and confirm the branch named in the handoff before editing anything.

## Task tracking (required)

1. When you receive an assignment, write a task table in `HANDOFF.md` before doing the work, and show the same table in your reply. One row per task.
2. Columns: `#`, `Task`, `Status`, `Evidence / notes`.
3. Use exactly these status words:
   - `Todo`: not started.
   - `In progress`: being worked on now. At most one row is `In progress` at a time.
   - `Blocked`: cannot continue. The notes say what is needed and who must act.
   - `Done`: finished and verified. The notes name the command, test, or file that proves it.
   - `Dropped`: removed from scope on the user's instruction. The notes say who decided.
4. When a task finishes, change its row to `Done` in the same step, in both `HANDOFF.md` and your reply. Mark `Done` only after the verification has passed.
5. If verification fails or was not run, the row stays `In progress` or becomes `Blocked`. The notes must say what failed or what was skipped.
6. Add rows when new work appears. Do not delete rows. Change their status instead.
7. Never mark a row `Done` based on intent or a plan. Use the actual result.

## Handoff (required)

1. Keep `HANDOFF.md` current. Update it after every completed task and before any long step, not only at the end. A session can stop at any time when credits run out, so the file must always be accurate.
2. The handoff must stand alone. An agent with no chat history must be able to continue from it. Use the template below.
3. Record verified facts with the command you ran and a short summary of its output. Label anything you have not verified `[Unverified]`, and label inferences `[Inference]`.
4. Never write secrets, tokens, or private keys into `HANDOFF.md`. Name the environment variable instead.
5. When a new assignment starts, add its section at the top of `HANDOFF.md` and move the previous section under `## Closed assignments`. Keep closed sections; do not delete them.
6. If the assignment allows git writes, commit and push `HANDOFF.md` with each completed task so it survives a lost container. If git writes are not allowed, say so in the handoff.

### Handoff template

```markdown
## Assignment: <short title>
- Requested by: <name or role>
- Original request (verbatim): <paste the full request>
- Assignment status: In progress | Blocked | Done
- Branch and commit: <branch> @ <short sha>, pushed: yes | no
- Last updated: <YYYY-MM-DD HH:MM UTC>

### Task table
| # | Task | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | <task> | Done | `<command>` passed; <file> |
| 2 | <task> | In progress | <what remains> |

### Done so far
- <change> in `<path>`

### Decisions and reasons
- <decision>: <reason>

### Next step (exact)
- <first action for the next agent, with the file path or command>

### Open questions and blockers
- <question or blocker, and who must answer or act>

### How to verify
- `<command>`: expected <result>

### Environment notes
- Node `>=22.19.0`, pnpm `10.28.0` (see `package.json`). Required environment variables by name only.
```

## Repository commands

- Install: `pnpm install`. The `postinstall` script builds the workspace packages.
- Type check: `npx tsc --noEmit`
- Unit tests: `pnpm test` (Vitest, `tests/**/*.test.ts`). One file: `pnpm vitest run <path>`.
- Lint and format check: `pnpm lint`, `pnpm check`
- Translation keys: `pnpm check:i18n-keys`

## Git

- Work on the branch named in the assignment. Do not push to any other branch without permission.
- Never force-push a shared branch.
- Commit and push only when the assignment asks for it. The exception is `HANDOFF.md`, as set out in the handoff rule 6.

## Reporting

- Your final reply shows the task table, what was verified and how, and what remains.
- State unverified claims as unverified.
