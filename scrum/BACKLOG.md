# OpenMAIC improvement backlog

Owner: Scrum coordinator (autonomous cycles). Update at the end of every cycle.

Status vocabulary: **Done** (verified by tests or by running the app), **Open** (not started), **Decision needed** (a product call, not a code fix), **Accepted** (a documented trade-off), **Unverified** (an audit claim that has not been reproduced).

## Product goals (from the mission)

1. Username and password sign-in, with each account's data isolated and every sensitive operation authorized on the server.
2. Learner and administrator features that fit the existing architecture.
3. Repeated improvement cycles across UX, accessibility, performance, security, reliability, and lesson content.

## Baseline before cycle 1

- `pnpm test`: 702 test files and 7,896 tests passed, 9 files and 79 tests skipped, 0 failures (about four minutes).
- `npx tsc --noEmit`: 0 errors.
- Identity before this cycle: a shared `ACCESS_CODE` site password; an anonymous `anonymous_id` cookie that owned agent sessions, skills, materials, folders and documents; a client-supplied `x-learner-key` behind a public development bearer for runtime data. No username or password accounts. No administrator role (`authorizeAdmin` always returned false).

## Cycle 1: accounts foundation and access-gate hardening

### Acceptance criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| A1 | Register, sign in, and sign out with a username and password on the server | Done | `lib/server/accounts/*`, `app/api/auth/*`; `tests/accounts/*` |
| A2 | Passwords stored as salted scrypt hashes; no plaintext or hash returned or logged | Done | `password.ts`; `http.ts` logs error names only; error-text test in `service.test.ts` |
| A3 | Session token random (256 bits), stored only as SHA-256, HttpOnly, SameSite=Lax, Secure in production, revocable on sign-out, 30-day expiry | Done | `session.ts`, `store.ts`; store and route tests |
| A4 | Sign-in failures generic and timing-equalized; repeated failures throttled, including under concurrency | Done | `service.ts` (attempt counted before the first `await`; dummy hash); `service.test.ts` concurrency case |
| A5 | A live session decides the owner of documents, agent sessions, skills, folders, materials, runtime and whiteboard data; client identity headers ignored for signed-in requests | Done | `with-owner.ts`, `owner.ts`, persistence route, `chat/pi` routes, `workspace-actions.ts`; `tests/accounts/owner-isolation.test.ts` (12 cases) |
| A6 | Signed-out behaviour unchanged, except the deliberate hardening listed under "Behaviour changes" | Done | Owner-isolation cases for anonymous requests; full suite |
| A7 | Sign-in control works by keyboard and screen reader; all strings in 12 locales | Done (jsdom and a real browser); native translation review open | `components/account/*`; `pnpm check:i18n-keys` passes; browser check below |
| A8 | Phone and desktop layouts without horizontal overflow | Done | Chromium check (pre-installed binary) at 360x780 and 1280x800: no overflow, dialog fits, focus lands in the username field, Escape returns focus to the trigger |
| A9 | Publishing a course works for a signed-in owner and is refused to other accounts and to anonymous visitors | Done | `tests/accounts/publish-owner.test.ts` (4 cases). Before this cycle every owner was anonymous, so publish always returned 401 `login_required` |
| A10 | ACCESS_CODE cookies expire after seven days, not only when the code changes | Done | `lib/server/access-token-policy.ts`, `middleware.ts`, `access-token.ts`; `tests/server/access-token-freshness.test.ts` |
| A11 | Access-code guesses limited to ten per 15 minutes per client, including concurrent guesses | Done (with the shared-bucket trade-off, see B-list) | `app/api/access-code/verify/route.ts`; `tests/server/access-code-verify-throttle.test.ts` |
| A12 | `POST /api/classroom` cannot replace an existing classroom; non-string and over-long ids refused | Done | `persistClassroom(..., { createOnly: true })` with hard-link writes; `tests/server/classroom-create-only.test.ts`, `classroom-route.test.ts` |
| A13 | PBL runtime keyed by the configured identity when no store is injected | Done | `lib/pbl/v2/runtime/drain.ts`, `hydration.ts`; `tests/pbl/v2/learner-identity.test.ts`, which fails on the old behaviour (checked by mutation) |
| A14 | Operator documentation for the new settings and limits | Done | `.env.example`, `README.md` |
| A15 | Independent review of the change set; every Critical and High finding resolved or explicitly accepted | Done | Review round below |
| A16 | Full suite, type-check, lint and format pass on the final state | See "Verification" below | |

