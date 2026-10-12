# Owner threading for managed provider keys (D-02 phase 2)

Implements D-02 phase 2 (`scrum/DECISIONS.md:17-21`): "managed keys may be used only by signed-in accounts when accounts are enabled." Phase 1 is in the working tree but incomplete (§1). This file is the specification. The build is next cycle.

**Snapshot.** HEAD `491c409`. The working tree is uncommitted and was still changing while this was written. At the last check it had 48 modified files and 21 untracked entries (`git status --porcelain`). Citations marked **(WT)** are in that state. The (WT) lines were re-checked at the last check. Re-check them again before building.

**Labels.** An unlabelled code fact was read at the cited line. [Unverified] means not checked in code or not runnable here. [Inference] means reasoned from code, not executed. **Decision** marks a choice this spec makes.

## 0. Terms

- **Managed provider**: an entry in the operator's server config for its capability section (`lib/server/provider-config.ts:580-582`). Entries come from environment prefixes (`LLM_ENV_MAP` `:63`, `TTS_ENV_MAP` `:87`, `ASR_ENV_MAP` `:99`, `PDF_ENV_MAP` `:107`, `IMAGE_ENV_MAP` `:113`, `VIDEO_ENV_MAP` `:123`, `WEB_SEARCH_ENV_MAP` `:132`) and from the YAML config (`provider-config.ts:501-530`).
- **Managed key**: the operator's key for a managed provider. It is used whatever the caller sends; a client key is ignored (`provider-config.ts:565-575`, `:606-609`; `lib/server/resolve-model.ts:83-90, 116`).
- **BYOK**: a provider the operator did not configure. The client's key is used (`provider-config.ts:610`). This spec does not change BYOK.
- **Accounts enabled**: `accountsEnabled()`, which is true when `DATABASE_URL` is set (`lib/server/accounts/runtime.ts:22-24`; `lib/config/feature-flags.ts:40-42`; README:390).
- **Signed in**: a live session resolves to `acct:<id>` (`lib/server/agent-runtime/with-owner.ts:19-25` (WT); `lib/server/accounts/runtime.ts:60`, `:75` (WT)).

## 1. Current state

- **Any caller gets a managed key.** `resolveSectionApiKey` takes no caller input (`provider-config.ts:603-611`). `resolveModel` reads the model from the `x-model` header (`resolve-model.ts:173-175`) and gets the key from `resolveApiKey` (`:116`).
- **Access-code gating only.** With `ACCESS_CODE` set, `/api/*` needs the access cookie (`middleware.ts:64-86`). With it unset, every route is open (`middleware.ts:65-67`).
- **No spend attribution.** Usage records have no owner field (`lib/server/usage-storage.ts:26-40`, `:89`).
- **Phase 1 (WT) is incomplete.** `validateManagedKeys` (`lib/server/config-validation.ts:197-207`, called at `:260`) warns only for the LLM map (`LLM_ENV_MAP`). TTS, ASR, PDF, image, video and web-search managed keys are not checked. Fixed in step 0 (§6).
- **Registration.** Closed by default in the working tree (`lib/server/accounts/runtime.ts:30-32`, WT). It was open by default at HEAD. The devil's advocate accepted D-02 only with D-03 option C (`scrum/meetings/devils-advocate.md`, section 4).

## 2. Inventory

"Without a request" is read as: the resolver runs with no owner from the caller. Group A has no request at all (jobs, background code, agent runtime). Group B is a request route that resolves a managed key and does not check an owner. No Group B route passes an owner to its model or key resolver. The chat-Pi route resolves a learner key for another purpose (`app/api/chat/pi/route.ts:182`).

**Group A: no request.** Owner today: No for every row.

