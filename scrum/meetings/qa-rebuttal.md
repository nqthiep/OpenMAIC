# QA and reliability rebuttal: meeting 01 (role Q)

Date: 2026-10-11. Branch: the meeting branch named in the agenda. Memo answered: `scrum/meetings/qa.md` (reviewed state HEAD `491c409`).
[Partly unverified] Labels: [Verified: file:line], [Measured: how], [Inference], [Unverified]. Scenario results are in-memory runs from this session. Only this file was written.

## 1. Method, state, disclosures

- Read in full: agenda, `qa.md`, `devils-advocate.md`. Also read `platform.md` lines 1-20 and 50-67 to check the devil's advocate's (DA) burst inputs.
- `scrum/DECISIONS.md` was not read. One recursive search matched one of its lines (line 68). I saw it, did not use it, and no position below depends on it. Lines from other memos also appeared in grep output and were not used.
- Working tree drift. At my first git check, uncommitted changes existed in `login-throttle.ts`, `service.ts`, `password.ts`, two tests, and two untracked tests. A later check showed 16 modified and 11 untracked files under `lib/server`, `tests`, and `app/api/classroom`. I did not audit the later changes. Citations marked (WT) are the uncommitted state I read at the first check. Unmarked citations in D-10, D-14, D-16 and D-17 are HEAD, read before those files changed.
- Git was read-only (`--no-optional-locks`, `diff`, `show`, `log`). No test suite was run. The OWASP page could not be fetched (DNS failure). `platform.md:13` reports the same. [Unverified]

Corrections to my memo:
- Throttle and service line numbers in `qa.md` are HEAD numbers.
- Throughput: `qa.md` used 9-10 hashes/s at 2^16, assuming perfect concurrency. The measured pair times in `platform.md:60` give 8.4/s at 2^16 and 4.2/s at 2^17.
- Three points were wrong or missing: the claim that D-07 phase 1 is "not learner text"; the D-10 fallback to `nextUrl.origin`; and the D-14 snippet, which does not clean up after a failed write. The D-17 form also still logs free-text `code` values.

## 2. D-17: diagnostic form and adversarial test

DA: the platform's `slice(1,6)` leaks message text, and my replace-then-first-frame form does not. The DA accepts B with my form and test (DA §1, §4).

- DA leak point: **Accept.** [Measured] With a message holding a fake frame, `stack.split('\n').slice(1,6)` contains the sentinel. My form does not.
- Own finding: **Modify.** A `code` value is logged verbatim. `code: 'SENTINEL CODE'` appears in the log line. [Measured] Proposed: accept `code` and `name` only when they match a token pattern.

```ts
const TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;
function failureSite(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  const named = typeof code === 'string' && TOKEN.test(code) ? code : error.name;
  const label = TOKEN.test(named) ? named : 'Error';
  const trace = (error.stack ?? '').replace(error.message, '');
  const frame = trace.split('\n').find((line) => /^\s+at /.test(line));
  return frame ? `${label} ${frame.trim()}` : label;
}
```

[Measured: 7 in-memory cases] No leak. `42P01` and `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` pass through. Free text becomes `Error`.

The test runs through `runAccountRoute`, not `failureSite` directly, and asserts:
1. No substring of `error.message` appears in any `console.error` argument, including a multi-line message with a fake frame.
2. Exactly one `at` frame is logged, and it is not the injected one.
3. Every logger argument is a string. `lib/logger.ts:18` prints the full stack for an `Error`, and that stack holds the message.
4. A thrown string logs `unknown error` only.
5. `code: '42P01'` logs `42P01 at`. A spaced `code`, or a `name` containing the sentinel, logs `Error at`.

**Position: B** (permanent diagnostic), with this form. Changed by adding the token check, because of the measured leak. Closure rule unchanged. Cost S. Confidence 0.75. Unknown: whether the cycle-2 failure was a timeout or a closed handle. The logs are not in the repo [Unverified].

## 3. D-14: create-only writes without hard links

DA: my `wx` fallback can leave an empty file after a crash, which I conceded. The DA proposes failing with 500 plus a startup probe, and a lock-file fallback if the probe fails (DA §1, §4). Table: B with probe.

