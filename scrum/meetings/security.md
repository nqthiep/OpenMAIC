# Security memo (role S): team meeting 01

[Unverified] Response-level label: parts of this memo are unverified. Each claim carries its own label.

- Date: 2026-10-11. Branch: `claude/hopeful-sagan-267tw5` (HEAD `491c409`).
- Scope: D-01, D-02, D-03, D-09, D-10, D-11, D-12, D-16, D-17, D-18, plus a security view of D-05. Not reviewed: D-04, D-06, D-07, D-08, D-13, D-14, D-15.
- Conduct: read-only. No production or test file changed. No git state change. No test suite, no build, no server start.
- Labels: `[Verified: file:line]` read in this session. `[Measured: how]` run here. `[Inference]` reasoned from code. `[Unverified]` not established. `[External: URL]` web search snippet; the page was not opened.
- Measurement setting: this container, Node v22.22.0, 4 CPUs. Numbers are not production numbers.
  - M1: the real `LoginThrottle` class (`lib/server/accounts/login-throttle.ts`), transpiled in memory with the repo's esbuild, run on a simulated clock for 24 h.
  - M2: scrypt, N=2^16, r=8, p=1, 8 sequential derivations: about 220 ms each.
  - M3: HMAC-SHA256 on one core: about 336,500 guesses per second.
  - M4: `nanoid()` returns 21 characters; `nanoid(10)` returns 10.
  - M5: an Error's `stack` begins with its name and message; a `cause`'s message is not included.
  - M6: ripgrep (rg) counts over the stated paths, noted inline.

---

## 0. Corrections to agenda and backlog facts

1. **D-01** cites `lib/utils/stage-storage.ts:1273` as the course-id generator. [Verified: that line is `id: nanoid()` on a `FolderRecord`.] Real course ids differ: imports use `nanoid()`, 21 characters ([Verified: lib/import/use-import-classroom.ts:396]); workbench stages use `stage-` plus 12 base64url characters, 18 in total ([Verified: app/api/stages/route.ts:31]); generated classrooms use `nanoid(10)` ([Verified: lib/server/classroom-generation.ts:522]).
2. **D-10** names only `buildRequestOrigin`. [Verified: lib/server/media-origin.ts:74-77] has a second copy, `requestOrigin`, that also trusts `x-forwarded-host`. [Measured: rg] No production caller exists; only `tests/server/media-origin.test.ts` uses it.
3. **D-12** says requests "silently use the anonymous owner for documents". [Verified: app/api/persistence/[...path]/route.ts:325-331] With `PERSISTENCE_DEV_TOKEN` unset, anonymous document requests get 503, which is not silent. The silent fallback is real when the token is set, and on owner-scoped routes whatever the token.
4. **D-02** frames managed keys as an LLM issue. [Verified: lib/server/provider-config.ts:603-611] The rule applies to every capability section: TTS, ASR, PDF, image, video and web search.
5. **D-03** says there are no deployed users. [Verified: git log and merge-base, read-only] The accounts commits (95463b5, 8b1bfb8) are on this branch only, not on `origin/main` (ebf665f) or local `main`. Whether this branch is deployed is [Unverified]. The README advertises a hosted mode ([Verified: README.md:94]); whether it runs this branch is [Unverified].
6. **D-11** and the README describe the shared lockout as lasting 15 minutes. [Verified: README.md:296] [Measured: M1] A sustained attacker keeps the lock in place for the whole simulated day (see D-11).
7. **D-09** suggests `instrumentation.ts`. [Verified: instrumentation.ts:40] already calls `validateServerConfig()`, and `[config]` warnings live in [Verified: lib/server/config-validation.ts:36-40, 173-184]. Put the warning there.

## 0.1 Framing facts

- [Verified: middleware.ts:64-67] With `ACCESS_CODE` unset, every route passes.
- [Verified: middleware.ts:70, 76, 81-86] With it set, `/api/*` needs the `openmaic_access` cookie, except `/api/access-code/*` and `/api/health`.
- [Measured: rg over app/api] No generation, provider or chat route reads `ACCESS_CODE` or a session in its handler. The persistence and owner-scoped routes do read sessions.
- [Verified: .env.example:522] Accounts exist whenever `DATABASE_URL` is set ([Verified: lib/server/accounts/runtime.ts:22-24]).

---

## D-01 Reads of courses and classrooms by id (B1)

**Recommended: B for stage documents. A (status quo) for classrooms until classrooms have an owner.**

