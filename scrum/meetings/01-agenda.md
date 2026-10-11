# Team meeting 01: decisions on open items

Date: 2026-10-11. Branch: `claude/hopeful-sagan-267tw5`. Facts are from `scrum/BACKLOG.md`.
The coordinator makes the final call and records it in `scrum/DECISIONS.md`.

## Roles

- **Security lead (S):** threat model, authorization, secrets, abuse controls.
- **Platform lead (P):** runtime cost, data model, migrations, reliability, operations.
- **Product and pedagogy lead (PD):** learner and administrator needs, educational content quality.
- **UX and accessibility lead (UX):** user flows, error states, screen reader and keyboard support, translations.
- **QA and reliability lead (Q):** test strategy, verification of claims, flaky tests.
- **Devil's advocate (DA):** attacks every proposal, including the one it finds most attractive. Checks claims against code.

## Decision criteria (apply to every item)

1. Harm to users or data if the decision is wrong (security and privacy weigh most).
2. Reversibility, and the cost of reversing it.
3. Size of the change. Prefer small, verifiable, reversible changes.
4. Compatibility with existing deployments. Accounts are new on this branch; the access gate and anonymous mode are not.
5. Strength of evidence. Label every claim: `[Verified: file:line]`, `[Measured: how]`, `[Inference]`, or `[Unverified]`.

## Rules of the meeting

- Each role writes one memo: `scrum/meetings/<role>.md`. Read-only otherwise. Do not edit production code.
- Each memo gives, per item: the recommended option, the evidence, the strongest argument against it, the cost (S, M, or L), the reversal path, confidence (0 to 1), and what would change the position.
- The devil's advocate reads every memo and writes `scrum/meetings/devils-advocate.md`. It must find at least one objection per recommendation and state what it would take to accept each recommendation.
- Roles respond to objections in `scrum/meetings/<role>-rebuttal.md`. A role may change its position; it must say why.
- No consensus for its own sake. A recorded dissent is acceptable.

## Items

### D-01 Reads of courses and classrooms by id (backlog B1)

Anyone holding a 21-character course id can read the full course, published or not. Writes and deletes are owner-only.
- A. Keep capability reads (current design). Document it.
- B. Owner-or-published reads.
- C. Owner-only reads, plus expiring share tokens for sharing.
Facts to check: `lib/persistence/document-access.ts:70-74`, `lib/utils/stage-storage.ts:1273` (nanoid), classroom `GET` in `app/api/classroom/route.ts`, `lib/classroom/load-classroom.ts:261`.

### D-02 Managed provider keys (B5)

Any caller who names a configured provider spends that provider's server key. Verified by reading `lib/server/provider-config.ts:603-611` and `lib/server/resolve-model.ts:91-108`.
- A. Keep the shared-key design. Warn at startup when managed providers exist and `ACCESS_CODE` is unset. Document.
- B. Managed keys only for signed-in accounts when accounts are enabled.
- C. Per-account quota.
Constraint to check: background jobs (classroom generation, agent runtime) call model resolution without a request. Find out whether they carry an owner identity.

### D-03 Registration default (B14)

Currently open unless `ACCOUNT_REGISTRATION=closed` (`lib/server/accounts/runtime.ts`).
- A. Keep open by default.
- B. Closed by default, except open when `ACCESS_CODE` is set, or when `ACCOUNT_REGISTRATION=open` is set.
- C. Closed by default always.
Accounts were introduced on this branch and have no deployed users yet. Check whether that is true.

### D-04 Password hashing cost (B15)

Current: scrypt N=2^16, r=8, p=1, 64 MiB per hash, two concurrent derivations (`lib/server/accounts/password.ts`). Measured here: about 200-470 ms per hash at 2^16, and 400-950 ms at 2^17 (128 MiB).
- A. Keep 2^16. Revisit with production measurements.
- B. Raise to 2^17 with one concurrent derivation and a smaller queue cap.
- C. Raise to 2^17 and keep two concurrent derivations (peak 256 MiB per process).
The stored format carries its own cost, so an upgrade needs no migration. Check the bounds in `password.ts`.

### D-05 Administrator role (B16) and usage endpoint (B21)

No administrator role exists. `authorizeAdmin` always returns false. `GET /api/usage` returns deployment-wide aggregates to any caller who passes the gate (`app/api/usage/route.ts:71-76`).
- A. Operator-listed usernames in an environment variable. Admin API: list accounts, disable or enable an account (the `disabled_at` column already blocks sign-in and sessions). Usage endpoint admin-only when accounts are enabled. No admin UI this cycle.
- B. A database role column, set by a command-line tool.
- C. Defer.
Check who consumes `/api/usage` before choosing the usage rule.