| # | Path | Trigger | Section | Cite |
|---|---|---|---|---|
| A1 | Classroom generation | `POST /api/generate-classroom`, then `after()` runs the job | LLM | `app/api/generate-classroom/route.ts:14-48`; `lib/server/classroom-job-runner.ts:13-27`; `lib/server/classroom-generation.ts:48` (no owner field), `:199`, `:279`, `:427` |
| A2 | Classroom media (image, video, TTS) | Called from A1 | image, video, TTS | `lib/server/classroom-media-generation.ts:85, 117, 167, 251, 270` |
| A3 | Agent driver | Each agent turn | LLM (needs a route) | `lib/server/agent-runtime/agent-driver-model.ts:49, 57-63, 82`; caller `runner.ts:1262`. `meta.ownerId` is in scope (`runner.ts:1303`) |
| A4 | Conversation title | Scheduled by sessions and messages routes (`app/api/agent/sessions/route.ts:154, 172`; `app/api/agent/sessions/[id]/messages/route.ts:104`) | LLM | Owner dropped: task has it (`lib/server/agent-runtime/conversation-title-task.ts:9`), generator does not take it (`conversation-title-generator.ts:52, 57-60`); call at task `:23` |
| A5 | Scene generation calls | Generation tools | LLM | `lib/server/agent-runtime/generation-ai-call.ts:14-23`; `generation-tools.ts:225`. Factory takes `abortSignal` only |
| A6 | Agent image tool | `generate_image` | image | `lib/server/agent-runtime/generate-image.ts:76` (deps), `:186`, `:203-205` |
| A7 | Agent video tool | `generate_video` | video | `lib/server/agent-runtime/generate-video.ts:100` (deps), `:230-237` |
| A8 | Agent narration | `synthesizeSceneNarration` | TTS | `lib/server/agent-runtime/scene-tts.ts:23` (input), `:57`, `:66`, `:88` |
| A9 | Voice clone and registration | Agent tools | TTS | `lib/server/agent-runtime/voice-clone-tools.ts:99` (deps), `:362-363` |
| A10 | Agent web search | Capability at startup of a run | web search | `lib/server/agent-runtime/web-search.ts:24-37`; `runner.ts:1286`; `lib/server/web-search-config.ts:89`, `:117`, `:120` |
| A11 | Agent URL fetch with PDF extraction | Agent tool | PDF | `lib/server/agent-runtime/fetch-url.ts:334-335` |
| A12 | Material extraction | Background runner started by `instrumentation.ts:66` | PDF; ASR through media providers | `lib/server/material-extraction/runner.ts:51`; `extract.ts:97, 107, 214-215`; `lib/document/extractors/local-media.ts:410, 420-422` |

**Group B: request routes.** Owner today: No for every row.

| # | Route | Lines | Section |
|---|---|---|---|
| B1 | PBL v2: instructor, open-task, simulator, evaluate | `app/api/pbl/v2/instructor/route.ts:55`; `open-task/route.ts:57`; `simulator/route.ts:53`; `evaluate/route.ts:84` | LLM |
| B2 | Scene generation: content, actions, outlines stream, agent profiles | `app/api/generate/scene-content/route.ts:116`; `scene-actions/route.ts:91`; `scene-outlines-stream/route.ts:299`; `agent-profiles/route.ts:166` | LLM |
| B3 | Chat | `app/api/chat/route.ts:72-81` (stage `chat-adapter`); `app/api/chat/pi/route.ts:103` (owner resolved only for the learner partition, `:182`) | LLM |
| B4 | Quiz grading | `app/api/quiz-grade/route.ts:47` | LLM |
| B5 | Web search | `app/api/web-search/route.ts:69-71, 95, 99, 127` | web search, LLM |
| B6 | Text to speech | `app/api/generate/tts/route.ts:100, 109-110, 129` | TTS |
| B7 | Voice clone and registration | `app/api/generate/voice/route.ts:123, 132-133, 144` | TTS |
| B8 | Speech recognition | `app/api/transcription/route.ts:55, 70-73` | ASR |
| B9 | Image | `app/api/generate/image/route.ts:65, 77, 87, 93` | image |
| B10 | Video | `app/api/generate/video/route.ts:60, 72, 81, 87` | video |
| B11 | PDF and document extraction | `app/api/parse-pdf/route.ts:45, 56-57`; `app/api/extract-document/route.ts:250, 353-358, 401-404` | PDF |
| B12 | Verify routes (each makes a provider call) | `app/api/verify-model/route.ts:22-27`; `verify-image-provider/route.ts:53, 64-65`; `verify-video-provider/route.ts:48, 59-60, 66`; `verify-pdf-provider/route.ts:27, 90, 96, 139, 144` | LLM, image, video, PDF |

