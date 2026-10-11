# Decision record: team meeting 01

Date: 2026-10-11. Branch: `claude/hopeful-sagan-267tw5`.
Inputs: `scrum/meetings/` (agenda; security, platform, product, UX, QA memos; devil's advocate critique; five rebuttals; content review; two specs).

## Process

1. The coordinator wrote a draft ruling on every item from the memos and the devil's advocate table. That draft was recorded before the rebuttal round.
2. Five role rebuttals then ran in parallel. Each one answered the devil's advocate for its own items. All five are written (`scrum/meetings/*-rebuttal.md`).
3. This revision records the rulings after the rebuttals. Where a rebuttal changed a position, the change is listed under the item, with the reason. Where the coordinator did not adopt a change, the dissent is recorded.
4. Status key: **Done** (code or docs, with tests in this cycle) · **Partial** (part done, remainder listed) · **Next** (decided, built next cycle) · **Spec** (written, not built) · **Open** (needs an answer the repository cannot give).

Facts that the coordinator checked directly are labelled `[Verified: file:line]` or `[Measured: how]`. Anything the repository cannot settle is `[Unverified]`.

## Rulings

### D-01 Reads of courses and classrooms by id: A, with conditions — **Done (conditions), Next (C)**
- Security moved from B to A for documents; product accepted A with an id floor and a threat model. Both are adopted.
- Done: a 16-character floor on client-chosen classroom ids at create time (`app/api/classroom/route.ts`, tests in `tests/server/classroom-route.test.ts`). Generated ids are unchanged. Existing short-id files remain readable.
- Done: the course page comment no longer says a course is "readable by anyone it was shared with" (`app/classroom/[id]/page.tsx`). The README documents that an id is a bearer credential and that a classroom cannot be revoked.
- Dissent kept: security and product want a publish control before any owner-only read (option C). Not built. A control built now would show a state that protects nothing: no read path checks the publish state (product rebuttal).
- Next: C, with a publish control, once learners' use of unpublished links is measured `[Unverified]`.

### D-02 Managed provider keys: B, phased — **Partial**
- Done (phase 1): a startup warning when a server LLM key is set and `ACCESS_CODE` is not (`lib/server/config-validation.ts`, tests in `tests/server/config-validation.test.ts`). The warning names providers, never key values.
- Spec (phase 2): `scrum/specs/managed-keys.md`, written by a specialist agent. Owner threading into background jobs, enforcement on every capability route.
- Open: the access-code-only case. Coordinator ruling: with no accounts, the access gate remains the only control, and the phase 1 warning tells the operator so. Whether any production deployment runs without `DATABASE_URL` is `[Unverified]`; the spec asks the same question.
- Security kept B for signed-in accounts with D-03 C, and a short stop-gap if B slips.

### D-03 Registration default: C — **Done**
- Registration is closed unless `ACCOUNT_REGISTRATION=open` (`lib/server/accounts/runtime.ts`, `tests/accounts/registration-policy.test.ts`, `tests/accounts/routes.test.ts`).
- The sign-in dialog shows the existing closed-state message when registration is closed (`components/account/account-dialog.tsx`, reusing `account.errors.registrationDisabled` in all twelve locales).
- README and `.env.example` document the first-account steps: set `open`, create the accounts, then set it back.
- UX, product, and security all moved to C in their rebuttals. Recorded.

### D-04 Password hashing cost: A, with the bound fixed — **Done (bound, sync-error path), Next (cost)**
- Platform moved from B to A in its rebuttal: 2^17 is deferred to the first deployment, and the queue cap stays at 64 (never 8).
- Done: the stored-hash parameter check uses the memory scrypt charges, `128·r·(N+2) + 128·p·r` (`lib/server/accounts/password.ts`). A hash at the byte-exact edge that scrypt refuses now parses as malformed (`tests/accounts/password.test.ts`).
- Amended: the draft asked for a typed parameter error. A synchronous throw from the native call already reaches the route as a plain error and becomes 500 with a logged name and code. A new class adds only log clarity, so it was not built. `tests/accounts/scrypt-sync-error.test.ts` pins the behaviour.
- Kept: N = 2^16. QA unchanged. The OWASP premise for 2^17 is `[Unverified]`: it rests on a search snippet, and the page was not opened.
- Next: any cost increase, after burst measurements and a rehash-on-sign-in path.

### D-05 Administrator role and usage: A, narrowed by product — **Done (usage, admin API), Next (admin UI)**
- Done: administrators are the usernames in `ADMIN_USERNAMES`. An empty list means nobody is an administrator (`lib/server/accounts/admin.ts`).
- Done: `GET /api/admin/accounts` (paged, audited, no password material), `POST /api/admin/accounts/{id}/disable` and `/enable` (one statement that changes the account, revokes its sessions when disabling, and writes an audit row; a reason of at most 200 characters; an administrator cannot disable themselves). Tests: `tests/accounts/admin-routes.test.ts`.
- Done: `GET /api/usage` is administrator-only when accounts are on, and off when accounts are off (product's change). The usage panel hides itself on 403.
- Dissent kept: product asked for no account-action API this cycle. Not adopted. A compromised credential needs a fast, audited disable, and the DB-only alternative is slower and unaudited. The API is three routes, tested end to end. Reversal path: remove the two POST routes.
- Dissent kept: security asked for an access-code-only mode with usage hidden. Done as product's version, which is stricter.
- Persistence `authorizeAdmin` stays `false`. The persistence library's admin operations are not part of this decision.

### D-06 Claiming anonymous data at sign-in: B — **Spec**
- Specification written: `scrum/specs/claim-anonymous-data.md`. Build next cycle.
- Open question from the spec: may one person's confirmation move another person's anonymous work on a shared browser? Not decided here. The spec requires per-person confirmation with a visible count and titles, which limits but does not answer the question.

### D-07 Educational content review: A, scope widened by QA and product — **Partial**
- Done (phase 1 of the skill documents): `scrum/reviews/content-phase1.md`, pinned to commit `491c409`. 21 defects found, 15 still open; 23 claims flagged for subject-matter review.
- Six edits in four skill files, each checked against the code before acceptance:
  - `fetch_url` origin rule (`lib/server/agent-runtime/fetch-url.ts`).
  - Removal of the outline-generator step from the conversational path, which has no outline tool (`course-tools.ts:240`).
  - `set_roster` before page generation.
  - Fact-check labels in the user's language, matching the reply-language rule (`course-tools.ts:273`).
  - Vocational required outline fields aligned with the widget type. No runtime effect today, because no production path applies that list.
- Found and not fixed: procedural-skill pages cannot be generated on the conversational path, because there is no outline tool there. Recorded for the backlog.
- Scope added by QA (template mechanical pass) and product (six learner-facing template files, `packages/@openmaic/generation/templates/`). Next cycle.
- Open: the sample generation test needs model access this environment does not have.

### D-08 Translation drafts: A with a release gate — **Done**
- The fallback language is `en-US` (`lib/i18n/config.ts`). It changes nothing shipped, since parity holds.
- The release gate is recorded in `lib/i18n/TRANSLATION_GUIDE.md`: `accessCode.*` first, then `account.*`.
- The CI parity check (`scripts/check-i18n-keys.mjs`) passes with the new keys.

### D-09 Access cookie signing: A, warnings only — **Done**
- Startup warnings: `ACCESS_CODE` without `ACCESS_COOKIE_SECRET`, and an access code shorter than 12 characters (`lib/server/config-validation.ts`). The warning never echoes the code.
- Dissent kept: the devil's advocate asked for a startup error below 12 characters. Not adopted: refusing to boot would stop existing deployments that predate this branch. The offline-guessing risk is `[Inference]` real for a short code without the secret, and the warning says so.
- Next (security's dated step): a required secret in a dated release.

### D-10 Trust in forwarded host: C — **Done (configured origin), Next (relative URLs)**
- Done: `PUBLIC_APP_ORIGIN` (an origin with no path) is authoritative when set. Forwarded headers are then ignored. A set but invalid value also ignores them and falls back to this server's own origin. Both `buildRequestOrigin` and the media origin helper use one rule (`lib/server/public-origin.ts`, tests in `tests/server/public-origin.test.ts`).
- Done: production warns when it is unset, and warns on an invalid value (`lib/server/config-validation.ts`).
- Next: relative persisted media URLs when unset or invalid (security and QA both now ask for this). The renderer and export behaviour with relative URLs is `[Unverified]`, so it waits for that check.
- Dissent kept: the devil's advocate asked for relative URLs now. Not adopted for the same reason.

### D-11 Per-client throttles: A, with the eviction and refund changes — **Done (most), Next (refusal rule)**
- Done: eviction order in the username throttle (`lib/server/accounts/login-throttle.ts`). Expired keys go first. Then the oldest unlocked key. A locked key is evicted only when every tracked key is locked.
- Done: a refund for attempts refused by the busy password queue. The failure is recorded before derivation and taken back if the queue refuses the attempt (`lib/server/accounts/service.ts`, `tests/accounts/busy-refund.test.ts`). The cost of filling the table is therefore paid in password derivations, not in cheap requests.
- Done: a per-client budget of 30 counted failures per 15 minutes when `TRUST_PROXY_HEADERS=true`. Only failures are charged. The last forwarded entry is the key (`lib/server/accounts/client-budget.ts`, tests in `tests/accounts/client-budget.test.ts` and `tests/accounts/routes.test.ts`).
- Amended: registration is charged for `USERNAME_TAKEN` only, not for every attempt. Charging every attempt would throttle a class signing up from one network. There is no shared registration bucket when untrusted: that would throttle a whole class too.
- Access gate: the shared bucket stays when untrusted, as decided. Security measured that one attacker can keep it locked; the README states the trade-off and the advice to set `TRUST_PROXY_HEADERS=true` behind a proxy.
- Open, security's point: a live lock should never be evicted, and an untracked name should be refused while the table is saturated. QA withdrew its refuse rule and accepted the eviction. Coordinator ruling: keep the eviction, and schedule the refusal rule for next cycle. Reason, labelled `[Inference]` from one measurement: a saturated table needs about 80,000 counted failures inside one window. At the measured 180 ms per derivation with two slots, that is about 10,000 failures per window, so saturation is out of reach on that hardware. A faster host changes this. Next cycle: measure derivation time on production hardware, and implement the refusal if saturation becomes reachable.

### D-12 Behaviour when a session expires: A, fail closed, with a visible status — **Done**
- Server: a well-formed session cookie that no longer resolves to a live account, while accounts are on, gets `401 SESSION_ENDED` with the cookie cleared (`lib/server/agent-runtime/with-owner.ts`). Applied in the owner wrapper and the three streams that resolve the owner directly (freshness, owner events, session events). Malformed, duplicated, and absent cookies stay anonymous. `GET /api/auth/session` is unchanged.
- Client: the learner key is re-read when the window regains focus, and after five minutes (`lib/persistence/bootstrap.ts`, tests in `tests/persistence/learner-key-recheck.test.ts`).
- Client, visible: a wrapper around fetch dispatches `openmaic:session-ended` on a `SESSION_ENDED` answer from this origin's API (`lib/persistence/session-end.ts`, tests in `tests/persistence/session-end-watch.test.ts`). The account control switches to the signed-out state and shows a toast (`components/account/account-control.tsx`, new key `account.errors.sessionEnded` in all twelve locales as drafts).
- Changed by UX: re-checking alone was not enough, so the visible status is part of this cycle. Adopted.
- Changed by security: one assertion rule for the cookie and the account key. The persistence route already refuses `acct:` learner keys on the development-token path (`lib/persistence/server-auth.ts`). Consistent.
- Amended: the draft's sign-in prompt copy is the toast text above, not a dialog.

### D-13 Render service client identity: A — **Done**
- The last forwarded entry, behind `TRUST_PROXY_HEADERS` (`app/api/export-video/render/route.ts`, tests in `tests/server/render-client-identity.test.ts`).

### D-14 Create-only writes without hard links: B, with a probe and a log — **Done**
- A startup probe creates and links two files in the classroom directory and warns when linking is refused (`checkClassroomStorage`, `probeHardLinkSupport`). It runs without being awaited, so startup never blocks on I/O (`instrumentation.ts`).
- When a link is refused with EPERM or ENOTSUP, `writeJsonFileCreateOnly` logs one actionable line per process. The response stays 500 (`lib/server/classroom-storage.ts`, tests in `tests/server/classroom-hard-links.test.ts`).
- QA changed to this option, with the exclusive-create fallback rejected for the partial-file reason. Security agreed.
- Deferred: a lock-file fallback (the devil's advocate's condition). Not built, because no target deployment has shown a refused link.

### D-15 Access-code prompt: A, as a page — **Done (accessibility), Next (full page semantics)**
- Done: a programmatic label for the input, `aria-invalid` and `aria-describedby` on error, an always-mounted alert region, focus returned to the input after a failed attempt once the input is enabled again, and a distinct message for rate limiting (HTTP 429). New key `accessCode.rateLimited` in all twelve locales as drafts (`components/access-code-modal.tsx`).
- The prompt is a full-screen overlay with no dialog role and no Escape dismissal, as UX asked.
- Next: `<main>` landmark and inert background, which needs an app-shell change.

### D-16 Error details sent to clients: A, narrowed — **Partial**
- Done: both classroom 500 paths (create and read) send no detail. Both carry filesystem text with absolute paths (`app/api/classroom/route.ts`, tests in `tests/server/classroom-route.test.ts`). The read path was not in the draft's scope; it has the same leak, so it is included.
- Next: upstream text is removed only where a managed key was used (`app/api/verify-model/route.ts`, `lib/server/provider-config.ts:603-611`). BYOK users keep their own diagnostics, since that text is their own key's error. Security and QA both asked for this scope. Deferred to next cycle with an owner.

### D-17 Intermittent account-route failure: B, with the QA form — **Done (diagnostic), open (root cause)**
- Done: unexpected account-route errors log the name, the string code, and the first stack frame read after the stack's header. The message is never logged (`lib/server/accounts/http.ts`, tests in `tests/accounts/route-diagnostics.test.ts`).
- Done (QA's change): the name and the code must match a plain token pattern, otherwise they are logged as `unknown` or `none`.
- Open: the root cause of the intermittent 500s is not established. Logging does not establish it (security, and the diagnostic is labelled as such).
- Close after 14 clean full runs, or on recurrence with the diagnostic.

### D-18 Earlier sessions on sign-in: A — **Done (keep), Next (sign out other sessions)**
- Security moved from B to A. Its reasons: revoking at sign-in signs out a teacher's other device at routine use, and the real gap is that the user has no remedy.
- Next: a user-initiated "sign out other sessions" action.
- Open: whether product requires one session per account. If it does, B is needed, and D-12 already covers the silent fallback.

## Items that changed status since the draft

| Draft | Now | Why |
|---|---|---|
| D-03 option C | Done | Rebuttals agree |
| D-12 re-check only | Done, with the visible status | UX rebuttal |
| D-14 probe | Done, probe and log, warning only | QA rebuttal |
| D-11 refuse-when-full (QA) | Withdrawn; eviction kept, refusal scheduled | QA rebuttal, measured arithmetic |
| D-05 account actions | Kept, dissent recorded | Product dissent, reasons above |
| D-05 usage in gate-only mode | Off | Product rebuttal |
| D-01 id floor | Done (16 characters) | Product and security rebuttals |
| D-10 relative URLs | Next | Needs renderer check |

## Open questions (none answered by the repository)

1. Does any production deployment set `NEXT_PUBLIC_PERSISTENCE`? `[Unverified]`. `.env.example` ships it commented out.
2. Does the scene renderer use stored media `src` as-is? `[Unverified]`. It decides D-10's relative URLs.
3. Which verify routes use the server key when the client sends none (`lib/server/provider-config.ts:852-854`)? `[Unverified]`.
4. Does any production deployment run without `DATABASE_URL`? `[Unverified]`. It decides how managed keys behave in access-code-only mode.
5. Does product require one session per account? Decides whether D-18 needs B.
6. May one person's confirmation move another person's anonymous work on a shared browser? Decides D-06's claim flow.
7. Production derivation time for the password hash. Decides whether saturation is reachable (D-11).
8. Are learners opening links to unpublished courses today? `[Unverified]`. Decides D-01's C.
9. How many classroom files with ids shorter than 16 characters already exist? `[Unverified]`.

## Dissent summary

- **Product:** no account-action API this cycle (not adopted; reasons above); D-03 option B (not adopted; moved to C in rebuttal); usage visible in every mode (adopted only in its stricter form).
- **Security:** D-11 refusal rule (scheduled, with the arithmetic stated); D-10 relative URLs when unset (scheduled); D-09 required secret (scheduled).
- **Devil's advocate:** D-09 startup error below 12 characters (not adopted, compatibility); D-10 relative URLs now (scheduled); D-14 lock-file fallback (not built).
- **QA:** D-14 exclusive-create fallback (not adopted).
- **UX:** D-15 dialog semantics (page semantics adopted; the full landmark is next cycle).
