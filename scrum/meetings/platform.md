# Platform lead memo: meeting 01

Role: Platform lead (P). Branch: `claude/hopeful-sagan-267tw5`. Date: 2026-10-11.
Items: D-04 (main owner), D-05, D-06, D-11 (shared-store option), D-13, D-14, D-17 (reliability side).

Label scope: this memo contains `[Inference]` and `[Unverified]` statements. Each is labeled at its start.

## Method and limits

- Read-only. I created only this file. I ran no test suite and no git command. Benchmarks ran as inline `node -e` with no files written.
- [Measured: `node -p` and `os` calls] Sandbox: Node v22.22.0, 4 vCPU, 16,093 MiB RAM. [Measured: `cat /sys/fs/cgroup/memory.max`] The cgroup limit is not visible.
- [Verified: package.json:6-7] Engines `>=22.19.0`. [Verified: Dockerfile:4,84] Production base image `node:22-alpine`. [Unverified] The production scrypt memory behavior may differ from this sandbox (different OpenSSL build on alpine).
- [Unverified] OWASP's scrypt recommendation, cited as a recollection in `scrum/BACKLOG.md:63`. I cannot verify this. WebFetch failed on DNS, and curl through the proxy returned CONNECT 403.
- [Unverified: my assumption] Cost scale: S = under one day with tests; M = one to three days; L = more than three days. The repo has no team sizing.
- Correction to the brief. Runtime learner keys are device keys only for anonymous learners. A signed-in learner's key is `acct:<id>`. [Verified: lib/persistence/bootstrap.ts:75-84] [Verified: app/api/auth/session/route.ts:29] Those rows are owner-keyed, and the D-06 inventory includes them.

## 1. Shared operations facts

**Memory and topology**

- [Verified: docker-compose.yml:2-42] The `openmaic` service sets no `mem_limit`. Only `render-service` sets one (`docker-compose.yml:128`, default 8g).
- [Verified: docker-compose.yml:2-42] One app service. No `replicas` or `deploy` block. Scale-out is not configured in the repo.
- [Verified: lib/server/accounts/login-throttle.ts:4-5] The sign-in throttle is per process.
- [Verified: lib/server/accounts/password.ts:57-64] scrypt concurrency and queue are per-process module state.
- [Verified: lib/persistence/server-provider.ts:27-36] Provider state lives on `globalThis`, per process.
- [Verified: lib/server/usage-storage.ts:8-10] Usage logs are files under `data/usage`, described as the `openmaic-data` volume.
- [Verified: lib/server/classroom-storage.ts:7-8] Classroom and job files live under `data/classrooms` and `data/classroom-jobs`.
- [Inference] With N app replicas, usage totals, classroom files and throttle budgets are per replica. Compose does not share the volume across replicas.

**Migrations and startup DDL**

