# Platform lead rebuttal: meeting 01

Role: Platform lead (P). Date: 2026-10-11. Answers `scrum/meetings/devils-advocate.md`. Baseline: HEAD `8b1bfb8`. Verdicts: Accept, Reject or Modify.

[Partly unverified] Items labeled [Unverified] or [Inference] are not confirmed. The OWASP premise was not opened in this round (external; section 2).

## 0. Method, state, corrections

- Labels: each `path:line` citation is [Verified: path:line], read, grepped or `git show`n this round. Numbers from this round's scripts are [Measured: how], described in sections 1 and 0. [Inference] and [Unverified] are as marked.
- Only this file was written. No test suite run. Git used read-only (status, diff, show). Benchmarks ran as inline `node -` scripts with no files written. [Measured: Node 22.22.0, 4 vCPU; load average 0.2 to 1.9 during runs.]
- The working tree (WT) changed during this round: 48 changed or new paths at 05:25 UTC, including an admin module, a client budget, diagnostics and a boot probe. Citations are HEAD unless marked WT. WT line numbers are a snapshot and may move. Paths under `lib/server/accounts/` are shortened to the file name.
- Two throttle and password files use parameter properties, which built-in type stripping rejects. I transcribed their logic line for line. Each result says so.
- Corrections to my memo (`scrum/meetings/platform.md`):
  1. D-04: the stored-hash guard is WT `password.ts:155` (memory formula). My memo quoted HEAD:152.
  2. D-14: a boot probe and a once-per-process log already exist in WT. My memo proposed them as new.
  3. D-13: my snippet dropped the `TRUST_PROXY_HEADERS` gate.
  4. D-17: my `slice(1,6)` snippet leaks multi-line messages (1.4).
  5. D-04: my "worst wait 3.9 s" counted admitted requests and omitted the 503s.
  6. D-11: my memo proposed a per-client limit as new. WT now has one (`client-budget.ts`).
  7. D-05: my memo said no admin path exists. WT now adds one (`admin.ts`). The usage route is still ungated (`app/api/usage/route.ts:71`).

## 1. Measurements (this round)

**1.1 Sign-in burst admission.** [Measured: node `-` script, real scrypt calls; queue logic transcribed from `password.ts:79-93`]

| Config | 30 at once: admitted / 503 / last done | 30 over 4 s: admitted / 503 | 100 at once: admitted / 503 |
|---|---|---|---|
| Today: 2^16, 2 concurrent, queue 64 | 30 / 0 / 3.4 s | not run | 66 / 34 / 7.4 s |
| Memo B: 2^17, 1 concurrent, queue 8 | 9 / 21 / 4.0 s | 17 / 13 / 7.9 s | not run |
| C: 2^17, 2 concurrent, queue 64 | 30 / 0 / 7.2 s | not run | not run |
| B-queue64: 2^17, 1 concurrent, queue 64 | 30 / 0 / 13.4 s | not run | not run |

