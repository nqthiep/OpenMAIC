# Cycle 6 independent review: visitor-facing upstream text (B18)

One read-only review ran in cycle 6: a sweep of every route under `app/api/**` for text from an upstream model or provider, or from a thrown error, that reaches the client. Each row was read in the code by the reviewer. Scope: 77 route files. Cycle 5 routes were not re-reported.

The reviewer's policy helpers: `lib/server/error-summary.ts` (`MODEL_FAILURE_TEXT`, `visitorErrorText`, `visitorStreamEvent`, `CONTENT_BLOCKED_TEXT`), `lib/server/resolve-model.ts` (`managedKey`), `lib/server/provider-config.ts` (the key resolvers).

Verdict key: **A** = the operator's key can be used and upstream or error text reaches the client, not yet covered by policy (a leak). **B** = only the visitor's own key can be used, so their own text is allowed. **C** = fixed text, or no upstream text.

## Findings (A rows, to fix)

| Route | Returned to client | Required change |
|---|---|---|
| `app/api/pbl/v2/{instructor,open-task,simulator,evaluate}/route.ts` | SSE error text (`lib/pbl/v2/api/sse.ts:265-272`); LLM error part (`lib/pbl/v2/agents/instructor.ts:1560-1584`). `managedKey` is received but unused. | Fix: pass `managedKey` into the SSE helper. |
| `app/api/agent/sessions/[id]/route.ts`, `sessions/route.ts`, `sessions/[id]/events/route.ts` | Session `error` and `session_end` text, persisted and replayed to the owner (`runner.ts:1769, 1807`). | Fix: a fixed string when the operator's key is used. The managed flag must reach the runner. |
| `app/api/materials/[id]/route.ts`, `materials/route.ts` | `extraction.error` with provider text (`lib/server/material-extraction/extract.ts:222, 227-228`). | Fix: a fixed reason when managed. |
| `app/api/generate-classroom/[jobId]/route.ts` | `job.error`, the raw message (`lib/server/classroom-job-runner.ts:36-39`). | Fix: a fixed message when the job's model is managed. |
| `app/api/transcription/route.ts` | `details = error.message`, with vendor bodies (`lib/audio/asr-providers.ts`). The managed flag is scoped inside `try`. | Fix: `MODEL_FAILURE_TEXT`; hoist the flag. |
| `app/api/parse-pdf/route.ts` | `error.message`; MinerU text (`lib/pdf/mineru-cloud.ts`). | Fix: `visitorErrorText` with the flag hoisted. |
| `app/api/extract-document/route.ts` (multipart path) | Errors from the document and media paths reach the catch. The asset-id form already applies the policy. | Fix: the same policy in this catch. |
| `app/api/verify-pdf-provider/route.ts` | AliDocMind `code: message` (`lib/pdf/alidocmind-client.ts:290-294`); MinerU body; `error.message`. | Fix: fixed text at all three sites when managed. |
| `app/api/generate/tts/route.ts` | Doubao `chunk.message` (`lib/audio/tts-providers.ts:1179`); Qwen body; a generic error. | Fix: `visitorErrorText` and fixed text when managed. |
| `app/api/generate/voice/route.ts` | Generic `error.message` or `String(error)`. The adapter's error text was not traced. | Fix as for TTS. The adapter's text is `[Unverified]`. |
| `app/api/web-search/route.ts` | `err.message`; vendor bodies (`lib/web-search/tavily.ts`, `exa.ts`). | Fix: `visitorErrorText` with the flag hoisted. |

## Findings (B and C rows, no change)

- **B (allowed by policy):** `app/api/azure-voices/route.ts`, `app/api/provider/probe-models/route.ts`. Only the visitor's own key can be used.
- **B, no key attached:** `app/api/export-video/render/*`, `app/api/proxy-media/route.ts`. Render-service text, outside the managed-key rule.
- **C (fixed or non-upstream text):** `scene-content`, `scene-actions`, `quiz-grade`, `generate/tts` (other sites), `generate/voice` (other sites), `chat/pi`, `web-search` (other sites), the PBL routes (other sites), `extract-document` (other sites), `generate-classroom` and `materials` (other sites), `stages/*`, `usage`, `classroom`, `server-providers`, `agent/skills`, and the owner-event routes. The owner events carry no error field.

## Helper

- `lib/server/api-response.ts`: `apiError` takes one optional `details` string, added when truthy. It has no `cause` or raw field. `apiSuccess` spreads the caller's data. Callers put upstream text into `details`, so the fix belongs at the callers.

## Disposition

Every A row is fixed, in commit 228d146 (see `scrum/DECISIONS-03.md`, D-30 and D-31, and `scrum/BACKLOG.md`, B18).

- **PBL streams (4 routes):** `createSSEResponse` takes a required `managedKey`. Error events and thrown errors carry `MODEL_FAILURE_TEXT` under the operator's key. The event codes are unchanged. `visitorStreamEvent` was not reused, because the PBL wire format is flat.
- **Agent sessions:** under the operator's key, the session `error` and the `session_end` error carry fixed text. Provider error text in persisted assistant frames (`errorMessage`) is replaced when the event is appended. The stored event-log shape is otherwise unchanged. The entry tree still stores raw frames. No route reads the entry tree [Inference].
- **Materials:** document-path failures store `EXTRACTION_FAILURE_TEXT`, and the provider text goes to the server log. Extraction credentials are operator-owned, so the rule applies without a managed check. Media-path failures no longer store the ASR adapter's message. Our own extraction messages, such as the deadline message, are still stored.
- **Classroom jobs:** the job error is `MODEL_FAILURE_TEXT` when any model the run resolved uses the operator's key. The audit's creation site was wrong: the job is created at `app/api/generate-classroom/route.ts:45`. The managed flag is reported from `generateClassroom`.
- **Routes:** transcription, parse-pdf, extract-document (multipart), verify-pdf-provider (three sites), generate/tts (three sites), generate/voice (generic site), web-search. Each uses `visitorErrorText` or fixed text, and the managed flag is hoisted out of `try` where a catch needs it.
- **Not changed, by audit:** azure-voices and probe-models (visitor key only), the render routes (no key attached), and the C rows (fixed or non-upstream text).
- **Not verified:** the adapter text behind voice and extract-document was not traced `[Unverified]`. A `MaterialExtractionError` raised by an adapter with vendor text would still pass through the media path `[Unverified]`.