### Review round (independent, read-only, code-reading)

The reviewer found no Critical issues. Dispositions:

| Finding | Severity (reviewer) | Disposition |
|---------|---------------------|-------------|
| Concurrent access-code guesses passed the count before any failure was recorded | High | **Fixed**: attempt counted before the first `await`; test with 15 simultaneous guesses |
| Registration open by default, and a signed-in request skips the development token | Medium | **Decision needed**: kept open by default (documented, `ACCOUNT_REGISTRATION=closed` to close). Recommend closed for public deployments; product owner to choose |
| Scrypt queue unbounded; sign-in throttle only per username | Medium | **Fixed** for the queue: 64 waiting derivations, then 503 `ACCOUNTS_BUSY` with `Retry-After`; tested. Per-client limit **Open** |
| Shared access-code bucket allows a lockout of all visitors | Medium | **Accepted**: documented in README; same rule as the render service |
| Captured access cookie allows offline guessing of the access code (HMAC key is the code) | Medium | **Partly done** (cycle 2): opt-in `ACCESS_COOKIE_SECRET` signs cookies with a separate secret. The default is still code-keyed; the seven-day rule limits replay, not guessing. See B6 |
| Two session cookies with the same name: first one wins | Low | **Fixed**: duplicates are refused; tested |
| Access-code limit keyed by the first forwarded address, which a client can prepend | Low | **Fixed** for the access-code route (last entry, single trusted hop); the render service has the same pattern, see B9 |
| Expired sessions never pruned; no revocation of earlier sessions on sign-in | Low | **Fixed** for pruning (runs on sign-in). Revocation of earlier sessions **not done**: multiple devices per account is the intended behaviour |
| Cached rejected placeholder-hash promise never cleared | Low | **Fixed**: failure clears the cache |
| JSON `null` body crashed the access-code route with a TypeError | Low | **Fixed**; tested |
| Classroom id coerced from an array; no length cap; staging file left behind on write failure | Low | **Fixed**; tests added |
| Comment claimed a well-formed cookie is never read as anonymous | Low | **Fixed**: comment states that accounts-off ignores the cookie |
| Fixed classroom id in an e2e spec now collides on rerun | Behaviour change | **Fixed**: id unique per run |
| Retried `POST /api/classroom` with the same id now returns 409 | Behaviour change | **Accepted** and stated in the final report; no internal caller retries |
| Session read failures surface as plain errors, not HTTP statuses, so retry classification in `chat-storage.ts` differs | Low | **Open**, see B12 |
| Scrypt cost 2^16 is below the 2^17 that OWASP recommends for scrypt [Unverified recollection] | Low | **Decision needed**: raising to 2^17 doubles per-hash memory to 128 MiB. The hash format stores its cost, so the change needs no migration. Depends on container memory budget |

### Behaviour changes (intended; stated for operators)

- Signed-in requests ignore `x-learner-key` and the development token; anonymous requests still use both.
- Anonymous requests carrying an `acct:` learner key are refused (401). The key namespace is reserved for verified sessions.
- Access cookies older than seven days are refused.
- `POST /api/classroom` answers 409 when the id already exists.
- Persistence bootstrap reads `GET /api/auth/session` before the first request; a failed read rejects and is retried.

### Verification

- `pnpm test` on the cycle-2 state: 718 test files and 8,019 tests passed, 9 files and 79 tests skipped, 0 failures (baseline: 702 files and 7,896 tests). The cycle-1 review state passed 716 and 8,012. Duration about four minutes. Two earlier full runs in cycle 2 each failed one intermittent test; see B26 and B27.
- `npx tsc --noEmit`: 0 errors on the final state.
- `pnpm check:i18n-keys`: passes (12 locale files).
- ESLint on every changed TypeScript file: 0 errors. One existing `react-hooks/exhaustive-deps` warning in `app/page.tsx` (`loadClassrooms`) predates this change; the change does not touch that effect.
- Prettier `--check` on every changed file: passes.
- Browser check: Chromium (pre-installed) against the local dev server with the session route mocked; screenshots and metrics taken at 360x780 and 1280x800. The check did not exercise a real database, so the sign-in round trip against Postgres is **not** verified in a browser.
- Mutation check: the PBL identity test fails when the helper is reverted to the old behaviour.

### Known limitations accepted in this cycle