- DA empty-file point: **Accept.** A crash between open and write leaves an empty target. `readClassroom` rethrows anything except ENOENT (`lib/server/classroom-storage.ts:90-101`), so GET returns 500 (`app/api/classroom/route.ts:149-160`). POST returns 409 for that id, forever (`route.ts:98-104`). [Verified: HEAD]
- Own finding: **Modify.** A write that fails after the exclusive open (ENOSPC, EIO) leaves a partial file at the final name, and my snippet does not remove it. [Inference: read from the snippet, not executed.] The result is the same permanent 409.
- DA lock-file fallback: **Reject for now.** A lock file has its own stuck state. A crash between lock and release blocks the id until a stale-lock rule expires it [Inference]. That moves the failure rather than removing it. No link-less deployment is documented or measured. `qa.md` measured hard links working on this host.
- DA startup probe: **Accept.**

**Position: B, with a warning-only probe** (was A). Changed because the stuck-id outcome is permanent and silent, while B fails loudly on the first create. Proposed probe, once per process:

```ts
// lib/server/classroom-storage.ts (proposed); log = createLogger('ClassroomStorage')
let linkProbe: Promise<void> | undefined;
export function probeHardLinks(): Promise<void> {
  linkProbe ??= (async () => {
    const a = path.join(CLASSROOMS_DIR, `.link-probe-${process.pid}-a`);
    const b = path.join(CLASSROOMS_DIR, `.link-probe-${process.pid}-b`);
    try {
      await ensureClassroomsDir();
      await fs.writeFile(a, '', 'utf-8');
      await fs.link(a, b);
    } catch (error) {
      log.warn('Hard links unavailable; classroom create will fail', (error as NodeJS.ErrnoException).code ?? 'unknown');
    } finally {
      await fs.rm(a, { force: true });
      await fs.rm(b, { force: true });
    }
  })();
  return linkProbe;
}
```

The probe does not fail startup, since reads and other routes still work. If a real deployment fails the probe, the next step is check-then-rename: write the temp file in full, check that the target is absent, rename it into place, serialized inside the process. That leaves no partial file at the final name, but it keeps a cross-process race. Not built now. Cost S. Confidence 0.65. Unknown: whether any target filesystem refuses hard links. Container bind mounts on non-Linux hosts are [Unverified].

## 4. D-16: error details to clients

DA: the broad scope removes the connection diagnostics BYOK users read. Strip upstream text only when a managed key was used (DA §1, §4). The DA accepts my scope if the text is the user's own key.

- DA BYOK point: **Accept.** The model dialog shows `data.error` (`components/settings/model-edit-dialog.tsx:95`). The ASR settings show `details` first (`components/settings/asr-settings.tsx:184`). [Verified]
- DA managed-key scope: **Accept.** A managed provider uses the server key and ignores the client key. An unmanaged provider uses only the client key (`lib/server/provider-config.ts:603-610`). `isServerConfiguredProvider` (`:580-582`) tells the route which case applies before the upstream call. [Verified: HEAD]
- Own finding: **Modify.** Internal text never goes to a client. That covers link and storage paths (`app/api/classroom/route.ts:118`, which `qa.md` measured as carrying absolute paths), database text, and native errors. No BYOK user gains from them.

Proposed rule: a managed provider gets a fixed message per status (for example, 401 gives "The provider rejected the key"). BYOK keeps upstream text. Internal text is never in the body, and `failureSite` goes to the log. Tests: managed bodies contain neither the sentinel nor the server key; BYOK bodies keep upstream text and never contain the server key; internal bodies contain no path.

**Position: managed-key scope, plus internal stripping** (was A, broad). Changed because the DA's BYOK evidence checks out. Cost M. Confidence 0.7. Unknown: whether upstream provider bodies carry credentials [Unverified].

## 5. D-04: password hashing cost