- [Verified: lib/persistence/server-provider.ts:49-55] Schema ensures run once per process start, in sequence, with no advisory lock around them.
- [Verified: lib/server/agent-runtime/store.ts:47] [Verified: lib/server/agent-runtime/user-skill-store.ts:53] The agent-session and user-skill schemas are ensured from their own modules.
- [Verified: lib/persistence/owner-materials.ts:128-129] [Verified: lib/persistence/stage-meta.ts:32-36] [Verified: packages/@openmaic/storage/src/document/pg.ts:70-71,89-93] [Verified: packages/@openmaic/storage/src/agent-session/pg.ts:120-127] Several `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements run on every start.
- [Inference] PostgreSQL takes the ALTER TABLE lock before it evaluates `IF NOT EXISTS`. Each start would then request ACCESS EXCLUSIVE on those tables, which can queue behind a long reader during a rolling restart. [Unverified] Not measured. No Postgres is available in this sandbox.
- [Verified: lib/persistence/stage-meta.ts:43-47] Each start runs an `INSERT ... SELECT` over all of `document_stages`, with an anti-join. Its cost grows with the number of courses.
- [Inference] Concurrent `CREATE TABLE IF NOT EXISTS` from several starting processes can fail on the catalog unique index. [Unverified] Not measured.
- [Verified: packages/@openmaic/storage/src/agent-session/pg.ts:226-259] The `agent_owner_session_events` constraint migration takes ACCESS EXCLUSIVE once, on upgrade only.
- [Inference] Recommended for all items: one migration step before rollout, under an advisory lock, with a schema version row.

## 2. D-04 Password hashing cost (main owner)

**Recommendation: B, modified.** Raise to 2^17 with one concurrent derivation. Raise the memory cap to 136 MiB and the queue cap to 8. Roll out in two phases. Make the stored-hash bound check use the same memory formula as scrypt.

**Evidence**

- [Verified: lib/server/accounts/password.ts:16-23] `COST_N = 2^16`, `r = 8`, `p = 1`, `MAX_MEMORY_BYTES = 128 MiB`. The comment at line 22 says the ceiling "leaves headroom for COST_N". At 2^17 it does not.
- [Measured: `node -e` boundary check, Node v22.22.0] N=2^17, r=8, p=1:
  - maxmem 134,217,728 (128 MiB, today): synchronous `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`.
  - maxmem 134,220,799: same synchronous error.
  - maxmem 134,220,800: accepted.
  - maxmem 142,606,336 (136 MiB): accepted, derivation completes.
- [Inference] The required amount is `128·r·(N+2) + 128·p·r` bytes. For N=2^17, r=8 that gives 134,220,800, which matches the measured boundary exactly.
- [Verified: password.ts:152] The stored-hash guard is `128 * n * r > MAX_MEMORY_BYTES`. For N=2^17, r=8 the product equals the cap, so the guard accepts the value.
- [Measured: `node -e`] N=2^16, r=16, maxmem 128 MiB also throws synchronously. The guard accepts it too, since 128·2^16·16 equals the cap. At 136 MiB it is accepted. So parse and derivation disagree at the cap.
- [Measured: `node -e`, replicating the `deriveKey` promise shape at `password.ts:109-114`] A synchronous throw inside the Promise executor rejects with a `RangeError`. It does not reach the `PasswordWorkBusyError` mapping. The route then answers 500 (`lib/server/accounts/http.ts:142-145`), not 503 (`http.ts:138-141`). A bad cap therefore fails every sign-in with 500.
- [Measured: `node -e`, sequential n=8 and two-concurrent n=4 pairs] Median time per hash:
  - 2^16: 217 ms (min 202, max 247).
  - 2^17: 431 ms (min 409, max 642).
  - Two concurrent, wall time per pair: 2^16 239 ms (max 260); 2^17 475 ms (max 486).
- [Measured: `process.resourceUsage().maxRSS` delta, one process per configuration; baseline 44.8 MiB] Peak extra RSS:
  - 2^16, one derivation: +64 MiB.
  - 2^16, two: +128 MiB.
  - 2^17, one: +128 MiB.
  - 2^17, two: +256 MiB.
- [Verified: password.ts:57-62] Today: two concurrent, queue 64. Peak +128 MiB per process.
- [Inference from measured medians] Throughput per process: 2^16 with two concurrent is about 8.4 hashes/s (about 30,000 per hour). 2^17 with two is about 4.2/s. 2^17 with one is about 2.3/s (about 8,300 per hour).
- [Inference from measured medians] Worst wait for the last queued request: 2^16, two, queue 64: about 7.9 s. 2^17, two, queue 64: about 15.7 s. 2^17, one, queue 8: about 3.9 s. 2^17, one, queue 64: about 28 s.
- [Verified: password.ts:9] The stored format carries its cost. [Verified: password.ts exports] No rehash path exists. Existing 2^16 hashes stay at 2^16 unless a rehash is added. No database migration is needed for correctness.
- [Verified: docker-compose.yml:2-42] No container memory limit on the app. The real budget is unknown. [Unverified] Production host memory and per-container limits.

**Options**

- A (keep 2^16): peak 128 MiB per process, about 8.4 hashes/s, latency about 217 ms on this host.
- B (recommended): peak 128 MiB per process, the same as today. Hash cost doubles. Burst throughput drops to about 2.3/s per process. Single-request latency rises to about 431 ms on this host.
- C: peak 256 MiB per process, about 4.2/s. Memory doubles with no known budget.

**Proposed change (not applied)**

```ts
const COST_N = 2 ** 17;
const MAX_MEMORY_BYTES = 136 * 1024 * 1024;  // 2^17 needs 134,220,800 bytes (measured)
const MAX_CONCURRENT_DERIVATIONS = 1;         // peak 128 MiB per process
const MAX_QUEUED_DERIVATIONS = 8;             // about 3.9 s worst wait at 2^17 (measured median)

/** Bytes OpenSSL requires for these parameters. Use this in parseStoredHash too. */
function scryptMemoryBytes(n: number, r: number, p: number): number {
  return 128 * r * (n + 2) + 128 * p * r;
}
// parseStoredHash: replace `128 * n * r > MAX_MEMORY_BYTES`
//   with `scryptMemoryBytes(n, r, p) > MAX_MEMORY_BYTES`

