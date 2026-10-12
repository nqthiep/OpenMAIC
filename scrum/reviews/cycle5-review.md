# Cycle 5 independent reviews

Two read-only reviews ran in cycle 5. Neither edited files. Dispositions are in `scrum/DECISIONS-02.md`.

## Review A: presence lease (B40)

Scope: `lib/media/stage-realm-presence.ts`, `tests/media/stage-realm-presence.test.ts`, `scrum/specs/presence-lease.md`, with `lib/media/collect-stage-asset-refs.ts` and `lib/media/asset-pool.ts` for context. Line numbers below refer to the lease commit `c2ff226`, before the fixes.

Verdict: no High findings. The only path to `absent` is the probe timer, and a live peer renewed within 90 s stays visible. Storage failures answer `unknown`. The interval is cleared on reset, and the page-hide listener registers once per module instance.

| # | Severity | Location | Finding | Disposition |
|---|---|---|---|---|
| 1 | Medium | `c2ff226` stage-realm-presence.ts:221-222 | A page kept in the back-forward cache fires `pagehide`, which dropped its lease at once; the spec said 90 s | **Fixed** (6f791c0): release only when `persisted` is false; test "keeps the lease when the page is only stored in the back-forward cache" |
| 2 | Medium | stage-realm-presence.ts:23-25 | The one-minute timer alignment was stated as fact; not measured here | **Fixed**: the comment now says it is not measured; the spec marks it `[Unverified]` |
| 3 | Low | stage-realm-presence.ts:200-202 | A refused write (quota) leaves that peer probe-only; the spec omitted it | **Fixed**: added as residual 3 in the spec |
| 4 | Low | stage-realm-presence.ts:207-210 | A failed removal after the key was cleared made the realm count its own lease as a peer until the lease lapsed | **Fixed**: the key is cleared only after the removal succeeds; test "does not count its own lease as a peer after a failed release" |
| 5 | Low | stage-realm-presence.ts:171 | A missing storage API reads as `absent`; reviewer asked for `unknown` and stubbed storage in Node tests | **Rejected** with reason: only Node reaches that case; browsers have the API or it throws (`unknown`). Changing it would send 34 test files down the fork path. Recorded in the spec and D-19 |
| 6 | Low | stage-realm-presence.ts:179-183 | Lapsed leases were removed only for the stage being probed, so the table could grow | **Fixed**: each renewal sweeps lapsed leases for all stages; test "removes lapsed leases of any stage when a realm renews" |
| 7 | Medium | stage-realm-presence.test.ts:168-180 | The lapsed-lease test passed on the previous code, because its `absent` came from the late reply | **Fixed**: the test asserts the lease existed before the lapse |
| 8 | Low | stage-realm-presence.test.ts:214-231 | The page-hide test failed on the previous code before reaching the page-hide call | **Fixed**: asserts both realms registered a listener, and that the lease existed before the call |
| 9 | Low | presence-lease.md:3, :43 | "20 pass" mixed 13 presence cases and 7 cases that mock the presence module | **Fixed**: the spec states the split; the count is now 16 + 7 = 23 |
| 10 | Medium | stage-realm-presence.test.ts:76-85 (pre-existing) | The raw-peer test needed a reply inside 250 ms of real time, so a stalled loop could fail it | **Fixed**: a synchronous channel double delivers the reply inside the probe call |
| 11 | Low | stage-realm-presence.test.ts:168-180, :214-231 | The `absent` in the late-reply tests depended on the timer firing before a 400 ms reply | **Fixed**: replies are held until the test releases them after the probe settles |

Reviewer's note on the probe: lease-only answers use no timer, so only the probe path (old bundles) waits on the window.

## Review B: log hygiene and operator keys (B43)

Scope: 293 `log.*` and `console.*` calls in `app/`, `lib/server/`, `lib/ai/`, `lib/pbl/`, `lib/orchestration/`. The reviewer read the installed `@ai-sdk/provider` error class, which stores `url`, `requestBodyValues`, `responseHeaders` and `responseBody`, and not request headers `[Verified: node_modules/.pnpm/@ai-sdk+provider@3.0.8/.../dist/index.js:104-110]`.

Verdict: the "covered by `describeUnexpectedError`" claim in cycle 4 does not hold. Two paths can put key material in a log, and one path sends operator upstream text to visitors.

| Finding | Location | Disposition |
|---|---|---|
| Operator YAML parse error logs source lines that can contain the key | `lib/server/provider-config.ts:216` | **Fixed**: logs `describeUnexpectedError` output |
| Visitor body-parse `SyntaxError` can log a fragment of their key (V8 quotes about 10 characters around the token) | chat/route.ts:207, chat/pi/route.ts:302, azure-voices:61, provider/probe-models:60, verify-pdf-provider:168, generate/tts:168, generate/voice:233 | **Fixed**: seven sites log `describeUnexpectedError` output |
| Operator upstream text reaches visitors through the chat stream, which forwards every generator event | chat/route.ts:159 via lib/orchestration/stateless-generate.ts:504 | **Fixed**: `visitorStreamEvent` replaces error events with `MODEL_FAILURE_TEXT` under the operator's key; tests in `tests/server/error-summary.test.ts` |
| Operator upstream text reaches visitors in the chat pi route | chat/pi/route.ts:284, :309 | **Fixed**: `managedKey` is taken from `resolveModel` and applied to the stream event and the 500 |
| Operator upstream text reaches visitors in image and video generation | generate/image/route.ts:130, generate/video/route.ts:128 (and the content-filter 400s) | **Fixed**: `MODEL_FAILURE_TEXT` for the 500, `CONTENT_BLOCKED_TEXT` for the 400, when `managed` |
| Operator upstream text reaches visitors in the verify routes | verify-image-provider/route.ts:91, :97; verify-video-provider (same pattern, found by the coordinator) | **Fixed**: fixed text when `managed`; `tests/api/verify-image-managed-text.test.ts` covers the operator and visitor cases |
| Provider error objects logged raw at about 27 sites; whether upstream text can echo a key is `[Unverified]` | 293-call scan, see the table in the review | **Open**: B45 |
| Model output and prompts logged at info or warn (visitor content) | scene-outlines-stream:626, agent-profiles:300, director-graph:185, and the prompt and query prefixes | **Open**: B46 (privacy policy, not a key question) |
| Operator-key error paths "covered by `describeUnexpectedError`" | BACKLOG cycle 4 | **Corrected**: only four provider sites use it |

Reviewer's note on the forwarded `stateless-generate.ts:504`: the generator itself logs the raw error at `log.error('[StatelessGenerate] Error:', error)`. That log is an operator log, and it is part of B45.