DA: burst data favors A over B. B admits 9 and returns 503 to 21 at once. C admits all 30 in 7.1 s. B "rejects when more than nine sign-ins land within about four seconds". At 2^17 only C is burst-safe. The 2^17 premise is unconfirmed. The DA accepts A now, and C, not B, if the premise is confirmed (DA §1, §2, §4).

My memo has no burst measurement. I measured per-hash time and derived throughput. A real concurrent burst would load the 4-vCPU host during the coordinator's suite, so I did not run one [Inference].

[Measured: in-memory queue model of `password.ts:79-93`, times from `platform.md:58-60`]

| Scenario | Admitted | Refused | Last finish |
|---|---|---|---|
| 30 at once, A (2^16, 2 active, queue 64, 0.239 s) | 30 | 0 | 3.58 s |
| 30 at once, C (2^17, 2 active, queue 64, 0.475 s) | 30 | 0 | 7.12 s |
| 30 at once, B (2^17, 1 active, queue 8, 0.431 s) | 9 | 21 | 3.88 s |
| 30 at once, B (queue 16) | 17 | 13 | 7.33 s |
| 30 spread over 4 s, B (queue 8) | 17 | 13 | 7.33 s |
| 30 spread over 4 s, C | 30 | 0 | 7.26 s |

- DA figures: **Accept.** They reproduce. The "9" requires queue 8, which the agenda does not set (option B says only "a smaller queue cap").
- DA threshold of nine within four seconds: **Modify.** Nine is the simultaneous limit at queue 8. Spread over four seconds, B admits 17, because completions free slots during the window [Inference].
- DA "only C is burst-safe at 2^17": **Accept.** C admits all 30 at about twice A's latency, with +256 MiB peak per process (`platform.md:65`).
- Own correction: throughput is 8.4/s at 2^16 and 4.2/s at 2^17 (`platform.md:60`, `:67`; not re-measured here).

**Position: A, keep 2^16. No change.** The burst data rejects B, not A. If the 2^17 premise and a memory budget of two 128 MiB derivations per process are both confirmed, choose C. The parse fix is in WT: `password.ts:155` uses `128·r·(N+2) + 128·r·p`, which gives 134,220,800 bytes at 2^17, r=8, p=1 (matches `platform.md:53`). WT adds one boundary test, `(2^16, r=16)`. The `(2^17, 8, 1)` and `(2^18, 4, 1)` cases are not in the diff [Verified: WT `password.test.ts`]. Cost S. Confidence 0.55. Unknown: production memory budget per process. The 2^17 premise is [Unverified].

## 6. D-07: educational content review

DA: learner text comes from templates (`product.md:308` per the DA), so a skill review misses it. Accept only with a sample generation showing skill-caused errors (DA §4).

- DA coverage point: **Accept.** The agent runtime loads these skills at run time. The default directory is `skills/agent-runtime` (`lib/server/agent-runtime/config.ts:44`). Built-in skills are cached from it (`skills.ts:172-174`), and their text is read (`lib/server/agent-runtime/skill-preload.ts:278`, `lib/server/agent-runtime/skills.ts:584`). [Verified: HEAD] Whether those replies reach learners is [Unverified].
- DA sample-generation condition: **Reject as a precondition.** It needs model calls, which a read-only round does not make [Inference].

**Position: A, plus a mechanical pass over templates** (was A). Changed because the skills load at run time, so "not learner text" was wrong. Run the same link and anchor pass on `packages/@openmaic/generation/templates/` and `lib/prompts/templates/`. It is read-only and cheap. Accuracy review of templates stays with an SME in phase 2. Any skill finding that changes an agent reply goes to SME review before the change lands. Cost M. Confidence 0.55 (was 0.6). Unknown: how many learner-facing replies depend on skill text.

## 7. D-10: trust in x-forwarded-host

DA: my fallback to `nextUrl.origin` persists `0.0.0.0` media URLs under the container default, and a code revert does not undo them (DA §1). Relative URLs avoid both problems. Table: C, relative URLs when unset (DA §1, §4).