**Not spend paths.** `app/api/provider/probe-models/route.ts:22-38` uses the client key only. `app/api/server-providers/route.ts:19` returns model lists and no keys (`provider-config.ts:632-640`). Startup presence checks do not spend.

**Stage routes.** `getStageRoute` (`lib/server/model-routes.ts:256-267`) can name a managed provider for a stage. A routed stage overrides the client's model and drops its credentials (`resolve-model.ts:63-65, 78-81`). Every caller of that stage then spends the managed key. Covered by R3.

## 3. How the owner reaches each input

**3.1 One value.** `ManagedKeyCaller = { ownerId?: string }`. `ownerId` is set only from a live session (`acct:<id>`). Never from a body, a query string or a header. The server already refuses `acct:` in `x-learner-key` (`lib/persistence/server-auth.ts:95`).

**3.2 Requests (B1 to B12).** Each route calls `resolveSignedInOwnerId(req.headers)` (`with-owner.ts:19-25`, WT) before any resolver, and passes the result down. `resolveModelFromRequest` and `resolveModelFromHeaders` take a `caller` argument (`resolve-model.ts:168-196`).

**3.3 Agent runtime (A3 to A10).** The runner has the session owner (`runner.ts:1303`, `meta.ownerId`). Pass it to: `resolveAgentDriverModel(caller)` (A3); `createGenerationAiCallFactory({ abortSignal, caller })` (A5); the deps types `GenerateImageToolDeps` (`generate-image.ts:76`), `GenerateVideoToolDeps` (`generate-video.ts:100`), `SceneTtsInput` (`scene-tts.ts:23`), `VoiceCloneToolDependencies` (`voice-clone-tools.ts:99`) and the web-search capability (A10); and `generateConversationTitle(text, caller)` (A4, from `conversation-title-task.ts:23`). None of these files has an owner field today (checked by grep).

**3.4 Classroom jobs (A1, A2).** The route resolves the caller and sets `ownerId` in `GenerateClassroomInput` (`classroom-generation.ts:48`). The job record gets it (`lib/server/classroom-job-store.ts:17-41`). `runClassroomGenerationJob` takes the input (`classroom-job-runner.ts:13-17`) and passes it to `generateClassroom` (`classroom-job-runner.ts:27`; `classroom-generation.ts:176`). That function passes `caller` to `resolveModel` (`classroom-generation.ts:199, 279, 427`) and to the media calls (`classroom-media-generation.ts`). The public GET names its fields and omits the owner (`app/api/generate-classroom/[jobId]/route.ts:31-44`).

**3.5 Material extraction (A12).** Find the owner from the row. A session material's owner is its session's owner: `agent_session_materials.session_id` (`packages/@openmaic/storage/src/material/pg.ts:58`) → `agent_sessions.owner_id` (`packages/@openmaic/storage/src/agent-session/pg.ts:93`). Resolve it before `extractClaimedSessionMaterial` (`extract.ts:97`) resolves any key.

**3.6 Routed stages.** Enforce inside `resolveModel`, after the route is chosen (`resolve-model.ts:63-65`) and before the key is read (`:116`). That covers routes and client-named models alike.

