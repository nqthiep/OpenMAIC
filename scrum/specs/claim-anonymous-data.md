# Claim anonymous data at sign-in

Implements D-06 option B (`scrum/DECISIONS.md:44-47`). This file is the specification. The build is next cycle.

**Snapshot.** HEAD `491c409`. The working tree is uncommitted and was still changing while this was written. At the last check it had 48 modified files and 21 untracked entries (`git status --porcelain`). Citations marked **(WT)** are in that state, which includes the D-03, D-11, D-12 and D-02 phase 1 changes. The (WT) lines were re-checked at the last check. Re-check them again before building.

**Labels.** An unlabelled code fact was read at the cited line. [Unverified] means not checked in code or not runnable here. [Inference] means reasoned from code, not executed. **Decision** marks a choice this spec makes.

## 0. Terms

| Term | Meaning | Source |
|---|---|---|
| Source owner | `anon:<uuid>` from the `anonymous_id` cookie | `lib/server/agent-runtime/owner.ts:3, 61, 65` |
| Target owner | `acct:<id>` from a live `openmaic_session` cookie | `lib/server/accounts/service.ts:79, 82` (WT) |
| Device learner key | `anon:<uuid>` kept in device KV scope; a runtime partition key, not an owner id | `lib/runtime/learner-key.ts:17, 36, 41` |

The source is read only from the `anonymous_id` cookie. It is never read from a request body, a query string, or the `x-learner-key` header. The `anon:` prefix is used for two namespaces. The claim touches only the first.

## 1. Problem

Sign-in sets only the session cookie (`app/api/auth/login/route.ts:33`, WT). Work created under the anonymous owner stays there, and nothing moves it. The loss remains until this is built (`scrum/DECISIONS.md:47`).

## 2. Scope

| Kind | Stored in | Owner recorded as | Cite |
|---|---|---|---|
| Documents (courses) | `document_stages` (`owner_id`, nullable); `stage_meta` (`owner_id`, `is_public`, `deleted_at`); `document_scenes` and `document_outlines` keyed by `stage_id` | Both `document_stages.owner_id` and `stage_meta.owner_id`. The persist upsert updates only when they match | `packages/@openmaic/storage/src/document/pg.ts:76-87, 102-116, 632`; `lib/persistence/stage-meta.ts:25-30` |
| Folders | `document_folders`, PK `(owner_id, id)`, UNIQUE `(owner_id, normalized_name)` | `owner_id` | `pg.ts:59-68` |
| Agent sessions | `agent_sessions` | `owner_id` | `packages/@openmaic/storage/src/agent-session/pg.ts:91-93` |
| Session children | `agent_session_events`, `agent_session_entries`, `agent_session_urls`, `agent_session_materials` | `session_id` foreign key, cascade; no owner column | `agent-session/pg.ts:171-172, 182-183, 279-280`; `packages/@openmaic/storage/src/material/pg.ts:56-58` |
| Owner event feed | `agent_owner_session_event_counters`, `agent_owner_session_events` | `owner_id` | `agent-session/pg.ts:201-216` |
| Skills | `agent_user_skill` | `owner_id`; unique `(owner_id, name)` where not deleted | `packages/@openmaic/storage/src/skill/pg.ts:51-53, 71-72` |
| Materials (library) | `owner_material`; bytes at `oss_key` | `owner_id`. Object key built as `ownerMaterialObjectKey(ownerId, id)` | `lib/persistence/owner-materials.ts:103-117`; `app/api/materials/route.ts:85, 229` |

Three write surfaces reach documents. All of them end in `createOwnerBoundDocumentStore` (`lib/persistence/owner-bound-document-store.ts:173-247`): the embedded persistence route calls it directly (`app/api/persistence/[...path]/route.ts:93-98`); the stage routes (`app/api/stages/route.ts:50`) and the agent runner reach it through `getOwnerScopedDocumentStore` (`lib/server/agent-runtime/owner-scoped-documents.ts:35-49`). The check therefore goes in one place.

Out of scope (see §13): device learner runtime (`packages/@openmaic/storage/src/runtime/pg.ts:69-78`); classroom files, which have no owner (`lib/server/classroom-storage.ts`, zero owner references, WT); usage rows, which have no owner (`lib/server/usage-storage.ts:89`); assets, which share one principal (`app/api/persistence/[...path]/route.ts:141`); the accounts tables.

