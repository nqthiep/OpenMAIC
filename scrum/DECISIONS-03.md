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
- Open: a `MaterialExtractionError` raised by an adapter with vendor text would still pass through. `[Unverified]`. Recorded as B48.

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