**3.7 Sync resolvers.** `resolveTTSApiKey`, `resolveImageApiKey` and the others are synchronous (`provider-config.ts:686`, `:784`, `:821`, `:852`, `:911`, `:971`). Wrap each spend-path call in an async guard, `requireManagedKey(section, providerId, caller)`. Presence checks (`lib/server/agent-runtime/roster-tools.ts:106, 111`; `config-validation.ts`) do not spend and stay unguarded.

```ts
// lib/server/managed-key-access.ts (new), signatures only
export interface ManagedKeyCaller { ownerId?: string }      // 'acct:<id>' or undefined
export class ManagedKeyAccessError extends Error {
  readonly code = 'MANAGED_KEY_REQUIRES_ACCOUNT' as const;   // 'MANAGED_KEY_OWNER_MISSING' for jobs
}
export async function assertManagedKeyAllowed(caller: ManagedKeyCaller): Promise<void>;
```

## 4. Rule

- **R1 (enforcement).** A managed key is returned only when `accountsEnabled()` is true, `caller.ownerId` starts with `acct:`, and that account is not disabled. Otherwise throw `ManagedKeyAccessError`. Routes answer 403 with the code and no upstream text, the pattern of `scrum/DECISIONS.md:98-101` (D-16).
- **R2 (BYOK).** Unmanaged providers keep today's behaviour: the client's key only (`provider-config.ts:610`).
- **R3 (managed provider named by the client or routed).** R1 applies. A caller holding its own key is refused too, because the operator's configuration wins (`provider-config.ts:606-609`). A BYOK user can use any provider the operator did not configure.
- **R4 (disabled accounts fail closed).** `findSessionAccount` already excludes disabled accounts (`lib/server/accounts/store.ts:135`). Jobs have no session, so they check at each resolution: `SELECT 1 FROM accounts WHERE id = $1 AND disabled_at IS NULL`.
- **R5 (decision: access-code-only mode, `DATABASE_URL` unset).** Managed keys are refused in every case, even with a valid access cookie. Reasons: R1 has no identity to check without accounts; the access code is one shared secret, so spend cannot be tied to a person (`middleware.ts:64-86`); and usage has no owner (`usage-storage.ts:89`). Consequence: a deployment with `ACCESS_CODE` and no `DATABASE_URL` keeps BYOK only until it sets `DATABASE_URL`.
- **R6 (fully open: no access code, no accounts).** Covered by R5. The phase-1 warning (step 0) must say so.
- **R7 (jobs queued without an owner fail closed).** The job ends `failed` with `MANAGED_KEY_OWNER_MISSING`, and no managed key is read. Jobs that use only BYOK keys still run.
- **R8 (running work).** A run keeps the key it already resolved: `generation-ai-call.ts:21-23` caches `resolved`. [Inference] A run is bounded in time, so this is acceptable. Cancelling a disabled account's running work is deferred (D-05).

## 5. Consequences

- **C1. Classroom generation has no BYOK path.** The job input has no model or key field. The route body carries only web-search keys and flags (`app/api/generate-classroom/route.ts:19-36`). Under R1, anonymous classroom generation fails when the default model's provider is managed. **Decision for this cycle:** classroom generation needs an account when its model is managed. BYOK for jobs is next cycle.
- **C2. Agent sessions.** The driver must come from `MODEL_ROUTES` (`agent-driver-model.ts:57-63`). With a managed driver, anonymous agent sessions are refused. Sessions are already owner-bound.
- **C3. PBL and scene generation** are request routes. Anonymous callers with a managed provider are refused.
- **C4. Verify routes** (B12) are gated too. Verifying a managed provider needs an account.
- **C5. Registration.** Open registration would make "signed in" cheap. D-03 (WT, `runtime.ts:30-32`) must ship before R1 counts as enforcement.
- **C6. No spend attribution.** Add an owner column to usage rows (`usage-storage.ts:89`). Not needed for R1. Needed for any spend ceiling.
- **C7. [Unverified] Hosted deployment.** README:94 says hosted mode uses an access code. The README does not say whether it has a database. If it has none, R5 stops managed keys there.

## 6. Implementation order and cost