Evidence
- [Verified: lib/persistence/document-access.ts:65] With no owner, the decision is `forbid`.
- [Verified: document-access.ts:70-74] `read` allows any caller when the stage exists and is not deleted. There is no owner check.
- [Verified: document-access.ts:75-85] `write` and `delete` require the owner. Writes are owner-scoped; reads are not.
- [Verified: lib/persistence/stage-meta.ts:4-13] The meta row already carries `ownerId`, `isPublic` and `deletedAt`, so option B needs no new query.
- [Measured: rg] `isPublic` is read by `lib/server/stage-access.ts:110`, `app/api/stages/[id]/publish/route.ts:41` and `status/route.ts:35-37`. The document read path does not read it.
- [Verified: app/api/classroom/route.ts:123-148] Classroom GET returns the full classroom by id, with no owner or publish check.
- [Verified: lib/server/classroom-storage.ts:118-123] Classroom records have no owner field, so option B cannot apply to classrooms without a schema change.
- [Verified: app/api/classroom/route.ts:71] and [Verified: lib/server/classroom-storage.ts:70-72] Client-chosen classroom ids are accepted, up to 128 characters.
- [Measured: M4] Id lengths: 21 (imports), 18 (workbench stages), 10 (generated classrooms). [Inference] A 10-character id carries about 60 bits if the nanoid alphabet has 64 symbols [Unverified: alphabet not checked].

Strongest argument against
- [Inference] B breaks any existing share link to an unpublished course.
- [Inference] B also makes an anonymously created, unpublished course unreadable by id after sign-in. Listings already lose such courses (backlog B2), so B adds loss mainly for direct links.

Cost: S for documents. Classrooms would be L (owner field, migration, ownership on `POST /api/classroom`).
Reversal: S. Revert the read branch.
Confidence: 0.6.
What would change the position: evidence that users share unpublished course links in production (then option C, expiring tokens, cost L). Confirmation that capability reads are the intended public-sharing model (then option A with a written threat model).

---

## D-02 Managed provider keys (B5)

**Recommended: B, managed keys only for signed-in accounts when accounts are enabled.** If B cannot land this cycle, a stop-gap that is not in the agenda: refuse managed keys whenever `ACCESS_CODE` is unset, unless the operator sets an explicit opt-in. Cost of the stop-gap: S.

Evidence
- [Verified: lib/server/provider-config.ts:603-611] For a configured provider the server key is returned whatever the client sends. The same resolver serves the other sections at lines 687 (TTS), 785 (ASR), 822 (PDF), 853 (image), 912 (video) and 977 (web search).
- [Verified: lib/server/resolve-model.ts:91, 108, 116] Managed providers ignore the client's key and base URL. No caller is checked.
- [Verified: resolve-model.ts:63-65] With no stage route and no `x-model`, the model falls back to `DEFAULT_MODEL`. A request that names no provider still uses the server key.
- Anonymous spend, answered directly: yes. With `ACCESS_CODE` unset, no check runs ([Verified: middleware.ts:64-67]). With it set, anyone holding the shared code can spend, with no account needed ([Measured: rg] no handler reads a session).

Routes that accept a provider id or model from the client (all define `export async function POST`)

LLM
- `/api/chat`: body `model`, `apiKey`, `baseUrl`, `providerType` ([Verified: app/api/chat/route.ts:32, 53-62]). Client messages are forwarded to the model ([Verified: chat/route.ts:132-135]).
- `/api/chat/pi`: the same fields ([Verified: app/api/chat/pi/route.ts:103-111]).
- `/api/verify-model`: body `model`, `apiKey`, `baseUrl`, `providerType` ([Verified: app/api/verify-model/route.ts:12-13, 22-27]). The prompt is fixed and output is capped at 64 tokens ([Verified: verify-model/route.ts:42-43]).
- Headers `x-model`, `x-api-key`, `x-base-url`, `x-provider-type`, read by `resolveModelFromRequest` ([Verified: lib/server/resolve-model.ts:173-178]): `/api/generate/scene-content` (`:116`), `/scene-actions` (`:91`), `/scene-outlines-stream` (`:299`), `/agent-profiles` (`:166`), `/api/quiz-grade` (`:47`), `/api/pbl/v2/evaluate` (`:84`), `/instructor` (`:55`), `/open-task` (`:57`), `/simulator` (`:53`), `/api/web-search` (`:127`).
- `/api/web-search`: the provider id is destructured from the request body ([Verified: app/api/web-search/route.ts:39-44]) and used unless it is managed and the server default differs ([Verified: :60-77]).

