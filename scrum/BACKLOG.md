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
| B8 | Medium | Deferred (cycle 6, D-29) | Render-job endpoints let any gated caller poll or cancel any job. Needs ownership once accounts are the norm. | Audit item 6 [Unverified upstream id scheme] |
| B9 | Medium | Open | Render service takes the leftmost `x-forwarded-for` entry, the same pattern fixed for the access-code route. | `app/api/export-video/render/route.ts` `clientIdentity` |
| B10 | Medium | Accepted | Throttles are per process; the access-code bucket is shared by all visitors unless `TRUST_PROXY_HEADERS=true`. A shared store would remove the per-instance budget. | `lib/server/accounts/login-throttle.ts`; README |
| B11 | Medium | Open | Per-client limit for registration and sign-in on top of the per-username throttle and the queue cap. | Review round |
| B12 | Low | Open | Session read failures reject with a plain error rather than an HTTP status, so `chat-storage.ts` classifies them as retryable. Carry the status and decide the policy. Also: an expired session leaves a cached `acct:` key that the server now refuses (401); the client needs to re-bootstrap or prompt for sign-in. | `lib/persistence/bootstrap.ts`; `lib/utils/chat-storage.ts` |
| B13 | Medium | Open | Native review of the eleven machine-drafted `account` translations. | `lib/i18n/locales/*.json` |
| B14 | Medium | Decision needed | Registration is open by default. Recommend closed for public deployments; product owner to choose and document. | `lib/server/accounts/runtime.ts` `registrationOpen` |
| B15 | Medium | Decision needed | Scrypt cost 2^16 versus OWASP's 2^17 recommendation. Depends on the container memory budget. | `lib/server/accounts/password.ts` |
| B16 | Medium | Open | No administrator role exists. The mission requires limited administrator privileges. Design: operator-listed account identifiers from the environment, server-side checks on every admin route, audit log. | `packages/@openmaic/storage/src/server/index.ts` (`authorizeAdmin`) |
| B17 | Medium | Open | Educational content review has not started (accuracy, objectives, examples, feedback). | Not started |
| B18 | Low-medium | Partly done (cycle 6, D-30, D-31) | Error responses return `details`, often upstream error text, to clients. Whether upstream bodies carry credentials is not established. | `lib/server/api-response.ts`; audit item 9 |
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
| 3 | 2026-10-11 | Team meeting 01: decide the open items and implement the decided changes | Decision record in `scrum/DECISIONS.md`; rebuttal round; 8 commits pushed; full run had one timing failure, fixed with an explicit limit |
| 4 | 2026-10-11 | Close the security gaps the cycle 3 rebuttals named; measure the throttle derivation cost; verify the content fixes; clean full run (A16) | B28, B31, B32, B33 (classroom), B38, B39 done; independent review round (15 findings, all triaged); presence probe window widened (B40 open); final run on the final tree: exit 0; 735 test files passed (9 skipped); 8,131 tests passed (79 skipped); 0 failures; type check, lint and format pass |
| 5 | 2026-10-11 | Presence lease for B40; administrator panel (B37); metadata body caps (B33 part 2); log hygiene and operator-key text (B43) | B40, B41, B42 done; B37 built; B33 part 2 (six handlers) done; B43 partly done (six routes and nine log sites fixed; B45, B46 open). Two independent reviews (`scrum/reviews/cycle5-review.md`). Full suite on the final tree: exit 0; 739 files passed, 9 skipped; 8,188 tests passed, 79 skipped; type check, ESLint and Prettier clean on changed files |
| 6 | 2026-10-12 | Visitor-facing upstream text (B18); log hygiene (B45, B46); unflushed-edit lease (B44); procedural-skill scope (B34); render-job decision (B8) | B18 fixed for the audit's 11 routes and persisted text (228d146); B44 dirty window (76ccf4e, 2828f55); B45 central redaction (2c138b8, 2791ba1); B46 lengths in logs (3e7788c); B34 skill (26c271d); B8 deferred (D-29). Full suite on the final tree: exit 0; 744 files passed, 9 skipped; 8,227 tests passed, 79 skipped; type check, ESLint, Prettier and i18n check pass |
| 7 | 2026-10-13 | Continue the backlog: test stability (B50), provider wording (B49), AliDocMind body echo (B48), 360 px check (B37) | B50 explicit limits on two failing cases; B49 `PROVIDER_FAILURE_TEXT` on three routes; B48 upstream body kept out of the stored reason; B37 measured at 360 px, Settings clips the Accounts list (B54). Full suite: 745 files passed, 9 skipped; 8,230 tests passed, 79 skipped; type check, ESLint on changed files, Prettier and i18n check pass. Uncommitted when this section was written |

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