- Data created while signed out stays with the anonymous browser (B2).
- Document reads by stage id remain capability-based (B1).
- Login and access-code throttles are per process, and the access-code bucket is shared unless `TRUST_PROXY_HEADERS=true` (B10).
- Translations for the eleven non-English locales are machine-drafted and need native review (B13).

## Backlog (ranked)

| ID | Priority | Status | Item | Evidence |
|----|----------|--------|------|----------|
| B1 | High | Decision needed | Course and classroom reads are capability-based: any holder of an id reads the full document, published or not. Intended for shared links (21-character nanoid ids); conflicts with the isolation goal. Options: keep; owner-or-published reads; expiring share tokens. | `lib/persistence/document-access.ts`; `tests/persistence/stage-access-fidelity.test.ts` ("allows capability reads"); classroom `GET` |
| B2 | High | Open | Claim-on-sign-in: anonymous-owned rows (documents, agent sessions, skills, folders, materials) are not moved to the account. Needs a conflict rule and a migration design. | Cycle 1 limitation |
| B3 | High | Open | The public development bearer plus client `x-learner-key` still serve signed-out runtime requests. Production refuses them unless `PERSISTENCE_ALLOW_INSECURE_DEV_AUTH` is set. Retire once accounts are the expected path. | `lib/persistence/bootstrap.ts`; `lib/persistence/server-auth.ts` |
| B4 | High | Open | No mode refuses signed-out visitors. Leaving `PERSISTENCE_DEV_TOKEN` unset gives a sign-in-only deployment (signed-out persistence answers 503), but the browser's behaviour in that setup has not been checked in a real browser. | README; `handlePersistenceRequest` |
| B5 | Medium-high | Decision needed (verified by reading) | Any caller who names a server-configured provider spends that provider's server key; the route does not check the caller. `resolveSectionApiKey` returns the server key whenever the provider is configured (`lib/server/provider-config.ts:603-611`; `lib/server/resolve-model.ts:91-108`). If the deployment is open (no `ACCESS_CODE`) this is anonymous spend. Options: managed keys only for signed-in accounts when accounts are enabled; a per-account quota; or leave as a shared-key design the operator opts into. | Cycle 2 read |
| B6 | Medium | Partly done | The access-cookie HMAC key was the access code, so a captured cookie allowed offline guessing. **Done (opt-in):** `ACCESS_COOKIE_SECRET` (32 characters or more) signs cookies instead; tested end to end with the verify route and the middleware (`tests/server/access-cookie-secret.test.ts`). **Open:** the default is still code-keyed, and a per-process random secret would break multi-instance deployments, so the default needs an operator setting. | `lib/server/access-token-policy.ts` `accessSigningKey`; `middleware.ts`; `app/api/access-code/*` |
| B7 | Medium | Open | `x-forwarded-host` is trusted unconditionally when building classroom and scene media URLs. Fix: honour it only with `TRUST_PROXY_HEADERS=true`. | `lib/server/classroom-storage.ts` `buildRequestOrigin` |
| B8 | Medium | Open | Render-job endpoints let any gated caller poll or cancel any job. Needs ownership once accounts are the norm. | Audit item 6 [Unverified upstream id scheme] |
| B9 | Medium | Open | Render service takes the leftmost `x-forwarded-for` entry, the same pattern fixed for the access-code route. | `app/api/export-video/render/route.ts` `clientIdentity` |
| B10 | Medium | Accepted | Throttles are per process; the access-code bucket is shared by all visitors unless `TRUST_PROXY_HEADERS=true`. A shared store would remove the per-instance budget. | `lib/server/accounts/login-throttle.ts`; README |
| B11 | Medium | Open | Per-client limit for registration and sign-in on top of the per-username throttle and the queue cap. | Review round |
| B12 | Low | Open | Session read failures reject with a plain error rather than an HTTP status, so `chat-storage.ts` classifies them as retryable. Carry the status and decide the policy. Also: an expired session leaves a cached `acct:` key that the server now refuses (401); the client needs to re-bootstrap or prompt for sign-in. | `lib/persistence/bootstrap.ts`; `lib/utils/chat-storage.ts` |
| B13 | Medium | Open | Native review of the eleven machine-drafted `account` translations. | `lib/i18n/locales/*.json` |
| B14 | Medium | Decision needed | Registration is open by default. Recommend closed for public deployments; product owner to choose and document. | `lib/server/accounts/runtime.ts` `registrationOpen` |
| B15 | Medium | Decision needed | Scrypt cost 2^16 versus OWASP's 2^17 recommendation. Depends on the container memory budget. | `lib/server/accounts/password.ts` |
| B16 | Medium | Open | No administrator role exists. The mission requires limited administrator privileges. Design: operator-listed account identifiers from the environment, server-side checks on every admin route, audit log. | `packages/@openmaic/storage/src/server/index.ts` (`authorizeAdmin`) |
| B17 | Medium | Open | Educational content review has not started (accuracy, objectives, examples, feedback). | Not started |
| B18 | Low-medium | Unverified | Error responses return `details`, often upstream error text, to clients. Whether upstream bodies carry credentials is not established. | `lib/server/api-response.ts`; audit item 9 |
| B19 | Low-medium | Unverified | `proxy-media` fetches any public URL for any gated caller and buffers the body before the size check. DNS-rebinding resistance not established. | audit item 8; `app/api/proxy-media/route.ts` |
| B20 | Low | Unverified | Several routes lack an in-handler body-size cap (chat, generate-classroom, parse-pdf, transcription). Framework limits not established. | audit item 10 |
| B21 | Low | Open | `GET /api/usage` returns deployment-wide aggregates to any gated caller. | `app/api/usage/route.ts` |
| B22 | Low | Unverified | `fs.link` (classroom create-only) fails on filesystems without hard links; no fallback. Confirm on the deployment filesystems. | `lib/server/classroom-storage.ts` |
| B23 | Low | Unverified | `AccessCodeModal` may lack dialog semantics (focus management, `aria-modal`, Escape). Check in the accessibility cycle. | `components/access-code-modal.tsx` |
| B24 | Low | Open | Owner resolution duplicated in three places (`owner.ts`, `with-owner.ts`, `workspace-actions.ts`); now routed through one check but still two readers of the cookie. | Code |
| B25 | Low | Open | Test gap: no test runs the account flow against a real Postgres (tests use PGlite). | `tests/accounts/*` |
| B26 | Medium | Mitigated, not proven | Intermittent full-suite failure in `tests/accounts/routes.test.ts`: two of five full runs with cycle-2 code failed one account-route test (a 429 case, then a session case). In each, the route answered 500 with a plain `Error` for every query and derivation in that test window, so a database instance or a native call was failing for the whole window. The first hypothesis (scrypt allocation) is not supported: the second failure logged no busy warning. The file created about a dozen PGlite instances, so the file now shares one database and truncates tables between tests. One clean full run since. Open: keep watching full runs; if it recurs, capture the stack from the route. | cycle 2 full-run logs; `tests/accounts/routes.test.ts`; `lib/server/accounts/http.ts` |
| B27 | Low | Done (cycle 2) | Rename-rail test flaked under full-suite load: its first test included the cold import of the rail module against a five-second budget. The import now runs in `beforeAll` with a 60-second hook timeout. | `tests/workbench/workspace-rail-session-rename.test.ts` |

