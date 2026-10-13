# Decision record: cycle 6

Date: 2026-10-12. Branch: `claude/hopeful-sagan-267tw5`.
Inputs: the cycle 5 backlog (`scrum/BACKLOG.md`), one read-only audit of every route for visitor-facing upstream text (`scrum/reviews/cycle6-review.md`), and the implementation reports of two workers with disjoint file ownership. The workers stopped on a session rate limit and were resumed from their own transcripts, so their work is the same work.

## Process

1. The coordinator set the sprint from the backlog: B44 (dirty window) and B45 and B46 (logs), B34 (skill), B8 (decision), and B18 (the audit's leaks).
2. The B18 audit was read-only. It found 11 routes with visitor-facing upstream text under the operator's key, which is the leak class of cycle 5.
3. Two workers fixed those routes in parallel. The coordinator reviewed each diff, ran the targeted suites, and changed two things the workers could not decide: the logger's secret registry moved to its own module, and the media path's ASR wrapper.
4. Status key as before. `[Verified: file:line]` for code read; `[Measured: how]` for runs; `[Inference]` and `[Unverified]` for the rest.

## Rulings

### D-25 Unflushed edits keep their lease live (B44): dirty window — **Done (76ccf4e; the getter fix in 2828f55)**
- A realm with unflushed edits writes `dirtyUntil` into its lease, 10 min after the last edit. Presence reads a lease as live while `expiresAt` or `dirtyUntil` is in the future.
- The stage store marks the realm dirty when a change is recorded, and clean when the pending changes are saved or discarded.
- A page that leaves with unflushed edits keeps its lease until the window ends.
- Follow-up found by the full suite: the mark called the stage getter outside its `try`, so a failing getter could break an edit. Fixed, with a regression test.
- Residual: a tab frozen longer than the window with a save pending reads as absent. Recorded in `scrum/specs/presence-lease.md`.

### D-26 Secrets are redacted from every log line (B45, part): central redaction — **Done (2c138b8; the module split in 2791ba1)**
- The logger replaces each registered secret, and each environment value whose name ends in `API_KEY`, `ACCESS_KEY`, `SECRET`, `TOKEN`, `PASSWORD` or `ACCESS_CODE`, with `[redacted]`. Values under eight characters are not registered.
- The provider loader registers the secret fields of the YAML file. The six client-key resolvers register the key a visitor supplies. Visitor keys are bounded to 256; operator keys are never evicted.
- The registry lives in `lib/log-secrets.ts`, not the logger. Reason: a test that replaces the logger with a factory lacking the new export made the resolver throw, and two capability tests returned 500. A registry in its own module is not replaced by tests of the logger.
- Open: raw error objects are still logged at about 50 call sites in provider-touching files. Whether upstream text can echo an unregistered key is `[Unverified]`. Recorded as B52.

### D-27 Logs carry lengths, counts and ids, not visitor text or model output (B46) — **Done (3e7788c) for the sites the scan found**
- Requirements, queries, questions, prompts, generated titles, model output and raw URLs are logged as lengths, counts or origin and path. This covers 17 log calls in 16 files. A regex scan over `app/` and `lib/` found them, so the list is not proven exhaustive: `[Inference]`.
- The PBL evaluator's titles and the classroom skip message are removed from logs too. The classroom PBL warning keeps the title length and the error summary.

### D-28 Procedural-skill pages come from the classroom builder only (B34) — **Done (26c271d)**
- Premise corrected: the chat agent has a `generate_scene` tool that accepts `widgetOutline` for simulation, diagram, code, game and visualization3d pages. The gap is that `procedural-skill` is gated behind task-engine mode, which the tool description states. The gap is not the absence of an outline tool.
- The vocational skill now states the gate and names the page types the chat agent can use. The classroom builder's rules are unchanged, and no tool schema changed.

### D-29 Render-job ownership (B8): deferred to cycle 7 — **Decided: not in this cycle**
- The render service is an external image (`docker-compose.yml`). Its job-id scheme is not in this repository `[Unverified]`.
- Ownership needs a shared store (the application has a database only for accounts), and a decision on signed-out submits. The second is a product decision, not an engineering one.
- Interim: no change. Any gated caller who learns a job id can poll or cancel that job. Recorded as B8, with the decisions above as the next step.

### D-30 Visitor-facing upstream text (B18): policy applied to every A row — **Done (228d146)**
- Under the operator's key, a visitor gets fixed text. With the visitor's own key, the visitor keeps their own message. Persisted and replayed text (session errors, job errors, extraction errors, persisted assistant frames) follows the same rule.
- Results by row are in `scrum/reviews/cycle6-review.md`, under Disposition. All A rows are fixed. The B and C rows are unchanged, as the audit assessed.
- Behaviour change, accepted: a non-Error throw under the visitor's own key now gets `MODEL_FAILURE_TEXT`, where it used to get `Unknown error` or the raw string. On non-model routes, such as transcription and PDF parsing, the wording "model provider" is inaccurate. Recorded as B49. The fix is a route-specific fixed text.
- The PBL wire format is flat, so `visitorStreamEvent` was not reused. The PBL helper takes a required `managedKey`, so a caller cannot omit it.

### D-31 Extraction credentials are operator-owned (B18, materials) — **Done (228d146)**
- Document-path extraction has no client key, so its failure text is `EXTRACTION_FAILURE_TEXT` regardless of the managed flag. The provider text goes to the server log.
- Media-path extraction: the ASR chunk wrapper no longer stores the adapter's message, because adapter messages can carry vendor response bodies. Our own extraction messages, such as the job deadline, keep their text, so the existing tests that assert those messages still pass.
- Open at cycle 6: a `MaterialExtractionError` raised by an adapter with vendor text would still pass through. Resolved by D-32 (cycle 8).

### D-32 Only our own extraction messages are stored (B48, cycle 8) — **Done**
- Context: the AliDocMind client put the upstream body in a thrown message (fixed in cycle 7, `c735894`). The media path in `lib/server/material-extraction/extract.ts` stored every adapter error's `message` as the material's failure reason. That reason is read by the agent's material tools (`lib/server/agent-runtime/material-tools.ts`).
- Decision: in the media path, a `MaterialExtractionError` keeps its text (our own messages, such as the job deadline). Any other error from an adapter is logged, and the stored reason is `EXTRACTION_FAILURE_TEXT`. The provider selection step is outside that rule, because its messages are built from our own availability strings.
- Reason: the operator's credentials are used for media extraction (D-31), so visitors must not see vendor text. Short vendor status messages thrown as plain errors are now also hidden. This is a visible change: a visitor sees the generic failure text instead of, for example, `connection reset`.
- Tests: `tests/agent-runtime/material-extraction.test.ts`, the new case "stores the fixed reason when an adapter throws a plain error with vendor text". It fails on the previous `extract.ts` and passes on this one. The existing ASR cases use `LocalMediaExtractionError`, which is an alias of `MaterialExtractionError`, so they keep their text.
- Not changed in the client: its status messages (`lib/pdf/alidocmind-client.ts`, lines near 154, 166 and 209) are still plain errors. D-32 hides them from the stored reason on the media path, which is the intended result.

### D-33 Environment secret names match a keyword segment, and digit-only values are not secrets (B51, cycle 8) — **Done**
- Context: `lib/log-secrets.ts` registered environment values only when the name ended with `API_KEY`, `ACCESS_KEY`, `SECRET`, `TOKEN`, `PASSWORD` or `ACCESS_CODE`. `AWS_BEARER_TOKEN_BEDROCK` (in `.env.example`) is a bearer token and was not redacted. `ALIDOCMIND_ACCESS_KEY_ID` was not redacted either.
- Decision: the keyword may sit anywhere in the name, as a whole segment (start or end, separated by `_`). `*_TOKENS` does not match, because it is a count. Environment values made only of digits are not registered, so a numeric setting such as `PDF_TOKEN_LIMIT` does not hide ordinary log text.
- Checked: the names in `.env.example` that contain a secret-like word now all match, except `OPENMAIC_AGENT_COMPACTION_*_TOKENS` (counts) and `PERSISTENCE_ALLOW_INSECURE_DEV_AUTH` (a flag). Both are correct not to match.
- Tests: `tests/server/log-redaction.test.ts`. The new case for `AWS_BEARER_TOKEN_BEDROCK` and `ALIDOCMIND_ACCESS_KEY_ID` fails on the previous rule and passes on this one. The numeric case passes on both rules; it guards against a false positive from this change.
- Still true: a secret whose value is shorter than 8 characters is not registered (existing rule). Secrets that do not appear in the environment and are not registered are not redacted. The registry is the control for those.

### D-34 The agent entry tree stays out of routes (B53, cycle 8) — **Done**
- Finding: `agent_session_entries` (the entry tree) is read by two modules only: `lib/server/agent-runtime/runner.ts` (model context) and `lib/server/agent-runtime/personal-history-tools.ts` (rows returned to the model as tool results, with bounded and cleaned fields). No file under `app/` imports either module, or `entry-tree-storage`. Client streams read `agent_session_events` (`app/api/agent/sessions/[id]/events/route.ts`, `readEventsAfterForReplay`).
- Decision: accept the raw frames in the entry tree, because they never reach a route. Keep that true with a guard test.
- Test: `tests/server/entry-tree-route-guard.test.ts` scans `app/` for these imports. A temporary route that imports the runner was caught, and the probe was removed.
- Not checked: whether a tool result from `personal-history-tools` is shown verbatim in the chat UI. `[Unverified]`. The rows are cleaned and bounded, and the entry tree stores fixed text for managed-key errors (B18), so the exposure is limited.

### D-35 Raw error objects in operator logs are accepted (B52, cycle 8) — **Done (decision, no code change)**
- Count: about 142 single-line `log.error(…, error)` or `log.warn(…, error)` sites under `app/` and `lib/`. Multi-line calls are not counted, so the figure is a floor, not a total.
- Decision: keep the error object in operator logs. Reasons: (1) the logger redacts every registered secret, environment secret and visitor key from every line (D-26, `lib/log-secrets.ts`, D-33); (2) our own messages, such as the entry-history error, are the diagnostic. Replacing every site with `describeUnexpectedError` would remove those messages from operator logs.
- Rule kept: our code adds no visitor content to a log line (D-27). Visitor text is never a log argument.
- Residual risk, not closed: a provider's own error message can echo part of a request (for example an input snippet). That text can reach operator logs unredacted. `[Unverified]`: no captured example from a real provider exists here.
- Owner decision needed later: the log retention and privacy policy (open question in this file, "Retention and redaction policy"). If the owner decides that provider text must not reach logs, the change is mechanical: `describeUnexpectedError(error)` at each site. Recorded as the follow-up of B52.

### D-36 Dev-log warnings: Edge analysis, the home toast, and the proxy file (B55, cycle 8) — **Done**
- Edge warning: `instrumentation.ts` called `process.once` for the shutdown signals. Next analyses that file for the Edge runtime, so it warned on every compile. Moved to `lib/server/process-signals.ts`, imported dynamically in the Node branch. Verified: the count of "Ecmascript file had an error" is 0 after a restart.
- Toast: "Persistence is unavailable" appeared when the client listed owner classrooms with `NEXT_PUBLIC_PERSISTENCE=1` but the agent runtime was off. `/api/stages` answers 404 in that case (`isAgentRuntimeConfigured()`). The toast named the wrong cause. Verified: with the runtime on, the route answers 200; with it off, the toast reads "Saved classrooms are unavailable: the agent runtime is not enabled on this server." (`stageListFailureMessage` in `lib/utils/stage-storage.ts`, used by `app/page.tsx` and `lib/hooks/use-home-discovery.tsx`). Other failures keep the persistence message.
- Proxy file: Next 16 deprecates `middleware.ts`. Renamed to `proxy.ts` with the export `proxy`. Logic unchanged. The access gate tests (`tests/server/access-cookie-secret.test.ts`, `tests/server/access-token-freshness.test.ts`) import `@/proxy`: 18 passed. The dev log has no "middleware" or "deprecated" line after the restart.
- Note: `scrum/` documents cite `middleware.ts:NN` lines in earlier cycles. Those citations are historical and now refer to `proxy.ts`.
- Pre-existing, not changed: one `react-hooks/exhaustive-deps` warning at `app/page.tsx` (the same warning exists at HEAD).

### D-37 Body caps by route class; chat, generate and pbl wait for measured sizes (B47, cycle 8) — **Partly done**
- Done, with precedent: the stage routes now read bodies with `readBoundedJson` (`lib/server/bounded-json.ts`). `POST /api/stages` takes 1 MiB, the folder-create cap. `PATCH /api/stages/[id]` takes 1 MiB, the folder-rename cap. `PUT /api/stages/[id]` (a whole-document save) takes 10 MiB, the cap the classroom create route uses for the same kind of document. A refused body answers 413 with the cap stated. Test: `tests/agent-runtime/stages-route.test.ts` (one new case). The existing stage route tests: 137 passed.
- Already capped before this cycle: `app/api/classroom/route.ts` (10 MiB), the folder, agent-session and classroom-metadata routes.
- Not capped, and why: `/api/chat`, `/api/chat/pi`, `/api/chat/pi/whiteboard-visibility`, the `generate/*` routes, `generate-classroom`, and the `pbl/v2/*` routes. Their bodies carry conversation history or generation input, which grows with the session. No route in this repository has a precedent for those sizes, and no measured request sizes exist here (no production traffic, no fixtures). A cap chosen without data could refuse a legitimate long session.
- To reopen: log the byte count of each request on these routes (no content) for one release, then set each cap above the 99th percentile with headroom. Until then, B47 stays open for these routes.

## Items that changed status

| Item | Status after cycle 6 | Where |
|---|---|---|
| B8 | Deferred, with the reasons recorded | D-29 |
| B18 | Done for the audit's 11 A rows; behaviour note and residuals recorded | D-30, D-31 |
| B34 | Done; premise corrected | D-28 |
| B44 | Done; residual beyond the window | D-25 |
| B45 | Partly done: central redaction. Raw-error sites open as B52 | D-26 |
| B46 | Done for the scanned sites | D-27 |
| B37 | Unchanged: the 360 px browser check is still `[Unverified]` | cycle 5 |

## Open questions (none answered by the repository)

- Enforce the eight-search limit in the tool, or keep it as guidance? Still guidance (D-22, cycle 5).
- Who decides signed-out render submits, and what is the owner key for a job (B8)? A product decision, to be taken before cycle 7 builds anything.
- Retention and redaction policy for visitor content in logs beyond what D-27 already removed (B46). A privacy decision.

## Dissent summary

- No dissent was recorded against the rulings above.