## Cycle 4: security hardening and the open items from cycle 3

Sprint goal: close the security gaps the cycle-3 rebuttals named, measure the derivation cost that decides the throttle rule, and get a clean full run on the final state (A16).

### Items completed this cycle

| Item | What changed | Evidence |
|---|---|---|
| B28 | The sign-in throttle no longer evicts a live lock. When every tracked name is locked, a new name is refused before the password check, and the check path refuses it until a lock expires. | `lib/server/accounts/login-throttle.ts`, `service.ts`; `tests/accounts/login-throttle.test.ts`, `busy-refund.test.ts` |
| B31 | "Sign out other devices": `POST /api/auth/revoke-others` revokes every other live session of the account and keeps the caller's. Same-origin and session checks apply. A menu item in the account control; strings drafted in all twelve locales. | `app/api/auth/revoke-others/route.ts`, `lib/server/accounts/store.ts` (`revokeOtherSessions`), `components/account/account-control.tsx`; `tests/accounts/revoke-others.test.ts` (3 cases) |
| B32 | With the operator's key, the verify-model route sends fixed messages only, and the server log carries a name, code and frame, not the upstream text. A visitor's own key keeps its text. | `app/api/verify-model/route.ts`, `lib/server/resolve-model.ts` (`managedKey`), `lib/server/error-summary.ts`; `tests/api/verify-model-managed-errors.test.ts` (3 cases) |
| B33 (part) | A shared bounded JSON reader refuses a declared length above the cap before reading, and counts a chunked body. The classroom create route uses it with a 10 MiB cap, and it answers 400 for invalid JSON. | `lib/server/bounded-json.ts`, `app/api/classroom/route.ts`; `tests/server/bounded-json.test.ts`, `classroom-route.test.ts` |
| B38 | While the access prompt is up, the page behind it is `inert`, so keyboard and screen-reader users cannot reach controls it covers. | `components/access-code-guard.tsx` (`GatedContent`); `tests/components/gated-content.test.ts` |
| B39 | Measured: see the next section. | `scrum/cycle4-measurements.md` |

### Measurement (B39)