- DA `0.0.0.0` point: **Accept.** The container sets `HOSTNAME=0.0.0.0` and `PORT=3000` (repo-root image build file, lines 91-92). With both set, the framework builds the request URL from them (`node_modules/next/dist/server/next-server.js:1266`), and that becomes the `nextUrl` base (`node_modules/next/dist/server/web/spec-extension/adapters/next-request.js:94-101`). Formatting keeps `0.0.0.0` (`node_modules/next/dist/server/lib/format-hostname.js:12-14`). With either unset, the base is the dummy `http://n` (`next-request.js:99`). The repo's `next.config.*` sets no `trustHostHeader` [Verified: grep], so `nextUrl.origin` is not the client host. [Inference from the lines above; the default is not set in the repo]
- DA stored-URL point: **Accept.** `mediaServingUrl` embeds the base (`lib/server/classroom-media-generation.ts:77-78`), used at `:155`, `:194` and `:319`, and persisted (`lib/server/classroom-generation.ts:711-718`). [Verified: HEAD]
- DA relative-when-unset point: **Accept for stored URLs.** Relative references already exist: `lib/server/classroom-media-bytes.ts:52`, served by `app/api/classroom-media/[classroomId]/[...path]/route.ts`. The DSL types `src` as `string` (`packages/@openmaic/dsl/src/storage.ts:41`), and the sanitizer has no `src` or URL rule [Measured: grep]. Whether the runtime validator and the renderer accept relative media is [Unverified].
- Own finding: the header is effectively always present (HTTP/1.1 requests carry `Host`). The framework fills `x-forwarded-host` from `Host` and keeps a client-sent value (`node_modules/next/dist/server/base-server.js:574`). So `buildRequestOrigin` (`lib/server/classroom-storage.ts:56-60`) reads a client-controlled value on every request. [Verified: HEAD]
- Own finding: returned links need an absolute origin, stored links do not. `url` (`app/api/classroom/route.ts:108`) and `pollUrl` (`app/api/generate-classroom/[jobId]/route.ts:29`) are returned, not stored. `app/api/agent/sessions/route.ts:147` is a third caller my memo did not list. Its stored-or-returned use is [Unverified]. The dead copy at `lib/server/media-origin.ts:74-80` has no production importer [Verified: grep under `app` and `lib`, HEAD].

Proposed (replaces my memo's version):

```ts
// lib/server/classroom-storage.ts (proposed)
const HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;
const trusted = () => process.env.TRUST_PROXY_HEADERS === 'true';
const scheme = (raw: string | null) => (raw === 'https' ? 'https' : 'http');

/** Written into stored scene data: relative unless the proxy is trusted. */
export function storedMediaOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host');
  if (!trusted() || !host || !HOST.test(host)) return '';
  return `${scheme(req.headers.get('x-forwarded-proto'))}://${host}`;
}