class PasswordParameterError extends Error {
  constructor(readonly reason?: unknown) {
    super('Password parameters are invalid');
    this.name = 'PasswordParameterError';
  }
}
// deriveKey: wrap the scrypt call so a synchronous parameter error is typed and logged.
try {
  scrypt(password, salt, keyLength, scryptOptions, (error, derivedKey) => {
    if (error) reject(new PasswordWorkBusyError(error));
    else resolve(derivedKey);
  });
} catch (error) {
  reject(new PasswordParameterError(error)); // a defect, not load: route answers 500 and logs the name
}
```

**Two-phase rollout**

- [Inference] Release 1: raise `MAX_MEMORY_BYTES`, accept 2^17 in the stored-hash guard, keep `COST_N` at 2^16.
- [Inference] Release 2, only after every replica runs release 1: `COST_N = 2^17`. A replica still on the 128 MiB cap cannot derive a 2^17 hash. It answers 500, the failure measured above.

**Strongest argument against B.** Halving per-process throughput halves legitimate throughput too. Under an online attack, real sign-ins queue behind attack traffic, and B cuts burst throughput to about a quarter of today's. The offline benefit applies only to new hashes unless rehash-on-sign-in is added. The repo shows no database-leak scenario; that threat call belongs to the security lead.

**Cost:** M (two releases, guard change, boundary and rollback tests).

**Reversal:** set `COST_N` back to 2^16 for new hashes. Keep the raised cap. Lowering the cap again would turn stored 2^17 hashes into 500s.

**Confidence:** 0.55.

**What would change my mind**

- A verified OWASP source that states 2^17 as the minimum: confidence rises to about 0.7 and B stands.
- Production memory headroom of at least 512 MiB per replica, plus a measured sign-in burst profile: move to C.
- Evidence that registration spam, not hash cost, is the main threat: keep A and let D-03 and D-11 do the work.
- A production scrypt cap different from the sandbox: recompute the cap before release.

**Single most important unknown:** the per-instance memory budget, and the scrypt cap on `node:22-alpine`.

## 3. D-05 Administrator role and usage endpoint

**Recommendation: A, with three additions.**
1. Operator lists usernames in `ADMIN_USERNAMES`. Keep the agenda's wording. A username-based list is safe today because the store has no rename or delete path.
2. Every admin action writes an audit row in the same transaction.
3. A disabled account fails closed, and its live agent work is cancelled.
Usage endpoint: admin-only when accounts are enabled. When accounts are off, keep the current gate.

**Evidence**

- [Verified: app/api/persistence/[...path]/route.ts:155-156] `authorizeMerge` and `authorizeAdmin` both return `false`.
- [Verified: packages/@openmaic/storage/src/server/reference.ts:116-119] The reference defaults deny.
- [Verified: packages/@openmaic/storage/src/server/index.ts:659-673] Storage admin routes are gated by `authorizeAdmin`. `DELETE /runtime` deletes all runtime data. `DELETE /runtime/stages/:id` deletes one stage's runtime. Wiring `authorizeAdmin` to a new admin role would open both to admins. Review them first.
- [Verified: lib/server/accounts/store.ts:12-32] The schema has no role column. `disabled_at` is the only account status.
- [Verified: grep over repo] `disabled_at` is written only in tests (`tests/accounts/store.test.ts:49`, `tests/accounts/service.test.ts:193`). No production path sets it. No admin path exists.
- [Verified: lib/server/accounts/service.ts:172-174] [Verified: store.ts:135] A disabled account fails sign-in and fails the session lookup on every request.
- [Verified: lib/server/accounts/runtime.ts:57-78] [Verified: lib/server/agent-runtime/with-owner.ts:18-24] [Verified: lib/server/agent-runtime/owner.ts:53-66] When the session does not resolve, the request falls back to the `anon:` cookie owner.
- [Inference] A disabled user keeps working anonymously wherever anonymous access is open. Whether it is open depends on deployment configuration, which I did not verify.
- [Verified: grep over lib/server/agent-runtime] The runner never re-checks account state. [Verified: CREATE TABLE list across the storage package] The agent-session schema has no account reference. [Inference] Queued and running work for a disabled account keeps running.
- [Verified: grep for audit terms in lib/ and packages/] No account or admin audit storage exists. The matches are unrelated comments.
- [Verified: app/api/usage/route.ts:71-76] `GET /api/usage` has no authorization check. Its response carries no per-owner breakdown (lines 102-107).
- [Verified: components/settings/general-settings.tsx:115] [Verified: components/settings/usage-dashboard.tsx:67-78] The only consumer is the General settings dashboard, rendered for every user. On a non-success response it shows nothing (`json.success !== false`, no error text).
- [Verified: lib/server/usage-storage.ts:8-10] The "deployment-wide" log is a file in one container's volume.

**Is `disabled_at` enough for abuse handling? No.** It is a sound off-switch for sign-in and for account-owned requests. Four gaps:
1. Requests fall back to anonymous when the account check fails.
2. Queued and running agent work continues.
3. No actor, reason or time is recorded.
4. It does not limit new registrations (see D-11) or anonymous use from the same browser.

**Minimal data model (additive, new table only).** No `ALTER` on `accounts`, which avoids a lock on the auth table during upgrade.

```sql
CREATE TABLE IF NOT EXISTS account_admin_audit (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('account.list','account.disable','account.enable','usage.read')),
  target_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb   -- ids and counts only; never hashes, tokens or secrets
);
CREATE INDEX IF NOT EXISTS account_admin_audit_target_idx ON account_admin_audit (target_id, occurred_at);
```

- Admin check: parse `ADMIN_USERNAMES` with `normalizeUsername`, compare with `SessionAccount.username` (`store.ts:138-139`). No extra database call.
- Disable, one transaction:
  ```sql
  UPDATE accounts SET disabled_at = $now WHERE id = $target AND disabled_at IS NULL;
  INSERT INTO account_admin_audit (actor_id, action, target_id, detail)
    VALUES ($actor, 'account.disable', $target, $detail);
  ```
- Then cancel the account's live agent sessions through the agent-session store's cancel path. [Verified: packages/@openmaic/storage/src/agent-session/pg.ts:108] [Verified: pg.ts:808-829] Cancelled sessions settle at claim time. This is a second, cross-store step, so it must be idempotent and retried.
- Fail closed (shared with D-12): tell "no session cookie" apart from "cookie present, session not live". Refuse the second with 403 `ACCOUNT_DISABLED`, not the anonymous fallback. Size S to M.
- API:
  - `GET /api/admin/accounts`: paged. Columns: id, username, createdAt, disabledAt. No hashes. Audited as `account.list`.
  - `POST /api/admin/accounts/:id/disable` and `/enable`: body has a reason of at most 200 characters. Same-origin check via `isCrossSiteRequest` (`lib/server/accounts/http.ts:29-32`).
- Usage: admin-only when accounts are enabled. The dashboard must hide itself for non-admins, since today it fails silently (UX lead).

**Strongest argument against A.** Env-listed admins need a restart to change. During a rolling restart, replicas can briefly disagree. The audit table is append-only only by convention unless the database role is restricted. A DB role column (B) is cleaner for frequent changes.

**Cost:** M. The env check and routes are S. Audit, cancellation and fail-closed are M.

**Reversal:** remove the env var. Admin access ends at the next restart. The audit table stays. Re-enable with the enable action, which writes an audit row.

**Confidence:** 0.70.

**What would change my mind:** more than three admins changing often, or a planned multi-replica topology where env drift matters (move to B). Evidence that account deletion is planned (switch the list to account ids).

**Single most important unknown:** how many replicas operators will run.

## 4. D-06 Claiming anonymous data at sign-in (feasibility, schema, transaction boundaries)

**Recommendation: B.** Write the single-transaction specification now, including the lock plan, collision rules and test plan. Implement next cycle. Partial application is unsafe, so A is not recommended as written.

**Owner-keyed inventory**

| Table.column | Owner key today | Where | Safe to move? | Note |
|---|---|---|---|---|
| `agent_sessions.owner_id` | `anon:<uuid>` or `acct:<id>` | `agent-session/pg.ts:93`; index 168-169 | Yes, with rules | `mergeOwner` re-keys (1634-1638). Soft refs to `stage_id` (97) and `skill_id` (99). Lease fields (105-108) need a rule for running sessions. |
| `agent_owner_session_event_counters.owner_id` | same | `pg.ts:201-205` | Only by renumbering | Per-owner sequence (`pg.ts:1494-1502`). |
| `agent_owner_session_events (owner_id,id)` | same | `pg.ts:207-216` | Only by renumbering | `mergeOwner` re-issues ids above the high-water mark (`pg.ts:1655-1674`). SSE cursors change. |
| `document_folders (owner_id,id)`, UNIQUE(owner_id, normalized_name) | same | `document/pg.ts:59-68` | Yes, rename on collision | Limit 50 (`pg.ts:754`, `786`). |
| `document_stages.owner_id` (nullable) | same; NULL is legacy | `document/pg.ts:84`, `89-90`, `95-96` | Yes, in lockstep with `stage_meta` | `persistStage` refuses an owner mismatch (`pg.ts:632`). |
| `stage_meta.owner_id` (NOT NULL) | same | `lib/persistence/stage-meta.ts:25-38` (owner at 27) | Yes, in lockstep | Ownership gate (`owner-bound-document-store.ts:188-196`); list filter (line 133). |
| `agent_user_skill.owner_id` | same | `skill/pg.ts:51-75` (owner 53, unique 71-72) | Yes, rename or refuse | Limit 50 (`skill/types.ts:16`). |
| `owner_material.owner_id` | same | `lib/persistence/owner-materials.ts:103-120` (owner 105) | Yes, with quota re-check | `maxCount` and `maxTotalBytes` (`owner-materials.ts:85-88`). |
| `runtime_sessions.learner_key` | device key `anon:<uuid>` or `acct:<id>` | `runtime/pg.ts:69-83` (key 72) | Yes, via `mergeLearner` | Own transaction (`runtime/pg.ts:563`). Default-denied by app (`route.ts:155`). |
| `asset_entries.principal` | `'shared'` in persistence route | `asset/pg.ts:70-80` (72); `route.ts:141`; `server-auth.ts:42` | Nothing to move | Not owner-keyed today. |

Not owner-keyed (no move needed): `agent_session_materials` (`material/pg.ts:56-58`, session FK); `runtime_records` (`runtime/pg.ts:85-93`, session FK); `agent_session_urls` (`agent-session/pg.ts:279-281`); document scenes, outlines and revision tables (`document/pg.ts:102-116`, `157-167`); `accounts` and `account_sessions` (`store.ts:13-27`). [Verified: classroom JSON files have no owner field (`lib/server/classroom-storage.ts:62-67`).]

**Two anonymous identities per browser**

- [Verified: lib/server/agent-runtime/owner.ts:61,65] Cookie owner `anon:<uuid>` for sessions, skills, materials, folders and documents.
- [Verified: lib/runtime/learner-key.ts:31-41] Device learner key `anon:<uuid>`, stored in device KV, for runtime data.
- [Verified: lib/persistence/server-auth.ts:105,111] The server takes the anonymous learner key from a client header. Nothing binds it to the cookie. [Inference] A claim endpoint would accept the device key as a bearer capability: any holder of a device key could claim its runtime data.
- [Verified: owner.ts:4,63-64] The cookie is valid for 30 days from mint. Its Max-Age is not refreshed on use. [Inference] After 30 days the anonymous data is unreachable from that browser.
- [Verified: lib/runtime/learner-key.ts:5-7] Device keys do not sync across devices, by design.

**Feasibility, verified**

- [Verified: packages/@openmaic/storage/src/agent-session/pg.ts:1615-1698] `PgAgentSessionStore.mergeOwner` moves sessions, re-numbers owner events above the high-water mark, and deletes the source counters. Contract tests exist: `test/agent-session-contract.ts:629,638`; `test/agent-session-concurrency-contract.ts:131-153`.
- [Verified: grep over lib/ and app/] Nothing in the app calls `mergeOwner`.
- [Verified: packages/@openmaic/storage/src/runtime/pg.ts:546-584] `mergeLearner` re-keys runtime sessions in its own transaction. The app default-denies it (`route.ts:155`).
- [Verified: grep] No code updates `document_stages.owner_id` or `stage_meta.owner_id`. Only `mergeOwner` runs `SET owner_id` (`pg.ts:1635`).

**Transaction boundaries**

- [Verified: lib/persistence/server-provider.ts:56] [Verified: lib/server/agent-runtime/store.ts:53-54] [Verified: lib/server/agent-runtime/user-skill-store.ts:34-54] Three separate transaction hooks. Each checks out its own client. No single transaction spans them with the current APIs. The materials path opens its own transaction (`lib/persistence/owner-materials.ts:300`).
- [Verified: owner-bound-document-store.ts:182,188-196] Document writes use `READ COMMITTED` and lock `stage_meta` rows `FOR UPDATE`.
- [Verified: packages/@openmaic/storage/src/document/pg.ts:142-147] Batch writers must run `SET LOCAL openmaic.suppress_stage_notify = 'on'` inside the transaction. `SET LOCAL` outside a transaction has no effect. The stage revision trigger (`pg.ts:220-224`) fires on every owner update, so a claim without this setting sends one notification per stage.
- [Verified: skill/pg.ts:241] [Verified: owner-materials.ts:300] [Verified: asset/pg.ts:280] Three advisory keys: `hashtext(owner)` for skills, `hashtextextended(owner,0)` for materials, `hashtextextended(principal,0)` for assets. These are different hash functions. A claim must take the keys that exclude the writers it races with.
- [Verified: packages/@openmaic/storage/src/agent-session/types.ts:501-506] The contract says `resolveFinalOwner` must run first, using the host's lock order, or "a create can commit under an identity immediately after merge." The app does not wire the hook (`lib/server/agent-runtime/store.ts:53-82`). The default is identity (`pg.ts:497`).
- [Inference] Without a fence, a session created under `anon:X` that commits after the claim's read is orphaned. Fence it with a tombstone row checked inside the create transaction, or wire `resolveFinalOwner` with the same lock.
- [Inference] Do not map the old anonymous id to the account. That would route a later anonymous visitor on a shared browser into the account. Clear the cookie in the claim response and refuse reuse of the tombstoned id.
- [Verified: packages/@openmaic/storage/src/runtime/pg.ts:559-562] The lock set grows with the source's session count. The storage comment recommends `lock_timeout`.

**Collisions and quotas at the target**

- Folders: rename on `normalized_name` collision; refuse above 50.
- Skills: rename or refuse on `(owner, name)` collision; refuse above 50.
- Materials: apply `maxCount` and `maxTotalBytes` to the combined total.
- Legacy NULL-owner documents: not claimable. [Verified: stage-meta.ts:43-47] The backfill covers only non-null owners.
- Assets and classroom files: nothing to move.

**Specification outline (not implemented)**

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL openmaic.suppress_stage_notify = 'on';
-- 1. locks: both owners, both hash functions, sorted order
SELECT pg_advisory_xact_lock(hashtext($1::text));
SELECT pg_advisory_xact_lock(hashtextextended($1, 0));
-- repeat for $2; then lock rows in key order
SELECT stage_id FROM stage_meta WHERE owner_id = $1 ORDER BY stage_id FOR UPDATE;
-- 2. re-key in dependency order; folders, skills, materials, sessions and runtime per the table above
UPDATE stage_meta SET owner_id = $2 WHERE owner_id = $1;
UPDATE document_stages SET owner_id = $2 WHERE owner_id = $1;
-- 3. tombstone the source and write the claim log (needed for reversal)
INSERT INTO owner_claims (from_owner, to_owner, moved) VALUES ($1, $2, $3);
COMMIT;
```