- [Measured: this host, 4 CPUs, measured while other agents ran on the same host] One scrypt derivation at the production cost (N=2^16, r=8, p=1): median 248 ms, minimum 222 ms, maximum 570 ms. Two concurrent derivations (the server's slot count): 7.6 derivations per second.
- [Inference] Counted failures can reach roughly 6,840 per 15-minute window on this host. Filling the table with live locks needs about 80,000 counted failures in one window (10,000 names, eight failures each). That is out of reach on this host. A faster production host would change this, so the refusal rule stays as defence in depth.
- [Unverified] Production hardware. The number above is one host and one measurement.

### Carried forward

- **B29** Relative persisted media URLs. Verification and specification: `scrum/specs/relative-media-urls.md` (see its recommendation). No change to stored URLs this cycle.
- **B33 (rest)** Thirty-one routes still read JSON without a size check. Ordered by how much state each writes: `app/api/stages/route.ts`, `app/api/stages/[id]/route.ts`, `app/api/folders/*`, `app/api/agent/sessions/*`, `app/api/chat/*`, `app/api/generate/*`, `app/api/generate-classroom/route.ts`, the `pbl/v2` routes, and the rest. The shared reader is ready for them.
- **B30** A required `ACCESS_COOKIE_SECRET` in a dated release. Needs the release date from the owner. [Opinion] Name the release in the changelog when the secret becomes required.
- **B34** Procedural-skill pages cannot be generated on the conversational path. Two options, each needs a product decision: add an outline tool to the conversational path, or state in the skill that these pages come from the classroom builder only.
- **B35** Content review: open internal defects fixed by the content reviewer this cycle are recorded in `scrum/reviews/content-phase1.md` under "Cycle 4 fixes". Factual claims remain open for subject-matter review.
- **B36** Template review: `scrum/reviews/templates-phase1.md` (mechanical checks only; no template was edited).
- **B37** Admin user interface for account actions: next.

### Review round and fixes (cycle 4)

An independent reviewer read the uncommitted change set and wrote `scrum/reviews/cycle4-review.md` (15 findings: 1 High, 2 Medium, 12 Low). Each one is triaged below.

| Finding | Severity | Outcome |
|---|---|---|
| F1 Operator-key upstream text also reached visitors through the chat, outline-stream and agent-profile routes | High | Fixed in all three routes. Visitors get fixed text; the server log keeps name, code and frame. Tests: `tests/server/error-summary.test.ts`, `tests/api/verify-model-managed-errors.test.ts` |
| F2 The victim scan stopped after 64 locked keys, refusing a name that an unlocked key further back would have admitted | Medium | Fixed: the scan covers the whole table and stops at the first unlocked key. Regression test: "admits a new name when an unlocked key sits behind 64 locked keys" |
| F3 The access-code route ignored a refused record and still compared the code | Medium | Fixed: a refused identity gets 429 before any comparison (`app/api/access-code/verify/route.ts`) |
| F4 The client budget charged after each attempt, so concurrent attempts overshot | Low | Fixed: slot reserved before the attempt, refunded on any outcome not counted. Regression test: 40 concurrent attempts, exactly 30 run |
| F5 A stale refusal flag made Retry-After a fixed 900 seconds | Low | Fixed: one predicate ("a name can be tracked now") drives both the check and the record; Retry-After is the time until the earliest lock lapses. Test: "gives Retry-After as the time until the earliest live lock lapses" |
| F6 Literal wording of the refusal rule | Low | Kept the behaviour (refuse only when the table is full and every key is locked); the file header now says so |
| F7 A second sign-out-other-devices request could be sent while one was in flight | Low | Fixed with an in-flight ref |
| F8 A future throw site could return upstream text through the resolver's message | Low | Accepted: every current throw site returns a local message. Recorded as hygiene; the fixed-text policy applies to the operator-key routes |
| F9 A visitor's model string could forge a log line | Low | Fixed: logged as a JSON string |
| F10 Upstream response text was logged in an excerpt | Low | Fixed: status, type and length only |
| F11 Proxy and target URLs were logged with userinfo and query | Low | Fixed: origin and path only |
| F12 A JSON `null` body to classroom create answered 500 | Low | Fixed: 400 |
| F13 A message line could in principle be taken as a stack frame | Low | Fixed: frames must match the four-space V8 indent |
| F14 The usage chart reuses an instance after its container unmounts | Low | Not fixed this cycle. Recorded as B41 |
| F15 Two throttle tests had been removed by mistake | Low | Restored, plus the new cases |

### Presence probe window (found by the final run)

- The full run failed one case in `tests/media/stage-realm-presence.test.ts` at 82 ms: a live peer was reported absent. Alone, the file passes.
- [Inference] The 60 ms probe window is shorter than a busy event loop can deliver a reply. The collector treats `absent` as exclusive (`lib/media/collect-stage-asset-refs.ts:286-292`), so a false `absent` can allow a global asset mutation while a peer is editing the same stage. That is a data-integrity risk, not only a test flake.
- Change made: the window is 250 ms, a four-fold margin. This reduces the risk; it does not remove it. The collector pays up to the window per probe, which is [Unverified] in size for large collections.
- **B40 (open, High):** replace the timed probe with a lease that peers renew, or with a per-run cached answer. Needs a design note and a test that holds the reply back.

### Items found this cycle, not yet scheduled

- **B41** Usage chart: the instance is reused after its container unmounts while data is empty (`components/settings/usage-dashboard.tsx:117-121, 230`, review F14). Fix: dispose the instance on container change.
- **B42** The deep-research skill states a session-wide limit of eight `web_search` calls (`skills/agent-runtime/deep-research/SKILL.md:46`). The tool keeps no counter (`lib/server/agent-runtime/web-search.ts`), so the limit exists only as text. Decide: enforce it in the tool, or state it as guidance.
- **B43** Log hygiene: the operator-key failure paths are covered. [Corrected in cycle 5, `scrum/DECISIONS-02.md` D-23: only four provider sites use `describeUnexpectedError`; the rest is B45.] Other error sites that log the full error object (for example `app/api/chat/route.ts` outer catch when the key is the visitor's) are acceptable by policy; confirm with the security reviewer.

### Content and specification outputs (cycle 4)

- B35: the content reviewer fixed one internal defect (E7, `skills/agent-runtime/fact-check/SKILL.md`: the search budget now refers to deep-research's limit). Fourteen defects stay open; three of them are internal but blocked on product decisions D-01, D-09 and D-18. The E7 limit is text only (see B42). Record: `scrum/reviews/content-phase1.md`, "Cycle 4 fixes".
- B36: the template review found 5 defects and 8 claims for review: `scrum/reviews/templates-phase1.md`. No template was edited.
- B29: the relative-URL specification recommends **NO-GO** until a browser check of the classroom page loaded from a relative reference passes. Two readers cannot be verified from this environment. Specification: `scrum/specs/relative-media-urls.md`.

### Process notes (retrospective, cycle 4)

- **What helped:** the reviewer checked every claim against the code and reported file and line for each. The review found the same leak class in three routes after the first route had been fixed, which a single-file search would have missed.
- **What hindered:** two load-sensitive timing failures appeared only in the full run (the voice-clip case and the presence probe). Both pass alone. The lesson: a fixed timing window in a safety decision needs a margin, and a test that depends on one needs a stated budget.
- **Change for the next cycle:** when fixing a leak class, search all sites of that class before the first commit. Re-run the full suite after every change that touches a shared module.

## Cycle 5: presence lease, administrator panel, body caps, and log hygiene

Full record: `scrum/DECISIONS-02.md`. Reviews: `scrum/reviews/cycle5-review.md`. Presence design: `scrum/specs/presence-lease.md`.

Sprint goal: close B40 (High); build the administrator panel (B37); extend the body caps (B33, part 2); settle the log-hygiene question (B43) and fix what the review required.

### Items completed this cycle

| Item | What changed | Commits | Evidence |
|---|---|---|---|
| B40 | Each realm with a stage open keeps a localStorage lease (renewed every 5 s, lapsing 90 s after the last renewal). A live lease answers present at once; the timed probe stays for tabs that predate leases. Ten review findings fixed, one rejected with reason | c2ff226, 6f791c0 | `lib/media/stage-realm-presence.ts`; `tests/media/stage-realm-presence.test.ts` (16) and `tests/media/prove-exclusive-ownership.test.ts` (7) pass |
| B41 | The usage chart disposes an instance whose container was removed, and creates a new one for the new container | 0d5be8e | `components/settings/usage-chart-instance.ts`; `tests/components/usage-chart-instance.test.ts` (5) |
| B42 | The eight-search limit is stated as guidance in the deep-research and fact-check skills; the tool does not count calls | c2fb062 | `skills/agent-runtime/deep-research/SKILL.md`; `skills/agent-runtime/fact-check/SKILL.md` |
| B33 (part 2) | Six folder and agent-session handlers read the body through `readBoundedJson` with a 1 MiB cap; an oversize body answers 413 | 3515545 | `tests/server/bounded-body-metadata-routes.test.ts` (30); the 12 oversize cases fail on the original handlers |
| B37 | Administrator account panel: the account list, and disable or enable behind a confirmation dialog. The session response carries `administrator`, so a non-administrator makes no list request | a91280b | `components/settings/account-admin-panel.tsx`; `tests/components/account-admin-panel.test.ts`; `tests/accounts/admin-routes.test.ts` and the account route tests (34 tests in four files) pass |
| B43 (part) | Six routes stop sending operator upstream text to visitors (chat stream, chat pi, image, video, verify image, verify video). Seven body-parse sites and the YAML loader log summaries only | this cycle's final commit | `tests/server/error-summary.test.ts`; `tests/api/verify-image-managed-text.test.ts`; 39 existing route and helper test files pass (543 tests) |

### Verification

- Full suite on the final tree: exit 0; 739 test files passed, 9 skipped; 8,188 tests passed, 79 skipped. [Measured: `npx vitest run`, this session.] Cycle 4 final state: 735 files and 8,131 tests.
- Type check: `npx tsc --noEmit`, 0 errors. [Measured]
- ESLint and Prettier: clean on every changed file. [Measured]
- `pnpm check:i18n-keys`: passes, 12 locale files. [Measured]
- Not verified: the administrator panel at 360 px in a browser `[Unverified]`; two real tabs for the presence lease `[Unverified]`; whether a real provider's error text echoes a key (B45) `[Unverified]`.

### Review round

- Presence lease: an independent read-only review found no High findings. Eleven findings were triaged: ten fixed, one rejected. The rejected one asked that a missing storage API read as `unknown`; it stays `absent`, because only Node reaches that case, and the change would have sent 34 test files down the fork path.
- Log hygiene: the review found that the cycle 4 claim ("operator-key failure paths are covered") was wrong, and that six routes sent operator upstream text to visitors. All six are fixed. The claim is corrected above.

### Backlog status after cycle 5

| Item | Status | Note |
|---|---|---|
| B33 | Part done | Six metadata handlers. The rest is B47 |
| B37 | Done | 360 px check open `[Unverified]` |
| B40 | Done | Residuals in the spec; follow-up B44 |
| B41, B42 | Done | B42 enforcement not decided |
| B43 | Partly done | Open: B45 and B46. Cycle 4 claim corrected |
| B44 | Open (new) | Flush pending saves before a frozen tab can be left with edits. The frozen-tab residual of B40. Medium |
| B45 | Open (new) | About 27 provider error logs log the raw error object. Whether upstream text can echo a key is `[Unverified]`. Includes `lib/orchestration/stateless-generate.ts:500`. Medium |
| B46 | Open (new) | Visitor content (prompts, model output) in info and warn logs. A privacy policy decision. Low-medium |
| B47 | Open (new) | Body caps for the stage, chat, generate, generate-classroom and pbl routes. Needs measured request sizes first. Medium |

Still open from earlier cycles: B29 (the relative-URL recommendation stays NO-GO until the browser check passes), B30, B34, B35, B36, B13, B17. These need a release date, a product decision, or subject-matter review.

### Process notes (retrospective, cycle 5)

- **What helped:** disjoint file ownership for the two workers, with the targeted suites re-run before each commit; read-only reviewers who gave file and line for each finding and checked the claims against the code, including one of the coordinator's own tests that passed on the previous code.
- **What hindered:** the session worker restarted mid-cycle, so the work resumed from the committed state; the workers ran for about ten minutes each, and the coordinator waited for the last reports for much longer; a variable set inside a backgrounded chain was not visible to the parent shell, so the first log path was wrong and had to be found through the process table.
- **Change for the next cycle:** record, in the commit message, what each check covered (targeted or full). When a backlog entry says "covered", name the sites that were checked, so the next review can test the claim.

## Cycle 6: visitor-facing upstream text, log hygiene, and the dirty window

Full record: `scrum/DECISIONS-03.md`. Review: `scrum/reviews/cycle6-review.md`.

Sprint goal: close the leak class the cycle 5 review left open (B18); finish log hygiene (B45, B46); close the frozen-tab residual of the lease (B44); settle the procedural-skill scope (B34) and the render-job ownership question (B8) with decisions.

### Items completed this cycle

| Item | What changed | Commits | Evidence |
|---|---|---|---|
| B18 | Under the operator's key, visitors get fixed text for 11 routes and for persisted text: PBL streams, agent session errors and assistant frames, classroom job errors, material extraction, transcription, parse-pdf, extract-document (multipart), verify-pdf-provider, generate/tts, generate/voice, web-search. The visitor's own key keeps their message | 228d146 | `tests/api/managed-key-upstream-text-routes.test.ts` (11), `tests/managed-key-pbl-sse.test.ts` (4), `tests/managed-key-persisted-text.test.ts` (8) |
| B44 | Unflushed edits keep the realm's lease live for 10 min after the last edit. The stage store marks the realm dirty and clean | 76ccf4e, 2828f55 | `tests/media/stage-realm-presence.test.ts` (22); `tests/store/stage-realm-dirty-marks.test.ts` (4) |
| B45 (part) | The logger redacts registered and environment secrets from every line. The provider file's secret fields and the visitor-key resolvers register values. The registry is in `lib/log-secrets.ts` | 2c138b8, 2791ba1 | `tests/server/log-redaction.test.ts` (6) |
| B46 | Logs carry lengths, counts and ids, not visitor text, generated titles, model output or query strings. URLs are logged as origin and path. Seventeen log calls in sixteen files | 3e7788c | 40 test files covering the changed modules (644 tests) |
| B34 | The vocational skill states the chat path's gate (task-engine mode) and names the page types the chat agent can use | 26c271d | `skills/agent-runtime/vocational/SKILL.md`; the gate is in `lib/server/agent-runtime/generation-tools.ts` |
| B8 | Decided: deferred to cycle 7 (D-29) | none | `scrum/DECISIONS-03.md` |

### Verification

- Full suite on the final tree: exit 0; 744 files passed, 9 skipped; 8,227 tests passed, 79 skipped. [Measured: `npx vitest run`, this session.] Cycle 5 final: 739 files and 8,188 tests.
- `npx tsc --noEmit`: 0 errors. ESLint and Prettier are clean on every changed file. `check:i18n-keys` passes. [Measured]
- Two regressions were found by the suite and fixed in this cycle. First, a test that replaces the logger lacked the new registry export, so two routes returned 500; the registry moved to its own module. Second, the dirty mark read the stage getter outside its `try`, so cue mode in the element-pick tests stopped; the read moved inside the `try`, with a regression case.
- Not verified: the adapter-level error text behind voice and extract-document `[Unverified]`; a live provider call, because this environment has no network access to providers `[Unverified]`; the 360 px admin panel `[Unverified]`; two real tabs for the lease `[Unverified]`.
- Two timing-sensitive tests failed once each under parallel load and passed alone: `tests/server/classroom-generation-retry.test.ts` (5 s timeout) and the local media real pipeline (4 s). Recorded as B50.

### Review round

- A read-only audit of every route for visitor-facing upstream text (77 route files) found 11 A rows. All are fixed. The B and C rows were assessed and left unchanged. Details: `scrum/reviews/cycle6-review.md`.
- The workers' proposal for the materials path (fixed text only for the document path) was changed by the coordinator. The ASR wrapper stored adapter text, which is the leak class, so the wrapper now keeps only our own messages (D-31).

### Backlog status after cycle 6

| Item | Status | Note |
|---|---|---|
| B8 | Deferred | D-29: needs a shared store, the external service's job-id scheme (`[Unverified]`), and a decision on signed-out submits |
| B18 | Partly done | The audit's rows are fixed. Behaviour note B49; adapter text B48 |
| B34 | Done | D-28. The premise was corrected: the gap is the widget gate, not a missing tool |
| B37 | Code done; 360 px check open | `[Unverified]` |
| B44 | Done | Residual beyond the 10 min window, in `scrum/specs/presence-lease.md` |
| B45 | Partly done | Central redaction. Raw error sites open as B52 |
| B46 | Done for the scanned sites | A regex scan, not a proof (D-27) |
| B47 | Open | Body caps for the stage, chat, generate, classroom and pbl routes; needs measured request sizes |
| B48 (new) | Open | An adapter-level `MaterialExtractionError` may carry vendor text `[Unverified]` |
| B49 (new) | Open, low | A non-Error throw under the visitor's key gets the "model provider" wording on non-model routes |
| B50 (new) | Open, low-medium | Timing-sensitive tests under parallel load (`classroom-generation-retry`, the local media pipeline), and the 250 ms presence probe window |
| B51 (new) | Open, low | Redaction matches names by suffix. A secret stored under another name is not redacted |
| B52 (new) | Open, medium | About fifty raw error objects are still logged in provider-touching files. Decide per site whether the message stays (upstream echo `[Unverified]`) |
| B53 (new) | Open, low | The agent entry tree stores raw frames. No route reads it today `[Inference]` |

Still open from earlier cycles: B29 (the NO-GO recommendation stands), B30, B13, B17, B35, B36, B1–B3, B26 (watch), B2.

### Process notes (retrospective, cycle 6)

- **What helped:** the read-only audit gave file and line for every row, so the fixes were mechanical. The coordinator's diff review caught two changes that were too broad before they were committed: the logger registry and the ASR wrapper. Bisecting with temporary worktrees found both regressions in minutes.
- **What hindered:** the workers stopped on a session rate limit and were resumed by message. A worker's proposal conflicted with two existing assertions, which needed a decision. A test's logger mock broke when a shared module gained a new export.
- **Change for the next cycle:** do not add a named export to a module that tests replace with a factory, and do not add work to a store's edit path that can throw outside a `try`. Run the full suite after any change to the store or the logger, not only the targeted suites.

## Cycle 7: the backlog continued (B50, B49, B48, B37)

Assignment: "Tiếp tục đi" (continue). It was read as the next cycle of this backlog [Inference]. The task table and handoff are in `HANDOFF.md`. Uncommitted when this section was written.

### Items completed this cycle

| Item | Status | Change | Evidence |
|---|---|---|---|
| B50 | Partly done | Explicit 30 s limits on the failing cases: the matrix `it` in `tests/lint-llm-entry-guard.test.ts` and the clear-migration case in `tests/runtime/database-chat-cutover.test.ts`. Precedent `ccaeb6c` | Full run 1 timed out two cases at 5 s (the guard's first case took 12.3 s under load). All four named files pass alone. Full run 2 passes |
| B49 | Done | `PROVIDER_FAILURE_TEXT` ("The provider could not complete this request.") replaces the model wording in `web-search`, `parse-pdf` and `verify-pdf-provider`. Speech and document routes keep the model wording, since their services are models | `tests/api/managed-key-upstream-text-routes.test.ts` (new non-Error case); the three route test files: 51 passed |
| B48 | Partly done | `lib/pdf/alidocmind-client.ts`: the upstream body is logged, not put in the thrown message. Path confirmed by reading the code: body → stored failure reason (`lib/server/material-extraction/runner.ts`) → agent tool output (`lib/server/agent-runtime/material-tools.ts`) | `tests/document/alidocmind-submit-error.test.ts`: 2 cases. The first fails on the previous client (checked by restoring it). Residual: short upstream status messages still reach the stored reason, and existing tests pin that. [Decision needed] whether material reasons are hidden on the operator's key |
| B37 | Checked: fails at 360 px | Sign-in dialog: 306 px wide, no internal overflow. Page: no horizontal scroll. Settings → System → Accounts: the two-column dialog clips the System pane, so the list's Disable and Enable actions cannot be reached at 360 px | Scratch Playwright run against the dev server with PostgreSQL 16 (script not committed). Screenshot reviewed. Opened B54 |

### Verification

- `npx tsc --noEmit`: exit 0.
- `pnpm test`: 745 files passed, 9 skipped; 8,230 tests passed, 79 skipped; exit 0.
- `pnpm check`, `pnpm check:i18n-keys`, ESLint on the changed `.ts` files: exit 0.
- Not verified: the B50 fix under repeated full-suite load. One green full run only [Inference].

### New backlog items from cycle 7

| ID | Priority | Status | Item | Evidence |
|---|---|---|---|---|
| B54 | Medium | Open | At 360 px the Settings dialog's fixed two-column layout clips the System pane, so the Accounts actions are unreachable. The home composer row also clips its last control ("Enter Classroom"). A fix needs a narrow-width layout (sidebar collapsed or stacked), with a test | Screenshots from the cycle's scratch run (not committed) |
| B55 | Low | Open `[Unverified]` | The dev server logs "Ecmascript file had an error" at `process.once('SIGTERM')` in `instrumentation.ts`; the page still returns 200. A signed-in home page showed "Persistence is unavailable" in the dev run. Neither cause was investigated | `scrum/` scratch logs only |

### Backlog status after cycle 7

| Item | Status | Note |
|---|---|---|
| B37 | Open | 360 px check done: the Settings dialog fails (B54) |
| B48 | Partly done | Body echo fixed. Short vendor status messages pass through (decision needed) |
| B49 | Done | |
| B50 | Partly done | Two failing cases fixed. The two named files passed in both runs. No repeated load runs |
| B54, B55 | Open | New this cycle |

Still open: B47 (needs measured request sizes; not started), B51, B52, B53, B8 (deferred, D-29), B29, B30, B13, B17, B35, B36, B1–B3, B26, B2.

### Process notes (retrospective, cycle 7)

- **What helped:** running each failing file alone separated load failures from logic failures in one command. Reading the code path for B48 showed the leak was real before any change.
- **What hindered:** `pkill -f "next dev"` matched the shell running it, and the command exited with 144. The account control did not render until the dev server had `NEXT_PUBLIC_PERSISTENCE=1`.
- **Change for the next cycle:** stop processes by PID taken from `ps`, not by `pkill -f` with a name that appears in the command line. Make no further 360 px claim until B54 is settled.