Single derivation median, 5 runs: 213 ms at 2^16, 434 ms at 2^17. At 128 MiB, 2^17 throws `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, so the 2^17 rows use 136 MiB.

**1.2 Parse guard against scrypt.** [Measured: `scrypt` option check over 36 cases, N 2^14 to 2^18, r in {1, 8, 16}, p in {1, 2, 4}; maxmem 128 MiB]
- HEAD guard `128*n*r` (HEAD:152): 15 mismatches. Six are memory cases (2^16 r=16; 2^17 r=8). Nine have r=1 and N >= 2^16.
- WT guard `128*r*(n+2)+128*r*p` (`password.ts:155`, WT): 9 mismatches, all r=1 and N >= 2^16.
- Scrypt also needs N < 2^(16·r): r=1 accepts 2^15 and rejects 2^16; r=2 accepts 2^16 and 2^17. [Unverified] The RFC 7914 bound is recalled as N < 2^(128r/8).

**1.3 Per-username eviction.** maxKeys 10,000; maxFailures 8. [Measured: line-for-line transcription of HEAD `login-throttle.ts` and WT `login-throttle.ts`, fake clock]

| Logic | Victim lock survives 10,000 distinct names | Failures recorded |
|---|---|---|
| HEAD, lock-blind, oldest first (HEAD:50-54) | no | 10,009 |
| WT, same flood | yes | 10,009 |
| WT, 63 locked decoys, then 9,936 names | no | 10,449 |

WT tests use tables of 2 to 3 keys (`tests/accounts/login-throttle.test.ts:72-107`), so the 64-key scan limit (`login-throttle.ts:33`, `:110`) is untested.

**1.4 Stack leak.** [Measured: error stacks built with a newline, a fake frame and a secret in the message, four variants]
- Memo `slice(1,6)`: leaks the secret and the fake frame.
- Frame filter alone: leaks the fake frame.
- Replace the message first, then filter frames: no leak.
- WT `describeUnexpectedError` (`http.ts:132-147`): no leak in four cases (multi-line, single-line, empty, renamed).

## 2. D-04 password hashing cost (main owner)

**2.1 Objections**

| # | Devil's advocate objection | Verdict | Evidence |
|---|---|---|---|
| a | 30 at once: B admits 9 and returns 21 503s; my "3.9 s" omits them | Accept | 1.1 reproduces 9 and 21. |
| b | Rejects above nine sign-ins in four seconds; only C is burst-safe | Modify | Nine is the instantaneous limit. Over 4 s, B admits 17 and rejects 13. B-queue64 returns no 503 at 30, but takes 13.4 s. |
| c | Guard accepts (2^16, r=16) and scrypt rejects it; correct at any cost | Accept | `password.ts:155` (WT) already has the memory formula. 1.2 adds a second gap (N < 2^(16·r)). |
| d | OWASP 2^17 premise is unconfirmed; the snippet ranks Argon2id first | Accept | External, not opened this round. My earlier fetch failed (`platform.md:13`). `scrum/BACKLOG.md:63` labels the figure "[Unverified recollection]". |
| e | Accept A now, then C, not B | Modify | Agree on A now. At first deployment the default is B-queue64, not C (2.2). |
| f | More than nine sign-ins in four seconds per process is plausible | Accept | No arrival data in the repo. [Unverified] Whether such bursts occur is the unknown. |

**2.2 Position: changed from B to A for this cycle.**

What changed and why: B as written (queue 8) rejects 21 of 30 simultaneous sign-ins (1.1), so my recommendation failed a classroom-start burst. Today's configuration admits all 30. Basis: new measured evidence (1.1). The OWASP premise is also weaker support than my memo assumed (2.1 d), so it no longer carries the decision.

1. Keep `COST_N = 2^16`. No rehash function exists in `password.ts`, so a raise changes new hashes only.
2. Release 1 (S): keep `password.ts:155` (WT). Add a rejection for `n >= 2 ** (16 * r)` in `parseStoredHash`. Add a test that runs the 36-case sweep with zero mismatches.
3. Drop my `PasswordParameterError` wrapper. Once the guard matches scrypt, a bad constant is caught by a unit test, not a runtime wrapper.
4. 2^17 is not in this cycle. At first deployment, if no account exists anywhere [Unverified], use 2^17 with the 136 MiB cap and queue 64 (B-queue64). Its peak memory equals today's +128 MiB per process (`platform.md:61-65`). [Inference] It admits about 65 at once. Its 30-burst takes 13.4 s, which the UX lead should weigh. Use C only with at least 512 MiB headroom per replica (`platform.md:126`). Do not use queue 8.
5. Client effect of 503: the dialog has no `ACCOUNTS_BUSY` case, and its default branch shows the server's English text (`components/account/account-dialog.tsx:106-110`). The dialog reads `retryAfterSeconds` only for RATE_LIMITED (`:93`). Rejected users resubmit by hand.
6. [Unverified] Scrypt jobs run on the shared libuv thread pool, so two concurrent 2^17 jobs may slow file I/O during bursts. Not measured.

Strongest argument against: every account created before a raise keeps its 2^16 offline cost, since no rehash path exists. If the security lead rates a stored-hash leak as likely, C or B-queue64 becomes the choice now and the memory question becomes urgent.

Cost: S now; M for 2^17. Reversal: set `COST_N` back for new hashes. Do not lower the cap while 2^17 rows exist. `parseStoredHash` then rejects them, and `verifyPassword` returns false (`password.ts:193-196`), so those users are refused as a failed sign-in.

Confidence: 0.65 (memo: 0.55). Unknown: whether any production account exists.

## 3. D-05 administrator role and usage endpoint

| Objection | Verdict | Evidence |
|---|---|---|
| Admin change needs a restart; agenda omits the audit row | Accept | My memo §3 already had audit and fail-closed. WT writes the audit row in the same SQL statement as the disable and session revocation (`store.ts:215-250`). [Inference] Restart is the cost of env-listed admins. |
| Access-code-only mode has no admin identity; product wants usage hidden from non-admins "in every mode" | Accept | `scrum/meetings/product.md:118, 120`. `admin.ts:31-33` refuses any caller without an account. My memo kept the open gate in this mode, so the position changes (3.1). |
| Explicit no-admin rule | Accept | Accounts off: no admin routes; usage closed. |
| Wrapper-level rule misses three streams | Modify | Done in WT for the wrapper and the three streams: owner events, freshness and session events call `resolveSignedInSession` (`app/api/agent/owner-events/route.ts:51`, `app/api/stages/[id]/freshness/route.ts:54`, `app/api/agent/sessions/[id]/events/route.ts:80`). Two more callers still fall back for a dead session: `lib/persistence/server-auth.ts:133-135` (falls back to the header learner key) and `lib/workbench/workspace-actions.ts:22-26` (falls back to the anonymous cookie). |
| Rule in `resolveRequestAccount` turns the session probe's `authenticated:false` into 401 | Accept | Not done. The probe still calls `resolveRequestAccount`. |
| Duplicated cookie reads as absent | Modify | `lib/server/accounts/session.ts:39` returns undefined for two occurrences. WT `lib/server/agent-runtime/with-owner.ts:27-38` treats duplicates as anonymous, so a second same-name cookie escapes the 401. Use raw presence (3.1). |

**3.1 Position: A, with changes.** Env-listed usernames (`admin.ts:13-19`), admin API, audit, fail-closed (WT `lib/server/agent-runtime/with-owner.ts:34-42`).
- Fail-closed decides on raw presence of the cookie name, not on one parsed value. Present and not live gives 401 in the wrapper and the three streams. The two remaining callers in section 3 need the same rule.
- Usage with accounts off (any mode) is closed: 403 to all, panel hidden. Changed from "keep the gate." Reasons: harm (deployment volume and model names to every gate holder), the product's stated rule, no identity to check, one-line reversal. This is visible to access-code deployments. The panel must hide on refusal; today it fails silently (`components/settings/usage-dashboard.tsx:72`).
- Still missing from my memo: disable does not cancel live agent sessions (`admin-handlers.ts` has no cancel call). Add an idempotent cancel step (M).
- Usage rows carry no owner (`lib/server/usage-storage.ts`, `lib/usage/normalize.ts`, by grep). Per-user usage needs a schema change (`product.md:127`).

Cost: M. Confidence: 0.6 (memo: 0.7). Unknown: whether any operator relies on the usage panel in access-code-only deployments.

## 4. D-06 claiming anonymous data

| Objection | Verdict | Evidence |
|---|---|---|
| Deferral leaves the loss the product rates highest | Reject | A narrow claim leaves soft references: `agent_sessions.stage_id` (`packages/@openmaic/storage/src/agent-session/pg.ts:97`) and `skill_id` (`:99`) have no foreign key. They would point at rows the account does not own, with no error. |
| Claims have no undo | Modify | Undo is a reverse transaction over the claim log: move rows back by recorded ids, restore folder names and event ids, clear the tombstone. [Inference] Undo is ambiguous once the account writes new rows at the target. |
| Per-person confirmation | Modify | The server sees a browser and a signed-in account only. Confirmation is an attestation by the signed-in user, not a verified fact. |
| Sign-out leaks anonymous courses | Accept | Logout clears only the session cookie (`app/api/auth/logout/route.ts:20-22`). The anonymous cookie remains, so pre-sign-in courses return (`product.md:156`). Clearing it at sign-out makes them unreachable until a claim exists. Decide in the claim spec; no code change now. |

Position: B, specification now, implementation next cycle. Unchanged. No claim code exists (grep). Cost: S now; L to implement. Confidence: 0.6. Unknown: whether product accepts moving data on a shared browser after attestation.

## 5. D-11 per-client throttles

Position: A (per-client limit when trusted; per-username only when untrusted). Unchanged. Design changes below.

| Objection | Verdict | Evidence |
|---|---|---|
| Eviction defect is real; cost is requests, not derivations | Accept | 1.3: HEAD evicts a victim's lock at 10,009 recorded failures. WT refunds busy refusals (`lib/server/accounts/service.ts:184`), so counted failures cost derivations. |
| Refuse-when-full with lazy expiry (QA) | Reject | Refuses new failing names during an attack. WT already sweeps expired keys when over capacity (`login-throttle.ts:86`). |
| One school NAT locks a class with 8 failures | Modify | Trusted clients now get 30 per 15 minutes (`client-budget.ts:15-19`), which is one failure per student. Use 60. [Unverified] Typo rates are unmeasured. |
| Spraying is bounded by scrypt throughput | Accept | Holds in WT (refund plus one derivation per counted failure). Does not hold in HEAD. |
| (New) WT still evicts locks | Modify | 1.3: 63 decoys plus 9,936 names evict at 10,449 failures. [Inference] That is about 20 minutes at 8 to 9 derivations per second. The WT comment (`login-throttle.ts:7-11`) claims maxKeys × maxFailures = 80,000. The 64-key scan (`:33`, `:110`) breaks that. |
| (New) Client budget records after the attempt | Modify | Check at `client-budget.ts:50`, record at `:62`. [Inference] Up to 66 concurrent attempts from one client can pass the check (2 active plus 64 queued, `password.ts:57-62`). The per-username path records first (`service.ts:179`). |
| (New) Registration counts only taken names | Modify | `app/api/auth/register/route.ts:26-27` charges USERNAME_TAKEN only. New-name registrations from one client are unbounded, each costing a derivation. Matters only when registration is open (WT default closed, `runtime.ts:30-32`). |

Design changes:
1. Two insertion-ordered tiers, unlocked and locked. A key moves to locked when its live failures reach maxFailures. Evict the oldest unlocked key; take a locked key only when none is unlocked. Apply to the per-username table and to the client budget (`client-budget.ts:18`). Test with maxKeys of at least 100. [Inference] Cost of evicting a lock becomes maxKeys × maxFailures.
2. Client budget: record before the attempt, and refund outcomes that are not counted, as the per-username path does.
3. Registration: a separate budget counting every attempt, initially 60 per hour per client. [Unverified]
4. The untrusted access-code bucket (`app/api/access-code/verify/route.ts:28, 41-46`) is the lockout the agenda describes (B10, `scrum/BACKLOG.md:103`). My design does not copy it.

Cost: M. Confidence: 0.6 (memo: 0.7). Unknown: failures per NAT in production.

## 6. D-13 render client identity

| Objection | Verdict | Evidence |
|---|---|---|
| My snippet drops the flag gate | Accept | HEAD gate at `app/api/export-video/render/route.ts:34`. WT `:33-38` keeps the gate and takes the last entry. Test file exists (`tests/server/render-client-identity.test.ts`, untracked, not run). |

Position: A (last entry, gate kept). Unchanged. Under default compose, the choice has no effect (`RENDER_MAX_JOBS_PER_USER=0`, compose file line 118). Cost: S (in WT). Confidence: 0.85. Unknown: proxy hop count.

## 7. D-14 create-only writes

Position: B, keep hard-link create-only. Unchanged.

| Objection | Verdict | Evidence |
|---|---|---|
| Accept with a startup probe and a lock-file fallback if the probe fails | Modify | The probe exists (WT): `lib/server/classroom-storage.ts:74-89`, called at boot through `lib/server/config-validation.ts:214` and `instrumentation.ts:43`. No fallback now (below). |
| Startup probe plus clear log is sufficient | Accept | Enough for detection. A once-per-process error logs at the first failed create (`classroom-storage.ts:54-60`, WT). A link-less volume still returns 500 per create, after a boot warning. This is not a repair. |
| Lock-file fallback is needed | Reject | [Unverified] No target deployment is known to lack hard links (B22, `scrum/BACKLOG.md:115`). A fallback adds stale-lock expiry and a second write path (M). The `wx` alternative lets a crash leave a truncated file that blocks the id; the QA memo concedes this. Revisit only if a deployment logs the warning and cannot move `data/classrooms`. |
| Platform's B is safer (QA's partial-file concern) | Accept | Supports B. |
| 500 response carries raw error text | Accept | HEAD `app/api/classroom/route.ts:118, 158` returns `error.message` (absolute paths). WT removes it. |
| Guessable ids: create-only lets anyone claim one first | Accept | Real risk, not caused by D-14. `app/api/classroom/route.ts:71` takes a client id; `classroom-storage.ts:110` allows 1 to 128 characters. Route to D-01 and security: server-generated ids for client creates. [Unverified] Whether the editor relies on client ids. |

Optional (S): map EPERM and ENOTSUP to a typed 503 so the cause shows at the route. Not needed for safety.

Cost: S (done in WT). Confidence: 0.7 (memo: 0.6). Unknown: which filesystems deployments mount under `data/`.

## 8. D-17 intermittent account-route failure

Position: B, keep diagnostics, with a defined closing rule.

| Objection | Verdict | Evidence |
|---|---|---|
| My `slice(1,6)` leaks message text | Accept | 1.4. WT `describeUnexpectedError` reads frames only after the stack header (`http.ts:132-147`). |
| Diagnostics help only after recurrence; 14 clean runs take about an hour | Accept | `scrum/BACKLOG.md:75`: a full run is about four minutes, so 14 runs take about 56 minutes. |
| Use QA's form and an adversarial test | Accept | `tests/accounts/route-diagnostics.test.ts` (untracked) injects a newline and a fake frame. Not run. |

Closing rule: 14 consecutive clean full runs with diagnostics live. A recurrence with a code goes to the database-capacity branch. Three clean runs (agenda option A) are rejected. [Inference] At a 40% failure rate, three clean runs occur with probability 0.6^3 ≈ 0.22, and fourteen with probability ≈ 0.0008. At 20%, fourteen clean runs still occur with probability ≈ 0.044. [Inference] The 95% upper bound on the rate after fourteen clean runs is about 19%.

`scrum/BACKLOG.md:119` records plain errors on queries and derivations in the failing window. A derivation callback error is wrapped as PasswordWorkBusyError (`password.ts:111`), which the account route maps to 503 with the code logged. A recurrence on that path shows as a 503, not a 500.

Cost: S (done in WT). Confidence: 0.7. Unknown: whether the failure recurs with diagnostics live.

## 9. Risks raised that touch platform (not memo items)

- No body cap on classroom creation: `app/api/classroom/route.ts:26` reads JSON with no size check (HEAD and WT). Persistence routes cap at 32 MiB by default (`packages/@openmaic/storage/src/server/read-json.ts:3`). Recommend the same cap here (S). [Unverified] A lower cap needs measured payload sizes. The framework's route-handler default was not checked.
- Usage rows have no owner: section 3.1. Cross-reference D-02.
- Shared access-code bucket (B10), sign-out leak (section 4) and guessable ids (section 7) are cross-references. None changes here.

## 10. Summary

Changed positions: D-04 (B to A now; 2^17 deferred, with queue 64 at first deployment, never queue 8). D-05 (usage closed with accounts off). All other items keep their position. Their design changes are listed above.

| Item | Position after rebuttal | Confidence | Cost | Most important unknown |
|---|---|---|---|---|
| D-04 | A now: 2^16, guard correct (WT memory formula, plus N < 2^(16·r) to add). At first deployment, if no account exists, 2^17 with queue 64; C only with 512 MiB headroom per replica. Changed from B. | 0.65 | S | Whether any production account exists |
| D-05 | A: env admins, audit, fail-closed on raw cookie presence (two callers still to repair); cancel still to add. Usage closed with accounts off. Changed. | 0.6 | M | Whether any operator uses the usage panel in access-code-only deployments |
| D-06 | B: specification now, with undo and a sign-out decision. Unchanged. | 0.6 | S | Whether product accepts moving data on a shared browser after attestation |
| D-11 | A: per-client when trusted. Two-tier eviction, record-before, registration budget, threshold 60. Unchanged. | 0.6 | M | Failures per NAT in production |
| D-13 | A: last entry with gate kept (in WT). Unchanged. | 0.85 | S | Proxy hop count |
| D-14 | B: keep create-only; probe and boot warning exist; no fallback. Unchanged. | 0.7 | S | Filesystems mounted under `data/` |
| D-17 | B: diagnostics (in WT); close after 14 clean runs. Unchanged. | 0.7 | S | Whether the failure recurs with diagnostics live |