/** Returned to the requester only (share and poll links). Never stored. */
export function responseOrigin(req: NextRequest): string {
  const host = trusted() ? req.headers.get('x-forwarded-host') : req.headers.get('host');
  if (!host || !HOST.test(host)) return '';
  return `${scheme(req.headers.get('x-forwarded-proto'))}://${host}`;
}
```

- With the proxy untrusted, a forged header reaches only the requester's own link, because stored references are relative.
- The protocol still comes from the validated forwarded header. [Inference] That keeps TLS-terminating proxies working, and a forged protocol affects only the requester.
- `generate-classroom` passes one `baseUrl` to media and to `persistClassroom`, which builds `url` (`classroom-generation.ts:717`, `classroom-storage.ts:135`). Split it into the two origins.
- Warn once when `x-forwarded-host` is present and untrusted. Existing absolute URLs stay, so mixed formats coexist, and the renderer must accept both.
- Shipping the relative stored form waits on one check: the renderer and export path must resolve relative media. Not traced here [Unverified]. DA §5 asks the same question.

**Position: Modify. Relative stored references when unset, Host for returned links** (was A). Changed because the container origin error is verified, and my fallback would have stored it. Cost M. Confidence 0.6 (was 0.7). Unknown: whether the renderer and export path resolve relative stored media.

## 8. D-11: per-client throttles and eviction

DA: (a) failures are recorded before derivation, so 503s still count. (b) The cost is requests, not derivations. (c) My refuse-when-full rule, with lazy expiry, keeps a stale map full. (d) 10,000 requests evict the victim. (e) Locked keys should be evicted last, and the per-client threshold must be class-sized (DA §1, §2, §4).

WT facts: a busy-queue refusal is refunded (`lib/server/accounts/service.ts:186-187`, WT). Eviction removes expired keys first, then the oldest key under the limit, and locked keys only when a scan of at most 64 keys finds nothing unlocked (`lib/server/accounts/login-throttle.ts:33`, `:85-113`, WT). The exact rule I accept is this one, with the refund for busy-queue refusals.

[Measured: in-memory, HEAD and WT throttle files; 900 s window, 10,000 keys, 8 failures]

| Scenario | Result |
|---|---|
| HEAD: victim locked; 10,000 other names | victim unlocked |
| HEAD: victim locked; 10,000 refused attempts, no refund | victim unlocked |
| WT: 10,000 refused attempts at a full table, each refunded | 1 unrelated key evicted; victim locked |
| WT: 1,000 admitted failures at a full table | 1,000 unrelated keys evicted; victim locked |
| WT: 63 locked decoys after the victim, table full (10,449 admitted failures) | victim evicted |
| WT: 10,000 keys, 15 min pass, one insert | map size 1 |

- (a) **Reject for WT; accept for HEAD.** WT refunds the refusal. HEAD does not (row 2).
- (b) **Reject for WT; accept for HEAD.** WT evictions track admitted failures (row 4). Refusals evict at most one key, and the refund shrinks the map (row 3).
- (c) **Accept.** My rule is withdrawn. WT removes expired keys when an insert finds the table full (row 6).
- (d) **Reject for WT; accept for HEAD** (rows 1-2 against row 3).
- (e) **Accept.** WT already evicts locked keys last. The per-client threshold is deferred, since the classroom NAT topology is [Unverified].

Bound on row 5: the decoy attack needs about 10,450 admitted failures inside one window. At the pair time in `platform.md:60`, one window admits about 7,560 (900 s x 8.4/s), plus up to 66 queued. That is below 10,000, so one source cannot fill the table within one window at current constants [Inference: depends on production throughput, which is unmeasured, `platform.md:12`]. For WT, this contradicts the DA's §2 note that the throughput bound fails for one name under eviction. Residual path: a database error after recording is not refunded (`service.ts:181-189`, WT). Whether an attacker can cause one is [Unverified].

**Position: accept the WT eviction and refund; refuse rule withdrawn** (was A with refuse-when-full). Changed because the DA's stale-map point holds for my refuse rule, and the measured WT behavior (rows 3, 4, 6) shows an eviction order that does not refuse. Add one regression test for row 3. The per-client key is a separate item with its own threshold. Cost S. Confidence 0.6. Unknown: production scrypt throughput. The bound needs about 11 derivations/s sustained (10,000 over 900 s) to fill the table.

## 9. Final table

| Item | Position after rebuttal | Confidence | Cost | Most important unknown |
|---|---|---|---|---|
| D-17 | B: diagnostic with token-checked site and five-point test (was B; token check added) | 0.75 | S | Whether the cycle-2 failure was a timeout or a closed handle |
| D-14 | B: fail on link-less volume, warning-only probe, no lock-file fallback (was A) | 0.65 | S | Whether any target filesystem refuses hard links |
| D-16 | Managed-key upstream text stripped; BYOK kept; internal text always stripped (was A) | 0.7 | M | Whether upstream provider bodies carry credentials |
| D-04 | A, keep 2^16 (no change); add two missing boundary tests | 0.55 | S | Production memory budget per process; the 2^17 premise |
| D-07 | A on skills, plus template mechanical pass (was A) | 0.55 | M | How many learner-facing replies depend on skill text |
| D-10 | Relative stored references when unset; Host for returned links (was A) | 0.6 | M | Whether the renderer and export path resolve relative media |
| D-11 | Accept WT eviction and refund; refuse rule withdrawn; per-client key deferred (was A) | 0.6 | S | Production scrypt throughput (bound needs about 11/s) |