Other capability sections (same rule)
- `/api/transcription`: formData `providerId` ([Verified: :25]) → `resolveASRApiKey` (`:72`).
- `/api/parse-pdf`: formData `providerId` (`:31`) → `resolvePDFApiKey` (`:56`).
- `/api/extract-document`: formData or JSON `providerId` (`:458`, `:600-619`) → `resolvePDFApiKey` (`:358`, `:401`).
- `/api/verify-pdf-provider`: body `providerId` (`:19`) → `:90`, `:144`.
- `/api/generate/image` and `/api/verify-image-provider`: header `x-image-provider` (`:54`, `:41`) → `resolveImageApiKey` (`:77`, `:64`).
- `/api/generate/video` and `/api/verify-video-provider`: header `x-video-provider` (`:49`, `:36`) → `resolveVideoApiKey` (`:72`, `:59`).
- `/api/generate/tts`: body `ttsProviderId` (`:56`) → `resolveTTSApiKey` (`:109`). `/api/generate/voice`: body `providerId` (`:89`) → (`:132`).
- `/api/generate-classroom`: body `webSearchProviderId` and `webSearchApiKey` ([Verified: app/api/generate-classroom/route.ts:24-25]) → `lib/server/web-search-config.ts:104-117`.

Managed-key spend with no client provider id
- `/api/generate-classroom` runs `resolveModel({ stage: 'generate-classroom' })` ([Verified: lib/server/classroom-generation.ts:199]; also `:279`, `:427`).
- `/api/agent/sessions` schedules a title call ([Verified: app/api/agent/sessions/route.ts:154, 172]) → `conversation-title-task.ts:23` → `conversation-title-generator.ts:59`. The owner is in scope at [Verified: conversation-title-task.ts:9, 14, 31] and is not passed on.
- Agent driver: [Verified: lib/server/agent-runtime/agent-driver-model.ts:82]. [Unverified: triggering path not traced.]
- Classroom TTS: [Verified: lib/server/classroom-media-generation.ts:270].

Background jobs and owner identity
- [Verified: resolve-model.ts:41-55] `resolveModel` takes no owner. Classroom generation, title generation and the agent driver all call it without one.
- [Verified: app/api/generate-classroom/route.ts:19-36] The job input carries no owner.
- [Verified: app/api/agent/sessions/route.ts:140-141] Sessions do carry `ownerId`. The owner exists at the call site and is dropped.
- [Verified: lib/server/usage-storage.ts:42-59] Usage rows have no owner, so option C (per-account quota) needs a schema change.

Strongest argument against B
- [Inference] It removes zero-setup managed keys for anyone behind `ACCESS_CODE`, the hosted pattern in README:94.
- [Inference] Under open registration (D-03 option A) it adds one sign-up step, because registration has no throttle ([Verified: lib/server/accounts/service.ts:108-142]).
- [Inference] Option A's warning does not stop spend. The shared key can be burned by abuse, which harms every user.

Cost: L (LLM and capability resolvers, background owner threading, UI messages). Stop-gap: S.
Reversal: S for the stop-gap. For B, remove the owner check.
Confidence: 0.6.
What would change the position: evidence that the access code is held only by a bounded, trusted group (then option A with a warning is acceptable); provider-side spend caps (then the risk is budget, not abuse).

---

## D-03 Registration default (B14)

**Recommended: C, closed by default; `ACCOUNT_REGISTRATION=open` enables it. Reject option B's clause that opens registration whenever `ACCESS_CODE` is set.**

Evidence
- [Verified: lib/server/accounts/runtime.ts:26-29] Registration is open unless the trimmed, lowercased value equals `closed`. Any typo fails open. [Verified: .env.example:527] documents this.
- [Verified: .env.example:522] Accounts exist whenever `DATABASE_URL` is set. Turning on persistence also turns on public sign-up by default.
- [Verified: service.ts:108-142] Registration has no per-username or per-client throttle. The only limit is the derivation queue ([Verified: lib/server/accounts/password.ts:57, 62, 84]).
- [Measured: M2] One derivation takes about 220 ms here. [Inference] With two concurrent derivations, one process can create on the order of 4 to 9 accounts per second.
- [Verified: .env.example:552] `ACCESS_CODE` is a single shared secret. Under option B, anyone holding it can create unlimited accounts.
- [Measured: rg] Account creation has one caller, the register route ([Verified: app/api/auth/register/route.ts:24]). No command-line or bootstrap tool exists, so the first account needs a temporary `open` value.

Strongest argument against C
- [Inference] Operators who expect sign-up after deploy see a closed form.
- Existing accounts still sign in while registration is closed ([Verified: .env.example:527]).

Cost: S (default, docs, tests). First-account tooling: S to M.
Reversal: S.
Confidence: 0.75.
What would change the position: product confirms that public sign-up is the intended default and D-11's per-client limit ships with it.