1. `POST /api/account/claim`: signed-in only; same-origin check; body carries the device key (optional).
2. One client, one transaction, the locks above, then re-keying.
3. Tombstone the source. Create paths check the tombstone in the same transaction.
4. Claim log with moved ids. Renumbered events and renamed folders cannot be recovered without it.
5. Clear the anonymous cookie in the response.
6. Real-Postgres tests (the gap in B25), including a session created during the claim.
7. UI: show counts, require explicit confirmation, warn that anyone using this browser shares the data.

**Cost:** specification S now. Implementation L: `mergeOwner` refactor to accept a transaction, five-store move, tombstone fence, real-Postgres tests, UX.

**Reversal:** only from the claim log. Without it, not reversible.

**Strongest argument against B.** Deferral leaves the 30-day cookie clock running. [Inference] Anonymous data becomes unreachable whatever we decide. A narrow claim (agent sessions via `mergeOwner`, plus stages) could ship sooner. The atomicity argument answers it: a partial claim leaves `agent_sessions.stage_id` (`pg.ts:97`) and `skill_id` (`pg.ts:99`) pointing at rows the account does not own. Both are soft references with no foreign key, so no database error would surface. [Inference]

**Confidence:** 0.60.

**What would change my mind:** a single-transaction API across these stores that keeps the diff small (move toward A). Product confirmation that anonymous data may move on shared browsers without per-person consent (decided by S and PD). Either would change the plan.