### D-06 Claiming anonymous data at sign-in (B2)

Courses and other records created while signed out stay with the browser. They are not moved when the user signs in, so the user loses sight of them.
- A. Implement now: a claim action for documents, folders, agent sessions, skills, and materials, run in one transaction, with an explicit prompt in the UI.
- B. Write a specification now and implement next cycle.
- C. Document the limitation and do nothing.
Concerns to weigh: a browser shared by two people, and runtime data keyed by device identity.

### D-07 Educational content review (B17)

Nothing has been reviewed yet.
- A. Phase 1: the built-in agent skill documents under `skills/agent-runtime/`, read-only. Fix only defects that are internally verifiable (contradictions, broken references). Flag factual claims that need subject-matter verification.
- B. Phase 1 covers lesson content and generation templates (`packages/@openmaic/generation/templates/`, `lib/prompts/templates/`).
- C. Defer.

### D-08 Translation drafts (B13)

The eleven non-English `account` blocks are machine drafts. `scripts/check-i18n-keys.mjs` requires key parity.
- A. Keep the drafts, flag them for native review before release.
- B. Fall back to English until reviewed. This needs an exception to the parity check.
- C. Hide the account control in non-English locales.
Check the i18n fallback configuration under `lib/i18n/`.

### D-09 Default signing for access cookies (B6)

`ACCESS_COOKIE_SECRET` is opt-in. The default signs with the access code.
- A. Keep opt-in. Warn at startup when `ACCESS_CODE` is set and the secret is not.
- B. Require the secret in production.
- C. Persist a random secret in the database.
Changing the secret signs everyone out. `instrumentation.ts` may be the place for a startup warning; check it.

### D-10 Trust in `x-forwarded-host` (B7)

`buildRequestOrigin` trusts `x-forwarded-host` unconditionally (`lib/server/classroom-storage.ts`). Share links and generated media URLs use it.
- A. Trust it only when `TRUST_PROXY_HEADERS=true`. Warn when the header is present but untrusted.
- B. Keep trusting it. Document.
- C. Allowlist of public origins from an environment variable.
Check which URLs are stored and which are only returned. Check whether any deployment documentation relies on the header.

### D-11 Per-client throttles for sign-in and registration (B11)

Today there is a per-username throttle only (`lib/server/accounts/login-throttle.ts`).
- A. Add a per-client limit, keyed by the last forwarded address, only when `TRUST_PROXY_HEADERS=true`. Untrusted deployments keep the per-username limit.
- B. Status quo.
- C. Shared throttle store in the database.
Note the trade-off: an untrusted shared per-client bucket would lock out every user.

### D-12 Behaviour when a session expires (B12)

Expiry of the account session is not handled. The client keeps its cached account key. Requests may then silently use the anonymous owner for documents.
- A. Server fails closed: a request that carries an account key without a live session gets 401 `SESSION_EXPIRED`. Client prompt next cycle.
- B. Reload the page on expiry.
- C. Status quo.
Check the claim above before deciding. Trace the path through `lib/persistence/server-auth.ts`, `handlePersistenceRequest`, and `lib/persistence/bootstrap.ts`.

### D-13 Render service client identity (B9)

`app/api/export-video/render/route.ts` takes the first forwarded address. The access route takes the last.
- A. Use the last entry, as the access route does.
- B. Keep.

### D-14 Create-only writes where hard links are unsupported (B22)

`writeJsonFileCreateOnly` fails when `fs.link` is unsupported.
- A. Fall back to exclusive create (`wx`) when the link fails with EPERM, ENOTSUP, or EXDEV.
- B. Keep.

### D-15 Dialog semantics for the access-code prompt (B23)

- A. Adopt the accessible pattern of `components/account/account-dialog.tsx` (role, aria-modal, labels, alert role for errors, focus return).
- B. Defer.

### D-16 Error details sent to clients (B18)

`apiError` sends `details` to clients. Whether upstream bodies carry credentials is unverified.
- A. Omit upstream detail in production responses. Keep it in logs, without credentials.
- B. Keep.
Verify before deciding.

### D-17 Intermittent account-route failure (B26)

One test failed in two of five full runs. Each time, all database and scrypt calls in that test failed. A shared database now runs in that file. One clean run since.
- A. Accept the mitigation and close after three consecutive clean full runs.
- B. Add diagnostics that log error codes and stacks (no messages) on route failures, kept permanently.
- C. Remove PGlite from the account route tests and use a fake pool.

### D-18 Earlier sessions on sign-in

Signing in does not revoke other sessions.
- A. Keep. Multiple devices per account is intended.
- B. Revoke earlier sessions on sign-in.

## Output required

Each memo must end with a table: item, recommended option, confidence, cost, and the single most important unknown.