## Cycle log

| Cycle | Date | Goal | Outcome |
|-------|------|------|---------|
| 1 | 2026-10-11 | Accounts foundation; access-gate and classroom hardening; PBL identity | Core, integration, UI, and review fixes landed; see acceptance criteria and review round. Full-suite result recorded in Verification |
| 2 | 2026-10-11 | Access-cookie signing secret (opt-in); verify managed-key exposure | `ACCESS_COOKIE_SECRET` added with tests; managed-key exposure verified by reading and recorded as a decision (B5). Failed native scrypt calls now answer 503 `ACCOUNTS_BUSY` instead of 500. The rename-rail test's cold import moved to `beforeAll` (B27). One intermittent account-route failure seen in three full runs remains open (B26). Product decisions left for the owner: B1, B5, B14, B15 |

## Process notes (retrospective, cycle 1)

- **What helped:** reproducing audit claims by reading code before ranking them (three audit items were confirmed, and one, the publish route, was found to be a functional defect); parallel workstreams with strict file ownership; a separate test author who was forbidden to edit production code and so reported defects instead of working around them.
- **What hindered:** agents editing shared files caused transient failures in other suites (route mocks that lacked a schema call; a bootstrap test that now needs a `fetch` stub); a background wrapper reports "completed" when the wrapper exits, not when the work finishes; `pkill -f` matched the coordinating shell's own command line.
- **Change for the next cycle:** the coordinator runs the full suite after each integration step, not only at the end; any new module that is called from a shared provider must come with the test mocks that exercise that provider (checked in the same change); concurrency checks are written for every limiter, not only the first one found.
- **Still open:** the full suite takes about four minutes, so iteration uses targeted folders and the full run is kept for integration points.