**Single most important unknown:** whether the product accepts moving anonymous data after explicit confirmation on a shared browser.

## 5. D-11 Per-client throttles (shared-store option)

**Recommendation: A now.** Per-client limit keyed by the last forwarded address, only when `TRUST_PROXY_HEADERS=true`. Untrusted deployments keep the per-username limit. Add the missing registration throttle in the same change. **Shared store (C): defer until replicas exceed one.** Design its table now so A can migrate to it.

**Evidence**

- [Verified: lib/server/accounts/login-throttle.ts:22-26] Sign-in: 8 failures per 15 minutes per username, in memory per process.
- [Verified: lib/server/accounts/service.ts:108-142] Registration has no throttle. [Verified: app/api/auth/register/route.ts:24] The route calls `registerAccount` directly.
- [Inference from measured throughput] One process can derive about 8.4 hashes/s, about 30,000 per hour. Unthrottled registration is bounded only by the queue (`password.ts:62`, 64) and CPU.
- [Verified: app/api/access-code/verify/route.ts:27-32] The access route already keys on the last entry when `TRUST_PROXY_HEADERS=true`. When it is unset, every caller shares one bucket, which is the lockout risk.
- [Verified: scrum/BACKLOG.md:103] Throttles are per process. N replicas give N budgets.