---

## D-05 Administrator role and usage endpoint (security view only)

**Recommended: A, with the conditions below.**

- [Verified: app/api/persistence/[...path]/route.ts:156] `authorizeAdmin` returns false.
- [Verified: packages/@openmaic/storage/src/server/index.ts:659-673] Admin-gated routes exist: `DELETE /runtime` deletes all runtime data, and `DELETE /runtime/stages/:id` deletes one stage's runtime data. Both are unreachable today.
- Admin identity must come from a verified session and its account. It must never come from `principal.learnerKey`, which is client-supplied for dev-token callers ([Verified: lib/persistence/server-auth.ts:105]).
- An empty admin allowlist must fail closed. Admin writes need an audit log (backlog B16 already asks for one).
- Disabling works at lookup ([Verified: lib/server/accounts/store.ts:133-135] checks `disabled_at`), but no writer exists ([Measured: rg] none).
- [Verified: app/api/usage/route.ts:71-76] `GET /api/usage` has no auth. Its aggregates include provider mix and volumes ([Verified: lib/server/usage-storage.ts:42-59]). Its consumer is the settings dashboard ([Verified: components/settings/usage-dashboard.tsx:70]). [Inference] Admin-only would leave that dashboard empty for ordinary accounts. In access-code-only mode the endpoint stays open to every gated caller under any option.
- Option C (defer) is acceptable for the destructive routes, which are unreachable. It leaves the usage endpoint open.

Cost: M. Reversal: S (remove the allowlist).
Confidence: 0.6.
What would change the position: the team decides usage data may be visible to any user.

---

## D-09 Default signing for access cookies (B6)

**Recommended: A, plus a boot warning in `validateServerConfig` and a warning for any `ACCESS_CODE` below a stated minimum. No minimum exists today.**

Evidence
- [Verified: lib/server/access-token-policy.ts:28-33] Without `ACCESS_COOKIE_SECRET`, the signing key is the access code.
- [Verified: lib/server/access-token.ts:9-13] The token is `timestamp.HMAC(key, timestamp)`. One captured cookie allows offline checks of candidate codes.
- [Measured: M3] About 336,500 HMAC/s per core. Average exhaustive search on one core: a 6-digit numeric code about 1.5 s; an 8-character lowercase code about 86 h; an 8-character alphanumeric code about 90,000 h; a 12-character alphanumeric code is not practical. [Inference] GPUs or many cores shorten these figures.
- [Measured: rg] No minimum length or strength check exists for `ACCESS_CODE`. No startup warning exists for a missing `ACCESS_COOKIE_SECRET` ([Verified: instrumentation.ts:13-40] and [Verified: lib/server/config-validation.ts:173-184]).
- [Verified: lib/server/access-token-policy.ts:34-41] and [Verified: middleware.ts:76] The short-secret warning fires only when a request carries a cookie.
- [Verified: lib/server/access-token-policy.ts:12] Cookies last 7 days. The same gate controls managed-key spend (D-02).

Strongest argument against A
- [Inference] A warning changes nothing for operators who ignore logs, and a short code stays offline-guessable.
- Option B (require the secret in production) is stronger. It breaks existing access-code deployments and signs everyone out once.

Cost: S. Reversal: S.
Confidence: 0.55.
What would change the position: measured evidence that deployed codes have high entropy (then A is adequate), or a release announcement that makes the secret required (then B, with notice).

---

## D-10 Trust in `x-forwarded-host` (B7)

**Recommended: C, an allowlist of public origins from an environment variable. Stronger alternative outside the agenda: D, store relative media paths as the agent runtime already does.**

Stored: origins built from request headers that are persisted
1. Classroom JSON scene media and audio URLs. Origin path: `app/api/generate-classroom/route.ts:43` → `lib/server/classroom-job-runner.ts:16, 28` → `classroom-generation.ts:677-678` (images and video, gated at `:667`), `:696` (TTS, gated at `:686`), persisted at `:711-718`. URLs are built at `lib/server/classroom-media-generation.ts:77-79` and used at `:155`, `:194`, `:319`.
2. Job JSON result. [Verified: lib/server/classroom-job-store.ts:198-209] stores `result.url` for every successful job, written to `data/classroom-jobs/<id>.json` ([Verified: classroom-job-store.ts:44, 118]). This happens even when no media option is set.
3. Agent session row. [Verified: app/api/agent/sessions/route.ts:147] → [Verified: packages/@openmaic/storage/src/agent-session/pg.ts:100 (column), :549 (insert)]. Returned to the owner at `pg.ts:420`. [Measured: rg] No production code reads it to build URLs.