## 3. Claim log (reversible)

Three additive tables (no `ALTER` on `accounts`, as D-05 requires). Create them in a new `ensureClaimSchema`, called in the bootstrap sequence at `lib/persistence/server-provider.ts:49-55`, next to `ensureAccountSchema` (`:54`).

```sql
CREATE TABLE IF NOT EXISTS owner_claim (
  claim_id       TEXT PRIMARY KEY,
  source_owner   TEXT NOT NULL,
  target_owner   TEXT NOT NULL,
  account_id     TEXT NOT NULL REFERENCES accounts (id),
  preview_digest TEXT NOT NULL,
  state          TEXT NOT NULL CHECK (state IN ('applied', 'reversed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at    TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS owner_claim_item (
  claim_id          TEXT NOT NULL REFERENCES owner_claim (claim_id),
  seq               BIGSERIAL,
  kind              TEXT NOT NULL CHECK (kind IN
                      ('stage', 'folder', 'session', 'session_event', 'skill', 'material')),
  item_id           TEXT NOT NULL,
  original_owner    TEXT NOT NULL,
  new_owner         TEXT NOT NULL,
  original_name     TEXT,
  new_name          TEXT,
  original_event_id TEXT,
  new_event_id      TEXT,
  PRIMARY KEY (claim_id, seq)
);
CREATE TABLE IF NOT EXISTS owner_claim_tombstone (
  owner_id   TEXT PRIMARY KEY,
  claim_id   TEXT NOT NULL REFERENCES owner_claim (claim_id),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- **One item row per moved identifier.** A stage writes one `stage` row covering `stage_meta` and `document_stages`. Each folder, session, skill and material writes one row. Each owner event writes one `session_event` row with `original_event_id` and `new_event_id`.
- **Rule.** Every row whose owner column changes is logged. Rows keyed only by a parent id (scenes, outlines, session entries, session events, URLs, session materials) keep their own values and move with the parent, so they are not logged. [Inference] Those parent-only keys (§2) make this safe. The reversal test (T10) checks it.
- **Log and move commit together** (§4.1).
- **Reversal** is an operator procedure. No admin role exists at HEAD (no match for `ADMIN_USERNAMES` under `lib/` or `app/`). One transaction: refuse with `CLAIM_DRIFT` if any moved item's owner or name no longer equals `new_owner` or `new_name`. Otherwise restore owner and name, re-key events to `original_event_id`, delete the tombstone, and set `state = 'reversed'`. A reversed source cannot be claimed again.

## 4. Single transaction, tombstone, create checks

**4.1 One transaction.** All moves and log writes use one connection and one `BEGIN … COMMIT`, as `nodePostgresTransaction` does (`lib/server/agent-runtime/store.ts:28-43`). Do not call `mergeOwner`: it opens its own transaction (`agent-session/pg.ts:1615-1617`). Move its body into a function that takes the caller's transaction, and keep `mergeOwner` as a wrapper.

**4.2 Tombstone and decision to refuse.** The source gets an `owner_claim_tombstone` row in the same transaction. Every create path checks it inside its own transaction and refuses with `OWNER_CLAIMED` (409). **Decision: refuse, never redirect.** A write from the source is refused. It is never redirected into the account, because the account holder did not make it.

The existing `resolveFinalOwner` seam is not used for this. Its contract is the retirement seam: it runs as the transaction's first statement and returns the owner a create should use (`packages/@openmaic/storage/src/agent-session/types.ts:501-508`). That is a redirect, which this spec rejects. `readRetirement` calls the same hook (`agent-session/pg.ts:1603-1613`) on each heartbeat, and the owner-events route treats any rejection as transient and retries (`app/api/agent/owner-events/route.ts:271-300`, WT). A refusal inside that hook would be swallowed by the retry loop and would mix two meanings of "retired". A new hook is added instead (step 2 in §12).

**4.3 Where the check goes.**

| Create path | Entry point | Check position |
|---|---|---|
| Documents and folders | `withTransaction`, `owner-bound-document-store.ts:179-182` | First statement, before the fence (`:186`) and the stage lock (`:188`). Also covers the folder path, which skips the stage lock (`:187`) |
| Agent sessions | `createSession`, `agent-session/pg.ts:527-530` | New hook `assertOwnerWritable(tx, ownerId)` as first statement |
| Skills | `create`, `skill/pg.ts:227-241` | Before the existing owner lock at `:241` |
| Materials | register transaction, `owner-materials.ts:294-300` | Before the quota lock at `:300` |

Session children (messages, titles, cancel, session materials) need no check. Their writes go through a session lookup filtered by owner (`agent-session/pg.ts:593, 616, 637, 656, 677`; for session materials, `lib/server/agent-runtime/session-materials.ts:290-294`). The session row moves, so the source's lookups match nothing after the claim.

```sql
-- Create paths, first statements, in this order (section 5, L1)
SELECT pg_advisory_xact_lock_shared(hashtextextended('owner-claim:' || $1, 0));
SELECT 1 FROM owner_claim_tombstone WHERE owner_id = $1;  -- row present: refuse OWNER_CLAIMED
```

Why an advisory lock: a create cannot lock a row that does not exist yet. [Inference] A plain existence check races with a claim that commits between the check and the insert (READ COMMITTED). This is not tested; T5 tests it. The claim takes this key exclusively first, so in-flight creates finish before it reads, and later creates see the committed tombstone.

**4.4 Owner columns move together.** `document_stages.owner_id` and `stage_meta.owner_id` change in one transaction. The persist upsert updates only when the owners match (`document/pg.ts:632`). A half-moved stage would fail its next save with a not-found error (`pg.ts:646-651`).

**4.5 Batch flag.** The claim is a batch writer. It sets `SET LOCAL openmaic.suppress_stage_notify = 'on'` (`document/pg.ts:142-147`). Revisions still bump.

**4.6 Preconditions, refused without waiting.**
- Any source session with `status IN ('queued', 'running') AND deleted_at IS NULL` gives `SESSIONS_ACTIVE` (`agent-session/pg.ts:102, 112`). A running session's document writes are bound to the source owner (`owner-bound-document-store.ts:195`). [Inference] So they would fail mid-run.
- Target account disabled (`disabled_at`, `lib/server/accounts/store.ts:18`): refuse. Re-check inside the transaction.

**4.7 Name collisions.** Folders are unique per owner (`document/pg.ts:67`); skills are unique per owner (`skill/pg.ts:71-72`). A moved item gets a suffix: `Unit 1 (2)` for folders, `my-quiz-2` for skills. Skill names must match `^my-[a-z0-9]+(?:-[a-z0-9]+)*$` and stay within 64 characters (`skill/pg.ts:63-64`). The original name goes in `owner_claim_item.original_name`. **Decision: rename. Do not merge, do not skip.**

## 5. Lock order (agent-session store)

**Rule.** A transaction may take a lock only when every lock it already holds comes earlier in this table. Within a level, take locks in the order shown.

| Level | Lock | Taken by | Source |
|---|---|---|---|
| L1 | Owner locks, per owner, owners in sorted order: (a) `owner-claim:<owner>` advisory; (b) `hashtext(owner)` skill lock; (c) `owner-materials:<owner>:quota` | Claim: exclusive on both owners. Creates: (a) shared on their own owner, then (b) or (c) as today | `agent-session/pg.ts:1643` (sort); `skill/pg.ts:241`; `owner-materials.ts:228-229, 300` |
| L2 | `agent_sessions` rows, `FOR UPDATE`, `ORDER BY id` | Claim, following `mergeOwner` (`pg.ts:1625-1629`). Document write fence takes `FOR SHARE` (`pg.ts:864-878`) | |
| L3 | `agent_owner_session_event_counters` rows, `ORDER BY owner_id` | Claim (`pg.ts:1651`); `appendProjection` after its session row (`pg.ts:1488-1501`) | |
| L4 | `agent_owner_session_events` rows | Claim: move and renumber (`pg.ts:1655-1677`) | |
| L5 | `stage_meta` rows, `ORDER BY stage_id`, `FOR UPDATE` | Claim; document write (`owner-bound-document-store.ts:188-190`) | |
| L6 | `document_stages` rows, `ORDER BY id`, `FOR UPDATE` | Claim; save (`document/pg.ts:669-670`). Companion revision tables: stage before scene (`document/pg.ts:129-133`) | |
| L7 | `document_folders`, `owner_material`, `agent_user_skill` rows, `ORDER BY id` | Claim | |
| L8 | Inserts into `owner_claim`, `owner_claim_item`, `owner_claim_tombstone` | Claim | |

**Existing paths checked against the order.**
- `appendProjection`: session row (L2), then counter (L3). Consistent.
- Runner document write: fence (L2, `pg.ts:864-878`, `owner-bound-document-store.ts:186`), then `stage_meta` (L5), then document rows (L6). Consistent.
- The second fence call at `owner-bound-document-store.ts:218` asks for L2 again after L5 and L6. The transaction already holds that row share lock from line 186, so the request does not wait. [Inference] Standard row-lock behaviour within one transaction. Test T6 covers it.
- `mergeOwner`: sessions (L2), counters (L3), events (L4). Consistent.
- Creates: L1, then L2 (the new session row), then L3. Consistent.

**Forbidden.** Taking an L1 to L4 lock while holding an L5 or L6 lock. A claim never calls a document or session write from inside its own lock sequence.

```ts
// Claim transaction, opening sequence only (lib/server/accounts/claim.ts, new)
await tx.query('BEGIN');
for (const owner of [sourceOwner, targetOwner].sort()) {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`owner-claim:${owner}`]);
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [owner]); // skill/pg.ts:241
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `owner-materials:${owner}:quota`, // owner-materials.ts:228-229, 300
  ]);
}
// then L2 to L8 in table order; re-compute the preview digest here
```

## 6. Device-keyed runtime data: never moved

Keys that stay on the device:

1. **Device learner key** `runtime.learnerKey`, device KV scope (`lib/runtime/learner-key.ts:17, 41`). It is never synced across devices (`learner-key.ts:5-7`).
2. **Runtime rows with an `anon:` learner key.** `runtime_sessions.learner_key` (`runtime/pg.ts:72`). For an anonymous request the key is the client's `x-learner-key` header (`lib/persistence/server-auth.ts:111-112`; `app/api/persistence/[...path]/route.ts:146`). PBL runtime sessions are listed and hydrated by learner key (`lib/pbl/v2/runtime/hydration.ts:107-119, 195-197`). [Inference] PBL state is stored in these rows.
3. **Any `x-learner-key` value.** The server refuses `acct:` values from headers (`server-auth.ts:95`).

Consequences:
- The claim never calls the runtime merge. The storage server exposes `POST /runtime/learners/merge` (`packages/@openmaic/storage/src/server/index.ts:613-641`). The app denies it (`app/api/persistence/[...path]/route.ts:155`). Keep it denied.
- `lib/runtime/learner-key.ts:8` names `RuntimeStore.mergeLearner` as the future sign-in migration path. **This spec overrides that comment.** The build must update it.
- When signed in, the client's learner key becomes `acct:<id>` (`app/api/auth/session/route.ts:29`; `lib/persistence/bootstrap.ts:78-79`). The account's runtime starts empty. This is the accepted loss.

## 7. Flow

1. **Preview**: `POST /api/auth/claim/preview` (new). Requires a live session (`resolveRequestAccount`, `lib/server/accounts/runtime.ts:60`, WT). Reads the source from the cookie. Returns, per kind: counts, live titles, the names that would be suffixed, `blockers` (§4.6), and `previewDigest`, a SHA-256 over the sorted `(kind, id, name)` list. Writes nothing.
2. **Confirmation** (`components/account/account-dialog.tsx`, `account-control.tsx`). Shown as a choice, with no pre-selected default: "This browser has N courses, F folders, S sessions, K skills and M files made without signing in: [titles]. Other people who use this browser may have made some of them. Move them to this account, or leave them on this browser."
3. **Claim**: `POST /api/auth/claim` (new), body `{ claimId, previewDigest }`. `claimId` is a client-generated UUID, used as the idempotency key.
   - Recompute the digest inside the transaction, after L1. Mismatch gives `PREVIEW_STALE` (409) and moves nothing.
   - Same `claimId` and same account: return the stored result (200). Different account, or a different claim for the same source: `OWNER_CLAIMED` (409).
   - On success, clear the cookie with the attributes of `lib/server/agent-runtime/owner.ts:22-28` and `Max-Age=0`. The next anonymous request mints a new owner. Failed claims leave the cookie in place.
   - Refuse cross-site requests with `isCrossSiteRequest` (`lib/server/accounts/http.ts:29`, WT), as sign-in does.
4. **Client after success**: close the owner-event streams, reopen them without a cursor, and reconcile the session list. Use the protocol in `app/api/agent/owner-events/route.ts:284-288` (WT). Do not emit `owner_moved` for a claim. That event sends the new owner id to the stream holder (`owner-events/route.ts:289-294`, WT), and a claim must not disclose the account's owner id to the anonymous side.

## 8. Concurrency

- **Two tabs, one browser.** Both tabs share the cookies. A stale preview fails the digest (`PREVIEW_STALE`), and the tab re-previews. A create in the other tab waits on L1, then gets `OWNER_CLAIMED`. Reads by id still work until the cookie is cleared (D-01, capability reads).
- **Double submit.** The same `claimId` is idempotent. A second `claimId` for the same source gives `OWNER_CLAIMED`.
- **Two people, one browser.** Anonymous data belongs to the browser cookie, not to a person (`owner.ts:61, 65`). A second person who signs in can move the first person's anonymous work. The preview lists titles and says the browser may be shared. "Leave on this browser" is one click. This is an accepted risk (§13).
- **Same account, two devices.** Each device has its own source, so both claims can apply. Name collisions are settled under L7 inside each transaction (§4.7).
- **Account creates during a claim.** A folder created under the target waits on the target's L1 lock. If a unique violation still occurs, the whole claim rolls back. The client retries once. A second failure returns `CLAIM_RETRY` (503).

## 9. Failure behaviour

- **Failure inside the transaction** (database error, unique violation, digest mismatch): full rollback. No tombstone, no log rows, no moved rows, and the anonymous cookie is kept. The session cookie from sign-in stays. The UI says "Signed in. This browser's work was not moved", with a retry button.
- **Response lost after commit**: the retry sends the same `claimId` and gets the stored result (§7.3).
- **No partial claim inside the database.** Byte objects are neither copied nor renamed. `oss_key` keeps its original object name, and readers use the stored key (`lib/persistence/owner-materials.ts:180`). [Inference] No reader rebuilds the key from the owner. Test T10 checks it.
- **Soft-deleted rows** (`deleted_at` set) move too, so no row stays under a tombstoned source. They are not counted in previews.
- **Logs** record `claimId`, counts and error codes. They never record titles or content.
- **Reversal drift**: refused with `CLAIM_DRIFT` and the list of drifted items. Never a partial reversal.

## 10. Tests

| # | Test | Lane | Cost |
|---|---|---|---|
| T1 | Claim moves exactly the previewed set and nothing else | Unit, in-process test database (`lib/server/accounts/store.ts:2-4`) | M |
| T2 | Digest mismatch gives `PREVIEW_STALE`; no row changes | Unit | S |
| T3 | Replay with the same `claimId` returns the stored result; another account gets `OWNER_CLAIMED` | Unit | S |
| T4 | Tombstone refuses each create path (document save, folder create, session create, skill create, material register) with `OWNER_CLAIMED`; row counts unchanged | Unit, one case per path | M |
| T5 | Create under the source during a claim: either before the claim (moved) or refused; no row left under the source | Real-database lane, as `tests/agent-runtime/session-events-live.pg.test.ts:16` (`PG_CONTRACT_URL`) | L |
| T6 | Lock-order regression: claim, save, session append and fence interleaved over 200 runs; no deadlock | Real-database lane | L |
| T7 | After a claim, the next save of each moved stage succeeds (catches half-moved owners, `document/pg.ts:632`) | Unit | S |
| T8 | A queued or running session blocks the claim with `SESSIONS_ACTIVE`; nothing moves | Unit | S |
| T9 | Name collisions get the right suffix; skill names stay within 64 characters; original names logged | Unit | S |
| T10 | Reversal restores owners, names and event ids; drift gives `CLAIM_DRIFT` and changes nothing; stored `oss_key` values unchanged | Unit | M |
| T11 | Device keys untouched: `runtime_sessions` rows with an `anon:` learner key and `x-learner-key` values unchanged | Unit | S |
| T12 | Cookie cleared only on success | Route | S |
| T13 | No session gives 401; cross-site gives refusal | Route | S |
| T14 | Shared browser: preview shows the titles; the default action is "leave" | UI | M |
| T15 | Logout leaves anonymous data in place (documents the known gap, §13) | Route | S |

The vitest include glob also matches `*.pg.test.ts` (`vitest.config.ts:11`). The real-database suites are gated by `describe.skipIf(!contractUrl)` (`tests/agent-runtime/session-events-live.pg.test.ts:51`). Without `PG_CONTRACT_URL`, T5 and T6 are skipped, not run. [Unverified] Whether CI sets that variable.

## 11. Rollback

- **Switch.** `ACCOUNT_CLAIM_ENABLED` (new, default off). When off, both routes return 404 and the prompt is hidden. This is the first step in an incident.
- **Schema.** Additive only, so nothing to roll back. Tombstones stay valid with the switch off. They refuse creates only under sources that were already moved.
- **Data.** Reverse each claim (§3). Drift refusal means a reversal cannot overwrite later work.
- **Code.** Deploy the previous build. Removing the create checks would let creates land under a moved source again, and a stale tab can still hold the old cookie. Ship any reversal with the checks in place.

## 12. Implementation order and cost

| Step | Work | Cost |
|---|---|---|
| 1 | Schema: the three tables in §3, ensured in `server-provider.ts:49-55` | S |
| 2 | Guards, with no tombstones yet: shared owner lock and tombstone check in `owner-bound-document-store.ts:179-186`; new `assertOwnerWritable` hook in `agent-session/types.ts` and its call at `pg.ts:529`; checks in `skill/pg.ts:241` and `owner-materials.ts:300` | M |
| 3 | Extract the `mergeOwner` body into a function that takes a transaction (`pg.ts:1615-1690`) | M |
| 4 | Move function: L1 to L8 (§5) with log writes (§3), including the suffix rules (§4.7) | L |
| 5 | Preview route and digest | S |
| 6 | Claim route: idempotency, cookie clear, cross-site check | M |
| 7 | Reversal procedure (operator script) | M |
| 8 | Client: confirmation dialog, stream reset | M |
| 9 | Tests T1 to T15, written with each step | L |
| 10 | Docs: README account section; `.env.example` entry for `ACCOUNT_CLAIM_ENABLED` | S |

Step 2 ships before step 4. A claim must never run before its guards exist.

## 13. What this spec does not cover

- **Discarding anonymous data, and the shared-browser leak after sign-out.** Logout clears only the session cookie (`app/api/auth/logout/route.ts:22`), and the anonymous owner still resolves (`owner.ts:61`). Known gap; the devil's advocate calls it risk 4 (`scrum/meetings/devils-advocate.md`, section 3).
- **Sign-out-others and session revocation** (D-18).
- **Capability reads by id** of moved documents (D-01).
- **File-backed classrooms and their bearer links.** No owner (`lib/server/classroom-storage.ts`).
- **Device learner runtime.** Never moved (§6). No export is specified.
- **Quotas.** Usage rows have no owner (`usage-storage.ts:89`). Any per-owner document quota is [Unverified].
- **Live work of a disabled account** (D-05 defers this).
- **Multi-account claims and expiring claim tokens.**
- **Legacy documents with `owner_id` NULL** (`document/pg.ts:84`). Count in production: [Unverified].
- **Hosted deployment configuration.** README:94 gives an access code for hosted mode. Whether it has a database is [Unverified].

## 14. Open questions

1. **Shared browsers (most important).** Can product accept that one confirmation by a second person moves the first person's anonymous work? This spec's answer is yes, with a preview and a leave option. It needs product sign-off.
2. [Unverified] Does any production build set `NEXT_PUBLIC_PERSISTENCE` (devil's advocate section 5)? If none does, the persistence route is less central.
3. [Product] Is one session per account required (D-18)? Two sign-ins on different devices each see their own work.