```ts
function clientKey(req: Request): string | undefined {
  if (process.env.TRUST_PROXY_HEADERS !== 'true') return undefined; // untrusted: per-username only
  const last = req.headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  return last || req.headers.get('x-real-ip')?.trim() || undefined;
}
```

**Strongest argument against A.** Per-client limits are cheap to evade by rotating addresses, and in-memory budgets multiply with replicas. Registration spam is closed only by a shared store or a global cap. With trusted headers but no overwriting proxy, the header is spoofable.

**Cost:** A is S (same `LoginThrottle` class, new key, two routes, tests). C is M (expiring table, atomic upsert, pruning, tests).

**Reversal:** A by removing the keyed check or the env flag. C by ignoring the table.

**Confidence:** 0.70.

**What would change my mind:** replicas above one in any real deployment (move to C now). Evidence of address rotation (C plus a daily registration cap). A multi-hop proxy (see D-13).

**Single most important unknown:** replica count.

## 6. D-13 Render service client identity

**Recommendation: A.** Use the last entry, matching the access route.

**Evidence**

- [Verified: app/api/export-video/render/route.ts:33-38] Takes the first entry (line 36).
- [Verified: app/api/access-code/verify/route.ts:23-30] Takes the last entry. The comment says it is the one the trusted proxy appended.
- [Verified: app/api/export-video/render/route.ts:81] Forwards the value as `x-openmaic-client`. [Verified: render-service/src/main.ts:272,377] The render service reads it as the per-user identity.
- [Verified: docker-compose.yml:112-118] Default compose does not set `TRUST_PROXY_HEADERS`, so every caller is `direct`. [Verified: docker-compose.yml:118] `RENDER_MAX_JOBS_PER_USER=0` disables the job limit.
- [Inference] Under default compose the first-entry choice has no effect today. It matters only when an operator enables the per-user job limit behind a trusted proxy. A client spoofs it by prepending values to `X-Forwarded-For`, because the proxy appends.
- [Verified: lib/server/agent-runtime/scene-preview.ts:70] The preview path sends the owner id from the server. It is not affected.