Returned only, to the same request
- `POST /api/classroom` `url` ([Verified: app/api/classroom/route.ts:80, 92-96, 108]). The stored record omits it ([Verified: lib/server/classroom-storage.ts:118-123]).
- `pollUrl` in `POST /api/generate-classroom` ([Verified: app/api/generate-classroom/route.ts:43-46]) and in `GET /api/generate-classroom/[jobId]` ([Verified: app/api/generate-classroom/[jobId]/route.ts:29]).

Latent
- [Verified: lib/server/media-origin.ts:74-80] trusts the same header. [Measured: rg] No production caller.

How the header reaches the origin
- [Verified: node_modules/next/dist/server/base-server.js:574-577] Next sets `x-forwarded-host` from `Host` when the header is absent, and `x-forwarded-proto` and `x-forwarded-for` from the socket. [Inference] This applies to App Router routes, since the code sits in `handleRequestImpl` (`base-server.js:484-529`).
- [Verified: node_modules/next/dist/server/next-server.js:1266] and [Verified: base-server.js:334-339] The request URL is built from `fetchHostname:port` when a hostname is configured.
- [Verified: node_modules/next/dist/build/utils.js:1088] and [Verified: Dockerfile:91] The standalone server defaults to `HOSTNAME || 0.0.0.0`, and the image sets `HOSTNAME=0.0.0.0`.
- [Inference] Option A's fallback (`req.nextUrl.origin`) would be `http://0.0.0.0:3000` in the default Docker image. That breaks media and share URLs for every untrusted deployment. [Unverified: not run; needs a platform check.]
- [Inference] A direct client's `Host` value reaches the stored origin through the header that Next fills in. Option A removes the explicit-header path. Whether a `Host`-derived path remains depends on hostname configuration.
- [Measured: rg] No document mentions `x-forwarded-host`. The header is implicit in every Node deployment. Other code gates forwarded headers behind `TRUST_PROXY_HEADERS` ([Verified: app/api/access-code/verify/route.ts:28] and [Verified: app/api/export-video/render/route.ts:34]).
- [External: https://portswigger.net/web-security/host-header/exploiting/password-reset-poisoning] Search snippet: links built from request host values can be steered through `X-Forwarded-Host` (reset-link poisoning). [Inference] Same pattern as stored media links.

Attack path (victim-facing risk)
- [Inference] A non-browser client sends a chosen `Host` or `X-Forwarded-Host` to `POST /api/generate-classroom` with media or TTS enabled. The stored media URLs point at the attacker's host, and a viewer of that classroom loads media from there. [Unverified: the client fetch path for classroom media was not traced.] The attacker pays LLM and TTS costs.

Strongest argument against C
- [Inference] Operators must set the variable. Multi-domain deployments need a list. Unset keeps today's behaviour, so C needs a warning when it is unset and media is enabled.

Option D (proposal, not in the agenda)
- Store relative `/api/classroom-media/...` references, as the comments at `lib/server/agent-runtime/generate-image.ts:155-160` and `lib/server/media-origin.ts:23-27` describe. This removes the stored origin with no configuration.
- Client and export handling of relative URLs: [Unverified]. Existing records keep their stored origins and need a scrub.

Cost: C is S. D is S to M. Reversal: S.
Confidence: 0.7 (for C).
What would change the position: evidence that every deployment already sits behind a proxy that overwrites both `Host` and `X-Forwarded-Host` (then option A with the flag is adequate), or client code that fails on relative media (then C only).

---

## D-11 Per-client throttles for sign-in and registration (B11)

**Recommended: A, with two conditions: (1) when untrusted, no per-client bucket at all, per-username only, never a shared `direct` bucket; (2) registration gets the same per-client limit when trusted.**

Evidence
- [Verified: app/api/access-code/verify/route.ts:12-16] The access-code bucket allows 10 failures per 15 minutes, per process.
- [Verified: route.ts:27-32] When untrusted, every client maps to one key, `direct`.
- [Verified: lib/server/accounts/service.ts:153-163] Sign-in is limited per username only. Default: 8 failures per 15 minutes ([Verified: lib/server/accounts/login-throttle.ts:22-26]). [Verified: login-throttle.ts:62-64] The window slides: each failure ages out 15 minutes after it was recorded.
- [Verified: service.ts:108-142] Registration has no throttle.
- [Measured: M1] Greedy attacker, shared `direct` bucket, simulated 24 h, one legitimate try per minute:
  - Access-code configuration (10 per 15 min): 960 wrong guesses per day. Legitimate tries blocked: 1439 of 1440. The block lasts for the whole run.
  - Sign-in configuration (8 per 15 min), if it were shared: 768 wrong guesses per day, same result.
  - A per-username lockout alone uses the same mechanism for one name. [Verified: login-throttle.ts:9-11] The file accepts this trade-off.
- [Inference] Spraying across usernames is not limited by the per-username bucket. The bound is scrypt throughput: [Measured: M2] about 4.5 derivations per second per core, with two concurrent derivations ([Verified: password.ts:57]). That is roughly 4 to 9 sign-in attempts per second per instance.
- [Verified: password.ts:62, 84] and [Verified: lib/server/accounts/http.ts:138-141] When the queue fills, every caller gets 503 `ACCOUNTS_BUSY`. A per-client limit also bounds this.
- [External: https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/04-Authentication_Testing/03-Testing_for_Weak_Lock_Out_Mechanism] Search snippet: lockout must be weighed against denying legitimate users, and distributed guessing or password spraying can slip past per-IP counting. [Unverified: full page not opened.]

Strongest argument against A
- [Inference] In a direct deployment, A does nothing. The compose file describes the default topology as exposed directly and not setting the flag ([Verified: docker-compose.yml:112-113]). Spraying stays bounded only by scrypt.

Cost: S. Reversal: S.
Confidence: 0.55.
What would change the position: evidence that most deployments are direct (then status quo plus D-03 option C, since a shared database store does not solve keying); evidence that a proxy overwrites `X-Forwarded-For` (then A's protection is real).
Note: keep the existing access-code `direct` bucket (confidentiality over availability), and correct the README's description of the lockout.

---

## D-12 Behaviour when a session expires (B12)

**Recommended: A. The server returns 401 `SESSION_EXPIRED` when a session cookie is present but not live, or when an `acct:` key arrives without a live session. The 401 clears the session cookie. Client handling next cycle.**

Path check: confirmed, with refinements
1. The browser sends `openmaic_session` only while its cookie remains. [Verified: lib/server/accounts/session.ts:43-50] Max-Age equals the 30-day TTL ([Verified: session.ts:9] and [Verified: service.ts:95]), so natural expiry usually removes the cookie first.
2. `withRequestOwnerId` → `resolveSignedInOwnerId` returns undefined for revoked, expired or disabled sessions ([Verified: lib/server/agent-runtime/with-owner.ts:18-24, 54]; [Verified: store.ts:133-135]).
3. The fallback is the anonymous cookie. If there is none, a new `anon:` owner is minted and set ([Verified: lib/server/agent-runtime/owner.ts:58-65]). The handler receives `signedIn=false` ([Verified: with-owner.ts:56]).
4. The client keeps its cached `acct:` key for the page lifetime ([Verified: lib/persistence/bootstrap.ts:92-95]) and sends it as `x-learner-key` on every request ([Verified: bootstrap.ts:98-106]).
5. Documents ignore the header and use the resolved owner ([Verified: app/api/persistence/[...path]/route.ts:139]). Anonymous runtime requests with an `acct:` key are refused ([Verified: lib/persistence/server-auth.ts:93-95]), and the storage layer answers 401 ([Verified: packages/@openmaic/storage/src/server/index.ts:408-415]).

What the user would see
- `PERSISTENCE_DEV_TOKEN` unset: anonymous document and runtime requests get 503 `PERSISTENCE_DEV_TOKEN_MISSING` ([Verified: app/api/persistence/[...path]/route.ts:325-331]). It is not silent, but the text names a dev token.
- `PERSISTENCE_DEV_TOKEN` set: document requests return 200 under the anonymous owner, with no signal. Runtime requests return 401.
- Owner-scoped routes such as `GET /api/stages` return 200 under the anonymous owner, whatever the token ([Verified: app/api/stages/route.ts:35-43]).
- Document reads by id still work, since reads are capability reads ([Verified: document-access.ts:70-74]). Edits to account-owned documents return 403 `FORBIDDEN_DOCUMENTS` ([Verified: packages/@openmaic/storage/src/server/document.ts:324-330]). New content lands in the anonymous partition and is absent after the next sign-in. [Inference]
- Realistic trigger: sign-out in one tab while another stays open. Logout clears the shared cookie ([Verified: app/api/auth/logout/route.ts:22]). The other tab keeps its memo. [Measured: rg] No cross-tab session sync exists; only asset and presence events use BroadcastChannel.
- [Unverified] How the UI renders the 503 or 403 was not traced.

Strongest argument against A
- [Inference] Until the client clears its memo on 401, the page keeps failing until reload. Users see errors until the client ships. A shared browser with a stale cookie loses anonymous use until the cookie is cleared; the 401 clears the cookie, which limits this.

Why not B (reload on expiry)
- [Inference] The server sends no signal on owner-scoped routes, since the stage list returns 200. A reload trigger would not fire there, so B needs A's signal anyway.

Why not C (status quo)
- It silently switches partitions. The runtime path already refuses `acct:` keys by design ([Verified: server-auth.ts:93-95]), so A extends existing intent.

Cost: S server (with-owner.ts, persistence route, tests). M client, next cycle.
Reversal: S.
Confidence: 0.75.
What would change the position: a flow that deliberately continues anonymously after sign-out (none found).

---

## D-16 Error details sent to clients (B18)

**Recommended: A, refined: managed-key failures never send upstream detail to the client. Other failures use fixed categories. Logs get redacted text.**

Evidence
- [Verified: lib/server/api-response.ts:58-73] `details` is sent whenever it is non-empty, in every environment.
- [Measured: rg] About 26 route files send raw `error.message` or `String(error)` in `details` or `error`. Examples: `app/api/verify-model/route.ts:33, 71`; `app/api/chat/route.ts:204`; `app/api/classroom/route.ts:118, 158`; `app/api/generate-classroom/route.ts:70`.
- [Verified: lib/server/llm-error-response.ts:63-73] A sanitized helper exists. [Measured: rg] `scene-content` and `scene-actions` use it. This is precedent for option A.
- [Verified: components/settings/asr-settings.tsx:184] The ASR test UI shows `details`. Users with their own keys rely on it.
- Credentials in upstream text:
  - [Measured: rg] No code interpolates an API key into an error string. Keys appear only in `Authorization` headers.
  - [Verified: lib/media/adapters/nano-banana-adapter.ts:62-68, 77-80] and [Verified: lib/media/adapters/veo-adapter.ts:197-203, 212-215] The Google adapters put the key in the query string. Their errors are swallowed or replaced with fixed text.
  - [Verified: node_modules/@ai-sdk/google/dist/index.mjs:2979] The SDK appends the key to a video download URI.
  - [Verified: node_modules/.pnpm/@ai-sdk+provider@3.0.8/node_modules/@ai-sdk/provider/dist/index.mjs:43-68] `APICallError` keeps URL, body and headers in separate fields, so only the provider's message reaches `error.message`. One installed copy was read; the copy the app resolves was not confirmed.
  - [Unverified] Whether any real provider echoes a key or key fragment in its error message.
- Logs: [Verified: lib/logger.ts:17-19] prints `error.stack`, and [Measured: M5] the stack header carries the message. Logs therefore carry upstream text too.
- [External: https://wiki.owasp.org/index.php/Error_handling] Search snippet: users should see no sensitive failure details. The cheat sheet itself was not retrieved. [Unverified]

Strongest argument against A
- [Inference] BYOK users lose the raw message that helps them fix a key or model name. Logs remain a disclosure channel until redaction exists.

Cost: S. Reversal: S.
Confidence: 0.7.
What would change the position: evidence that managed-provider errors never carry operator-side detail and BYOK users are the majority (then only the managed-key rule applies); evidence that providers echo key fragments (then option A everywhere, plus redaction).

---

## D-17 Intermittent account-route failure (B26)

**Recommended: B. Log the error name and code only. Strip everything before the first `    at` frame from any stack. Keep a sentinel test for logs.**

Security impact: none found. This is a quality and availability concern.
- [Verified: app/api/auth/login/route.ts:24-30] The cookie is set only after `loginAccount` resolves.
- [Verified: lib/server/accounts/http.ts:131-149] Unexpected errors become 500 `INTERNAL_ERROR` with `no-store`. [Verified: tests/accounts/routes.test.ts:526-532] The test asserts zero cookies. The path fails closed.
- [Verified: tests/accounts/routes.test.ts:510-537] The sentinel test checks that database text stays out of the response and `console.error` (lines 533-534).
- [Verified: tests/accounts/routes.test.ts:52-54] Throttle state is reset per test.
- [Verified: vitest.config.ts:10-13] No retry is configured, so retries do not mask the flake.
- [Inference] A 429 case failing as a 500 suggests the failure came before the throttle check, for example in `accountServiceDeps` ([Verified: lib/server/accounts/runtime.ts:40-51]). Root cause: [Unverified]. One candidate for "every call fails in one window" is process memory pressure, from in-process PGlite plus 64 MiB scrypt buffers ([Verified: lib/server/accounts/password.ts:52-56]). [Unverified]
- [Verified: lib/server/accounts/http.ts:143] Current logs record only the error name, so the failure has no diagnosis. Logging `stack` verbatim would log the message. For database errors that can include connection strings; the sentinel test uses one ([Verified: routes.test.ts:517]). Strip the header.
- Option A (accept after three clean runs): [Inference] If the failure rate were 2 in 5 (0.4), three clean runs in a row would occur by chance 21.6% of the time (0.6 cubed). At 0.1, 72.9%. Three clean runs is weak evidence.
- Observed rate source: [Verified: scrum/BACKLOG.md:119].

Strongest argument against B
- [Inference] It adds a logging surface, and stacks show internal paths. Limit the logging to name and code.

Cost: S. Reversal: S.
Confidence: 0.7.
What would change the position: a reproduction in which a valid password returns 500 (then fix the cause first, before any new logging).

---

## D-18 Earlier sessions on sign-in

**Recommended: B, and only together with D-12 option A.**

- [Verified: lib/server/accounts/service.ts:88-106] `issueSession` only inserts a row. [Verified: service.ts:177] Sign-in issues a session without touching existing rows.
- [Verified: app/api/auth/login/route.ts:29] The browser's cookie is replaced. The older row keeps `revoked_at IS NULL` and stays valid until expiry ([Verified: store.ts:133-135]). A copied older token keeps working. [Inference]
- [Verified: service.ts:180-186] and [Verified: app/api/auth/logout/route.ts:20] Logout revokes only the presented token.
- [Measured: rg] Only four auth routes exist: login, logout, register and session. There is no password change, reset or revoke-all. Lifetime is 30 days ([Verified: lib/server/accounts/session.ts:9]).
- The mechanism already exists: `revoked_at` ([Verified: store.ts:26]) and `revokeSession` ([Verified: store.ts:142-154]). Option B is one statement.
- [External: https://osv.dev/vulnerability/GHSA-x7rp-qj2h-ghgw] Third-party advisory describing other logins left alive after a password change. Cited as an example only.
- Coupling: B revokes sessions that clients still hold. Without D-12 option A, a revoked device silently falls back to its anonymous partition. [Inference]

Strongest argument against B
- [Inference] Multi-device sign-in is intended, so each new sign-in logs out the other devices.
- [Inference] A holder of the password can sign in, evict the owner, and keep their own session. B mainly helps when the owner's next sign-in evicts a stolen token.

Cost: S. Reversal: S.
Confidence: 0.55.
What would change the position: a firm product requirement for multi-device sign-in. Then option A plus a "sign out other sessions" action (cost M, next cycle).

---

## Cross-item couplings

- D-02 depends on D-03 and D-11: open registration makes "signed-in" a weak test.
- D-18 option B requires D-12 option A.
- D-09 protects the gate that D-02 spend depends on.
- D-16 and D-17 share one logging rule: no message text in logs without redaction.
- D-01 and D-06 (not mine): claim-on-sign-in would remove the anonymous-course loss in both.

## Open requests for the coordinator

1. Confirm whether this branch is deployed, and whether open.maic.chat runs it (D-03).
2. Product decision on share links for unpublished courses (D-01).
3. Platform check of the Docker origin (`http://0.0.0.0:3000`) against a running image (D-10). Not run here.
4. Confirm whether relative media URLs work in client and export code (D-10, option D).

---

## Summary table

| Item | Recommended option | Confidence | Cost | Single most important unknown |
|---|---|---|---|---|
| D-01 | B for documents; A for classrooms | 0.6 | S (documents) | Whether users depend on unpublished share links |
| D-02 | B (accounts only); S stop-gap if needed | 0.6 | L | Whether the shared access code is a bounded, trusted group |
| D-03 | C | 0.75 | S | Whether this branch is deployed and whether sign-up is expected to be open |
| D-05 (view) | A with security conditions | 0.6 | M | Whether usage data may be visible to non-admin users |
| D-09 | A plus boot warning and minimum length | 0.55 | S | Entropy of deployed access codes |
| D-10 | C (D as stronger alternative) | 0.7 | S | Whether deployments already configure a canonical public origin |
| D-11 | A (untrusted: per-username only) | 0.55 | S | Share of deployments behind a proxy that overwrites forwarded headers |
| D-12 | A (fail closed, clear cookie) | 0.75 | S server, M client | Whether any flow relies on anonymous fallback after sign-out |
| D-16 | A (managed-key errors carry no detail) | 0.7 | S | Whether any real provider echoes key fragments in error messages |
| D-17 | B (name and code only, no message) | 0.7 | S | Root cause of the intermittent 500s (memory pressure unverified) |
| D-18 | B, with D-12 option A | 0.55 | S | Whether multi-device sign-in is a firm requirement |