## Cycle 3: team meeting 01 rulings

Full record: `scrum/DECISIONS.md`. Specs: `scrum/specs/`. Reviews: `scrum/reviews/`. Rebuttals: `scrum/meetings/*-rebuttal.md`.

### Backlog status after cycle 3

| Item | Decision | Status | Note |
|---|---|---|---|
| B1 | D-01 | Done (conditions) | 16-character client id floor; bearer-credential docs; comment fixed. Publish control next. |
| B2 | D-06 | Spec | `scrum/specs/claim-anonymous-data.md`; open: shared-browser consent |
| B5 | D-02 | Partial | Phase 1 warning done; phase 2 spec `scrum/specs/managed-keys.md` |
| B6 | D-09 | Done (warnings) | Required secret next, in a dated release |
| B7 | D-10 | Partial | `PUBLIC_APP_ORIGIN` done; relative stored URLs next |
| B9 | D-13 | Done | Last forwarded entry |
| B11 | D-11 | Done (most) | Eviction, refund, per-client budget; refusal rule next |
| B12 | D-12 | Done | Fail closed, client re-read, visible status |
| B13 | D-08 | Done | `en-US` fallback; release gate documented |
| B14 | D-03 | Done | Closed by default |
| B15 | D-04 | Done (bound) | Cost unchanged; burst measurement before any change |
| B16 | D-05 | Done (API) | Admin allowlist, audited disable and enable; no admin UI |
| B17 | D-07 | Partial | Phase 1 review of skill documents; template review next |
| B18 | D-16 | Partial | Classroom 500s; managed-key scope next |
| B21 | D-05 | Done | Usage admin-only; off without accounts |
| B22 | D-14 | Done | Startup probe, one log line, no lock-file fallback |
| B23 | D-15 | Done (a11y) | Full-page landmark next |
| B26 | D-17 | Partial | Diagnostics done (token-checked); root cause open |

### New backlog items from cycle 3

- **B28** Refuse untracked usernames while the sign-in throttle is saturated with live locks (security, D-11). Measure production derivation time first; saturation is out of reach at 180 ms per derivation `[Inference]`.
- **B29** Relative persisted media URLs when `PUBLIC_APP_ORIGIN` is unset or invalid (security, QA, devil's advocate; D-10). Verify the renderer and export first.
- **B30** Required `ACCESS_COOKIE_SECRET` in a dated release (security, D-09).
- **B31** "Sign out other sessions" for the account (security, D-18).
- **B32** Managed-key upstream error text stripped at `app/api/verify-model/route.ts` (security, QA, D-16).
- **B33** Body-size cap on POST routes that write files, starting with `app/api/classroom/route.ts` (security, devil's advocate risk 2).
- **B34** Procedural-skill pages cannot be generated on the conversational path: no outline tool there (content review, F-series). Needs a product decision.
- **B35** Content review, phase 1 open defects (15) and flagged claims (23): `scrum/reviews/content-phase1.md`. Subject-matter reviewers needed.
- **B36** Template mechanical pass and six learner-facing template files (QA, product; D-07 scope).
- **B37** Admin user interface for account actions (product dissent kept; API exists).
- **B38** Access gate: `<main>` landmark and inert background behind the prompt (UX, D-15).
- **B39** Derivation time measurement on production-class hardware (platform, D-04).

### Verification this cycle

- Type check: `tsc --noEmit` passes.
- Lint: ESLint passes on every changed code file.
- i18n parity: `scripts/check-i18n-keys.mjs` passes with the new keys.
- Targeted suites pass: throttle, busy refund, password and sync-error, registration, account routes, admin routes, diagnostics, session-ended, client budget, origin, config validation, classroom routes, hard links, render identity, learner key re-read, session-end watch.
- Full suite, final tree before the last test-timeout change: 729 of 739 files passed; 8,103 of 8,183 tests passed, 79 skipped.
  One case failed: a voice-clip case timed out under full-suite load (6.4 s against the 5 s default). It passes alone, and an explicit 30 s limit is now set.
  The full suite was not re-run after that limit was set; the file passes alone. [Measured: run output in this session]