```ts
const fwd = req.headers.get('x-forwarded-for');
if (fwd) return fwd.split(',').pop()!.trim() || 'anonymous'; // last entry: appended by the trusted proxy
```

**Strongest argument against A.** With more than one trusted hop, the last entry is the nearest proxy, so every client shares one identity. Current docs and the access route assume one hop. A hop-count setting would be needed for that topology.

**Cost:** S (one line, tests).

**Reversal:** revert the line.

**Confidence:** 0.85.

**What would change my mind:** a two-hop topology (move to a hop-count setting, M).

**Single most important unknown:** the number of proxy hops in front of the app.

## 7. D-14 Create-only writes where hard links are unsupported

**Recommendation: B (keep), plus a startup probe** that fails loudly with an actionable message on a link-less filesystem. Do not implement the `wx` fallback as written.

**Evidence**

- [Verified: lib/server/classroom-storage.ts:36-46] The helper stages a temp file and hard-links it into place. [Verified: classroom-storage.ts:36-37] A reader never sees a partial file. A crash leaves only a `.tmp`.
- [Verified: classroom-storage.ts:45] `fs.link` has no fallback.
- [Verified: classroom-storage.ts:52-54] `EEXIST` maps to a conflict.
- [Inference] The agenda's option A (`wx` on EPERM, ENOTSUP or EXDEV) writes the final path directly. A reader can see a partial file. A crash leaves a truncated file that blocks that id with EEXIST.
- [Inference] EXDEV is unlikely: the temp file sits beside the target.
- [Unverified: B22] Whether any deployment filesystem lacks hard links is unknown. I did not create files here to test, per the rules.

```ts
// startup probe (proposal)
async function probeHardLinks(dir: string): Promise<boolean> {
  await fs.mkdir(dir, { recursive: true });
  const a = path.join(dir, `.link-probe-${randomUUID()}`);
  const b = `${a}.b`;
  await fs.writeFile(a, '');
  try { await fs.link(a, b); return true; } catch { return false; }
  finally { await fs.rm(a, { force: true }); await fs.rm(b, { force: true }); }
}
```

**Strongest argument against B.** A link-less deployment fails classroom creation with a 500 until someone acts. The probe reports the problem without solving it.

If the probe finds link-less storage in a real deployment, implement a lock-file fallback instead: `wx` lock file, existence check, temp write, rename, unlink the lock, with stale-lock expiry. Cost M.

**Cost:** S (probe).

**Reversal:** remove the probe.

**Confidence:** 0.60.

**What would change my mind:** confirmed link-less storage in a target deployment (implement the lock-file fallback). Confirmed rarity of partial reads and crashes (adopt A).

**Single most important unknown:** which filesystems deployments mount under `data/`.

## 8. D-17 Intermittent account-route failure (reliability side)