| Step | Work | Cost |
|---|---|---|
| 0 | Extend `validateManagedKeys` (`config-validation.ts:197-207`) to all managed sections (the env maps at `provider-config.ts:87-132`). Add the R5 and R6 consequence to the message | S |
| 1 | Confirm D-03 and D-12 (WT, `with-owner.ts:34-54`) are committed. R1 depends on both | S |
| 2 | `assertManagedKeyAllowed` (§3), the typed error, and the account-active check (R4) | S |
| 3 | Add `caller` to `resolveModel` (`resolve-model.ts:41-55`) and to the header and body wrappers (`:168-196`). Add async guards for the sync resolvers (`provider-config.ts:686-1000`) | M |
| 4 | Gate B1 to B12 at the route boundary with one helper | M |
| 5 | Classroom jobs: owner threading and fail-closed (A1, A2, R7) | M |
| 6 | Agent runtime threading (A3 to A11) | L |
| 7 | Material extraction (A12) | M |
| 8 | Owner column on usage rows | S |
| 9 | Documentation: README and `.env.example`, including R5 | S |
| 10 | Tests (§7), written with each step | L |

Steps 0 and 1 come first. Steps 2 to 9 cannot ship before them.

## 7. Tests

| # | Test | Cost |
|---|---|---|
| T1 | Policy table: accounts on or off × no owner, signed-in, anonymous × managed, unmanaged, routed. Allowed only when accounts are on, the owner is signed in, and the provider is managed or unmanaged (BYOK) | S |
| T2 | Each B route: anonymous request to a managed provider gives 403 `MANAGED_KEY_REQUIRES_ACCOUNT`, and the upstream fetch mock is called 0 times | M |
| T3 | Each B route: signed-in request to a managed provider reaches the upstream mock; BYOK is unchanged | M |
| T4 | Managed provider with a client key: the server key is used only when allowed (`resolve-model.ts:116` behaviour kept) | S |
| T5 | Routed stage: anonymous and BYOK callers are both refused for a managed route | S |
| T6 | Access-code-only (no `DATABASE_URL`) with a valid access cookie: refused (R5) | S |
| T7 | Disabled account: session refused (R4); job resolution refused | S |
| T8 | Job without an owner and with a managed provider: `failed` with `MANAGED_KEY_OWNER_MISSING`, no fetch. Job with an unmanaged provider and its own key: runs | M |
| T9 | Owner cannot come from the body or a header (`x-learner-key: acct:…` and a body `ownerId` are ignored) | S |
| T10 | Refusal bodies contain no upstream text | S |
| T11 | Phase-1 warning covers every managed section (one case per env prefix, `provider-config.ts:63-132`). Existing pattern: `tests/server/config-validation.test.ts` (WT) | S |
| T12 | Usage record carries the owner | S |
| T13 | Agent driver: anonymous owner refused, signed-in owner allowed | M |

Test lanes: the vitest include glob is `tests/**/*.test.ts` (`vitest.config.ts:11`). T8 needs a job runner test, not a route test.

## 8. What this spec does not cover

- Spend ceilings and quotas (devil's advocate risk 5, `devils-advocate.md` section 3).
- Cancelling a disabled account's running work (D-05).
- BYOK for classroom jobs (C1).
- Error text beyond managed keys (D-16, next cycle).
- Key rotation and revocation at the provider.
- Durable classroom jobs. [Inference] The job input lives only in process memory: `classroom-job-store.ts:64` stores `inputSummary` alone, and the job file (`:68-69`) has no input. A restart loses the input.

## 9. Open questions

1. **[Unverified] Access-code-only deployments (most important).** Does any production deployment run with a managed key and no `DATABASE_URL`? R5 stops those deployments' managed keys. Owner: product and operations, before the build.
2. [Product] Must classroom generation accept BYOK next cycle (C1)?
3. [Security] Store the owner id in the job file, or only a flag? This spec stores the id; the public GET omits it.