**Recommendation: B.** Add diagnostics now: error name, error code, and stack without the message. Keep PGlite and the shared instance. Close only after diagnostics are live and either the failure recurs with a code, or it stops over a longer window.

**Evidence**

- [Verified: scrum/BACKLOG.md:119] Two failures in five full runs before the mitigation. One clean run since.
- [Verified: tests/accounts/routes.test.ts:65-79,104] The file opens one PGlite instance in `beforeAll` and truncates two tables in `beforeEach`.
- [Verified: lib/server/accounts/http.ts:142-145] Generic errors log only `error.name`. No code, no stack.
- [Measured: `node -e`] V8 puts the message on the first stack line (`Error: sample-message-text`). Logging the stack verbatim leaks the message. Drop the first line.
- [Inference] The 500 signature points at the database more than at scrypt. In `loginAccount`, `findAccountByUsername` runs before any derivation (`service.ts:165`). A scrypt callback failure maps to 503 (`password.ts:111` to `http.ts:138-141`).
- [Inference] A synchronous scrypt throw can also produce a 500 (measured above as `RangeError`). It needs invalid parameters. Parameters here are constants or validated rows, so scrypt is an unlikely intermittent cause.
- [Inference] If the failure rate were 0.4 before the fix, three clean runs would occur by chance with probability 0.6³ ≈ 0.22. Three clean runs alone do not show a fix.

```ts
} else {
  const code = (error as { code?: unknown } | null)?.code;
  const stack = error instanceof Error ? error.stack?.split('\n').slice(1, 6).join(' | ') : '';
  log.error(
    `Account request failed: ${error instanceof Error ? error.name : 'unknown'} ` +
      `code=${typeof code === 'string' ? code : '-'} ${stack ?? ''}`,
  );
}
```

The logger signature was not read. The call above uses one string, which matches the existing single-argument calls.

**Strongest argument against B.** Diagnostics help only if the failure recurs, and the repo gives no timeline. The flaky test stays in place meanwhile. Option C (fake pool) would drop the SQL layer from route tests and reduce coverage. B25 already notes there is no real-Postgres test.

**Cost:** S. **Reversal:** remove the logging. **Confidence:** 0.60.

**What would change my mind:** a logged code pointing at PGlite capacity (split the route test file, or use real Postgres for this suite).

**Single most important unknown:** whether the failure recurs with diagnostics on, and which error code appears.

## 9. Cross-item notes and upgrade effects

- D-05 and D-12 share one fail-closed fix: a session cookie that does not resolve must not fall back to anonymous.
- D-04 and D-17 share one gap: the synchronous throw in `password.ts:109-114` bypasses the busy mapping.
- D-11 and D-13 share the `TRUST_PROXY_HEADERS` hop assumption. Document "one trusted hop" beside the variable in `.env.example`.
- Per-replica file state (usage logs, classroom files) is not solved by any item here. Flag it to the coordinator.
- Upgrade effects:
  - D-04: the two-phase rollout (section 2).
  - D-06: mergeOwner renumbers events, so SSE cursors reset. Clients must reset them.
  - D-11: enabling `TRUST_PROXY_HEADERS` without an overwriting proxy opens spoofing.
  - D-13: existing per-identity counters reset.
  - D-05, D-14, D-17: none.
- Every proposal adds tables or changes code only. None alters `accounts`, which avoids a lock on the auth table during upgrade.

## 10. Summary table

| Item | Recommended option | Confidence | Cost | Single most important unknown |
|---|---|---|---|---|
| D-04 | B, modified: 2^17, one derivation, cap 136 MiB, queue 8, two-phase rollout | 0.55 | M | Per-instance memory budget, and scrypt cap on `node:22-alpine` |
| D-05 | A (env-listed usernames), plus audit table, audited disable/enable, fail-closed, cancel live work. Usage admin-only when accounts are on | 0.70 | M | Number of replicas operators will run |
| D-06 | B: write the single-transaction spec now; implement next cycle | 0.60 | S now (L to implement) | Whether moving anonymous data on a shared browser is acceptable after confirmation |
| D-11 | A now (per-client only when trusted), add registration throttle; C (shared store) deferred until replicas > 1 | 0.70 | S (A); M (C) | Replica count |
| D-13 | A: last `x-forwarded-for` entry, matching the access route | 0.85 | S | Proxy hops in front of the app |
| D-14 | B: keep link-based create-only write, plus a startup probe | 0.60 | S | Which filesystems deployments mount under `data/` |
| D-17 | B: diagnostics (name, code, stack without message); close only after recurrence data or a longer clean window | 0.60 | S | Whether the failure recurs with diagnostics on, and which error code appears |
