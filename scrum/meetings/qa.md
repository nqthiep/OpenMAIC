# Meeting 01: QA and reliability memo (role Q)

Date: 2026-10-11. Branch: `claude/hopeful-sagan-267tw5`. Reviewed state: HEAD `491c409`.
Label key: `[Verified: file:line]`, `[Measured: how]`, `[Inference]`, `[Unverified]`.
[Unverified] items are marked inline. Because some parts of this memo are unverified, the memo as a whole carries that label.

## Method and limits

- Read: the agenda, `scrum/BACKLOG.md`, `tests/accounts/routes.test.ts`, `lib/server/accounts/{http,password,service,login-throttle,runtime}.ts`, and the storage, route and test files cited below. Read git history for `8b1bfb8` and `4aaf631` (no state change).
- Measured with Node 22.22.0 and the repo's PGlite 0.3.16 (`node -e`, in memory, no files written). The throttle was probed by transpiling `login-throttle.ts` in memory with the repo's `typescript` package.
- No test file was run. A run would add load to the coordinator's full run on 4 vCPUs [Inference].
- Not published as an Artifact. The task allows only this file to be created, and publishing would need an HTML file.

## Corrections to the agenda (checked against code)

1. The 503 mapping covers only scrypt failures reported through the callback. [Verified: `lib/server/accounts/password.ts:110-111`] [Verified: `lib/server/accounts/http.ts:139-141`] A synchronous throw from `scrypt()` is not wrapped: the call sits inside the Promise executor [Verified: `password.ts:109-114`], so it returns 500. [Measured: `scryptSync` and `scrypt` throw `RangeError ERR_CRYPTO_INVALID_SCRYPT_PARAMS` synchronously at N=2^17, r=8, maxmem 128 MiB, and for N=3.] The agenda's "a recurrence of the second kind would show as 503" holds only for the callback kind.
2. `apiError` sends `details` only when a caller passes it. [Verified: `lib/server/api-response.ts:58-73`] Nine call sites pass details, and fourteen send caught error text in the main `error` field (see D-16).
3. "The upgrade needs no migration" holds for reading old hashes. Raising the cost alone breaks new registrations, because the memory ceiling is too low for 2^17. [Measured: see D-04.] The parse ceiling also has a latent defect at today's cost: three exact-boundary combinations pass the check and then fail in `scrypt`. [Measured: see D-04.]
4. The second `x-forwarded-host` reader, `lib/server/media-origin.ts:74-80`, has no production caller. [Verified: ripgrep finds no import of `media-origin` and no call of `requestOrigin` or `resolveMediaServingOrigin` outside that file under `app`, `lib`, `packages`.] Only `tests/server/media-origin.test.ts` imports it. The live path is `buildRequestOrigin` alone (`lib/server/classroom-storage.ts:56-60`). D-10 therefore changes one live function, plus the dead copy.
5. The per-username throttle can be cleared by other names. [Measured: see D-11.]
6. B26 counts disagree. `scrum/BACKLOG.md:119` says "two of five full runs"; `:127` says "seen in three full runs"; `:75` says "two earlier full runs". The two failing runs are consistent; the denominator is not.
7. The commit message for `4aaf631` states the cause as fact: "one instance intermittently failed every query". [Verified: commit `4aaf631`.] B26 says "Mitigated, not proven" [Verified: `scrum/BACKLOG.md:119`].

---

## D-17 Intermittent account-route failure (B26). Main owner.

**Recommended option: B, with a corrected diagnostic, and a closure rule of 14 consecutive clean full runs.** Not A, not C.

### Evidence

- [Verified: `tests/accounts/routes.test.ts:65-69`, `:79`] One shared PGlite database, schema applied once, account tables truncated before each test.
- [Verified: commit `4aaf631` diff] The old design created a database per test and closed it in `afterEach`. The current design closes it once in `afterAll` (`routes.test.ts:88-89`).
- [Verified: `node_modules/@electric-sql/pglite/dist/index.js:3`, `index.cjs:12`] A query after close throws a plain `new Error("PGlite is closed")` (or `"PGlite is closing"`). A plain `Error` is exactly the name B26 reports for "every query in one window". A closed handle matches the log as well as a failed instance does.
- [Verified: `lib/server/accounts/http.ts:143`] The generic branch logs `error.name` only. `Error` cannot separate a closed handle, a failed instance, or another plain error.
- [Verified: `lib/logger.ts:16-19`] Passing an `Error` object prints its message and stack. The 500 test asserts that DB error text never reaches `console.error` (`routes.test.ts:534`). The diagnostic must therefore pass strings only.
- [Measured: Node 22.22.0] First stack frame by error type. A PGlite SQL error has SQLSTATE `code` `42P01`, `name` `error`, and its first frame in the PGlite bundle. A synchronous scrypt error has `code` `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, `name` `RangeError`, and its first frame `Object.scryptSync (scrypt)`.
- [Measured: 12 PGlite instances created and closed in one process, with `gc()`] RSS rose from 50 MB to 377 MB at the first instance, peaked at 604 MB at the third, and settled near 456 MB. Instance count alone does not grow memory steadily, so "about a dozen instances" is weak as a cause.
- [Verified: `routes.test.ts:22`] `ROUTE_TIMEOUT_MS` is 30 s. [Inference] Vitest runs `afterEach` after a timed-out test. In the old design, that closed the handle while the timed-out test's route calls were still running, and those calls then failed with "PGlite is closed". The shared design removes that path. It also means a timed-out test's writes can reach the next test's rows [Inference].
- [Inference, counted by reading] The file runs about 20 scrypt derivations. The 429 test alone runs 9 (`routes.test.ts:385-397`). Registration hashes before the taken-name check (`lib/server/accounts/service.ts:130`, then `:136-138`), so a taken name also costs one derivation.
- [Verified: `routes.test.ts:397`] The 429 test compares only statuses. A failure report shows 500 or 503 with no `errorCode`.
- [Verified: `password.ts:110-111`, `http.ts:139`] A callback-reported scrypt failure logs "Password check unavailable". B26 says the second failure logged no busy warning. So under the current build, a plain-`Error` derivation failure cannot come from the callback path.
- [Verified: git log] `8b1bfb8` (503 mapping) and `4aaf631` (shared DB) were committed one second apart, 04:17:22 and 04:17:23. [Inference] The failing runs predate `4aaf631`, because B26 describes them against the per-test design. The repo does not record whether they also predate `8b1bfb8`.

### What is not known

- Which function threw the plain `Error` in the failing window: a closed handle (`PGlite._checkReady`), a failed PGlite instance (a frame in its query path or bundle), or a native scrypt call (`node:internal/crypto` or `password.ts`). [Unverified: the cycle-2 logs are not in the repo.]
- Whether the failing test reported "Test timed out" or a status mismatch. B26 says status. [Unverified]
- Whether the derivations in the window were reached at all. If the DB query failed first, no derivation ran.

### The single diagnostic

The first stack frame of the caught error (function and file), plus its string `code` when present. The message is never logged. The message is removed from the stack before the frame is taken, because a message can contain text shaped like a frame.

```ts
// lib/server/accounts/http.ts (proposed)
function failureSite(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  const label = typeof code === 'string' ? code : error.name;
  const trace = (error.stack ?? '').replace(error.message, '');
  const frame = trace.split('\n').find((line) => /^\s+at /.test(line));
  return frame ? `${label} ${frame.trim()}` : label;
}
// generic branch of runAccountRoute: log.error('Account request failed', failureSite(error));
```

How the frame separates the cases: `PGlite._checkReady` means a closed handle (a test-lifecycle bug). A frame in PGlite's query path means the instance failed. `scrypt`, `node:internal/crypto`, or `password.ts` means a native scrypt call failed. The SQL-error and sync-scrypt shapes are [Measured]. The closed-handle frame name is [Inference] from `index.js:3`.

Adversarial test, to add to `tests/accounts/http-busy.test.ts`:

```ts
it('logs a failure site, never the message', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await runAccountRoute(async () => {
    throw new Error('SENTINEL-X\n    at injected (evil.js:1:1)');
  });
  const logged = log.mock.calls.flat().join(' ');
  expect(logged).not.toMatch(/SENTINEL-X|injected/);
  expect(logged).toMatch(/ at /);
});
```

### Acceptance rule (closing the item)

- Close after **14 consecutive clean full runs** on one commit. The count starts at the commit that adds the diagnostic. Any failure resets the count, and its failure site must be recorded before counting restarts.
- Why 14: P(14 clean | per-run failure 0.2) = 0.8^14 = 0.044 [Inference]. Three clean runs give P = 0.216 at a 0.4 rate [Inference], so three runs cannot separate a 40% flake from a fixed file. The pre-fix estimate, 2 of 5, is too few to estimate a rate.
- Cost: about 14 × 4 min, roughly 56 minutes serial [Verified: `scrum/BACKLOG.md:75` gives four minutes].
- Evidence per run, one JSON file per run, kept outside the test output: commit SHA and empty `git status --porcelain`; the Vitest JSON report with file and test counts (baseline 718 files and 8,019 tests on the cycle-2 state, or a recorded change); the duration and status of `routes.test.ts`; every `[AccountsRoute]` line; `uptime` and `free -m` at start and end; host identity.
- Stronger alternative, not tried: reproduce the failure on the pre-`4aaf631` layout under induced load, then run 20 stressed runs of the current layout with zero failures. [Unverified: reproduction not attempted.] If it reproduces, use this instead of the count.

### Test design to reduce flake risk

1. Health probe first in `beforeEach`: `await db!.query('SELECT 1')`, then the TRUNCATE. A dead handle then fails in the hook, named as a database problem, and not inside a route test.
2. Track route promises and drain them in `afterEach`, bounded (for example 5 s). Wrap the four handlers in `loadRoutes()`. This keeps a timed-out test's writes out of the next test's rows.
3. In the 429 test, compare `{status, errorCode}` pairs, not bare statuses (`routes.test.ts:397`).
4. Do not add `retry` to this file. A retry hides recurrences and makes the 14-run count meaningless.
5. Keep production scrypt cost in the test. Replace the stale comments that say "roughly 50-150 ms" (`routes.test.ts:21`, `password.test.ts:13`, `service.test.ts:22`). Measured: 194-211 ms at 2^16 and 400-467 ms at 2^17.
6. Do not choose C. Removing PGlite removes the only SQL execution on the account routes, and B25 says no real-Postgres test exists [Verified: `scrum/BACKLOG.md:118`]. C would lose coverage without answering the root-cause question.

**Strongest argument against B:** the diagnostic only pays off after a recurrence. At 2 of 5 before the fix, the next failure may be several runs away, so the team carries code for an unresolved flake. Response: the 14-run rule keeps closure honest, and the diagnostic makes the next failure useful.

- **Cost:** S (one helper, one log call, one test), plus about one hour of CI for the rule.
- **Reversal:** delete the helper and the test. No data involved.
- **Confidence:** 0.7.
- **What would change my mind:** (a) the cycle-2 logs show "Test timed out" for the failing tests. The fix is then the timeout budget and the drain, and a targeted stress run can replace the count. (b) The failing runs came from a build before `8b1bfb8`. Scrypt callback failures are then already covered, and only the DB side remains. (c) A recurrence shows a failure site in `node:internal/crypto` for a synchronous throw. That case needs the stress rig, not the count.

---

## D-14 Create-only writes where hard links are unsupported (B22)

**Recommended option: A, restricted to `EPERM` and `ENOTSUP`. Drop `EXDEV`.**

### Evidence

- [Verified: `lib/server/classroom-storage.ts:39-50`] The temp file and the target sit in the same directory, so they share a device. [Inference] `EXDEV` cannot occur on these paths. Keeping it in the fallback adds nothing and could hide a real mount fault.
- [Verified: `classroom-storage.ts:33-37`] The doc comment promises that no reader sees a partial file. An exclusive-create fallback drops that promise.
- [Verified: `app/api/classroom/route.ts:98-105`] `createOnly` is used only by `POST /api/classroom` (`:95`). Other errors are rethrown to the outer catch.
- [Verified: `app/api/classroom/route.ts:109-121`] The outer catch returns 500 with `error.message` as `details`. On a link failure, that message carries the filesystem error.
- [Measured: failing `fs.linkSync` into a missing directory, creates nothing] The message is `ENOENT: no such file or directory, link '<src>' -> '<dst>'`, so both absolute paths reach the response body. The `EPERM` text will have the same shape [Inference].
- [Measured: `df -T`] This host is ext4 (`/dev/vda`). Hard links work here, so the fallback cannot be triggered naturally. Only a mock tests it on this host.
- [Verified: `tests/server/classroom-create-only.test.ts:33-107`] Five tests. None covers a link failure.
- [Unverified] No deployment document records the filesystem for `data/`. Docker bind mounts on some hosts may refuse hard links.

### Test design

- Spy on `fs.promises.link` to reject with `EPERM`. Assert: the final file holds the complete JSON; no `.tmp` file remains; a second create returns 409; and "lets exactly one of two concurrent creators succeed" (`:55`) passes with the spy active.
- Spy to reject with `EIO`. Assert that the error propagates and nothing falls back silently.
- Route test: `POST /api/classroom` with the `EPERM` spy returns 201. If the fallback is not adopted, the response body contains no path (after the D-16 change).
- Deployers: a one-off probe that links and removes a scratch file in `data/classrooms`, to record the errno on each deployment filesystem.

```ts
// classroom-storage.ts, inside the try, after the temp file is written
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== 'EPERM' && code !== 'ENOTSUP') throw error; // EEXIST and others propagate
  await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
}
```

**Strongest argument against A:** the fallback silently weakens crash safety on exactly the filesystems that lack hard links. A crash between open and write leaves an empty file at the final name. That id then answers 409 forever, and reads fail with a JSON parse error [Inference]. The id is client-chosen, so the blast radius is one id.

- **Cost:** S.
- **Reversal:** remove the catch. Complete files already written are valid JSON. An empty file left by a crash needs manual deletion.
- **Confidence:** 0.6.
- **What would change my mind:** a deployment that must use hard links and cannot change its filesystem. Then B, with the D-16 change and a startup warning. Or a crash test that shows the empty-file window is not reachable [Inference: I expect it is].
- **Unknown:** whether any deployment filesystem refuses hard links (run the probe).

---

## D-16 Error details sent to clients (B18)

**Recommended option: A, with scope widened from `details` to all caught-error text.** Cost M.

### Evidence

- [Verified: `lib/server/api-response.ts:58-73`] `apiError` includes `details` only when the caller passes it. The agenda's premise is true for those call sites only.
- Nine call sites send upstream or internal text as `details` (six files):
  - `app/api/export-video/render/route.ts:96` (render-service `data.error`, else `statusText`) and `:110` (fetch error message).
  - `app/api/azure-voices/route.ts:53` (the full Azure error body).
  - `app/api/transcription/route.ts:91` (`error.message`). Provider messages carry upstream text: `lib/audio/asr-providers.ts:249`, `:490`, `:503` (the whole Qwen JSON body), `:583`.
  - `app/api/classroom/route.ts:118` and `:158` (filesystem and storage text, including paths).
  - `app/api/generate-classroom/[jobId]/route.ts:51`.
  - `app/api/stages/[id]/route.ts:55` and `:59` (`ownerApiError` details; validation text).
- Fourteen call sites send caught error text as the main `error` field: `app/api/chat/route.ts:204`; `app/api/chat/pi/route.ts:309`; `app/api/usage/route.ts:113`; `app/api/verify-model/route.ts:33`; `app/api/provider/probe-models/route.ts:64`; `app/api/generate/tts/route.ts:190`; `app/api/generate/voice/route.ts:249`; `app/api/generate/agent-profiles/route.ts:366`; `app/api/generate/scene-outlines-stream/route.ts:714`; `app/api/proxy-media/route.ts:87`; `app/api/parse-pdf/route.ts:91`; `app/api/extract-document/route.ts:652`; `app/api/verify-video-provider/route.ts:83` and `app/api/verify-image-provider/route.ts:91` (both `result.message`).
- [Verified: `lib/media/adapters/openai-image-adapter.ts:48`, `:56`] The connectivity message embeds the raw response body. The verify routes return that message as the main error.
- [Verified: `lib/server/provider-config.ts:852-854`] The verify routes resolve their key through `resolveSectionApiKey`. A request without a client key can therefore use the server key (B5). [Unverified] Whether a provider's 401 body echoes part of the key. Provider behaviour is external and was not tested.
- [Verified: `lib/store/video-render.ts:276-280`] The client concatenates `data.error` and `data.details` into one message, so removing details changes that message.
- [Verified: `lib/logger.ts:13-20`] Existing logs already print raw messages: `app/api/classroom/route.ts:110-113`, `app/api/transcription/route.ts:82-85`, and `app/api/export-video/render/route.ts:105` pass the `Error` object to `log.error`. "Keep it in logs, without credentials" is therefore not true today.
- [Unverified] Whether upstream bodies carry credentials. The repo cannot answer this. What the repo does show: the code forwards whatever upstream returns (`openai-image-adapter.ts:48`, `:56`).

### Verification that can run now

A worst-case stub, not evidence about real providers: a local server returns a 401 body that echoes the `Authorization` header, and the test checks that the response contains neither the test key nor the sentinel. This shows what the code forwards.

### Test design

- A table-driven sentinel test over the 23 sites. Each mocked upstream returns `SENTINEL-UPSTREAM-<random>` and a fake `sk-test-...` key. Assert that the response body and headers contain neither, and that the log line uses the `failureSite` format.
- A redactor test for logs: `Bearer ...` and `sk-...` patterns are replaced before logging.
- Replace the raw `log.error(..., error)` calls with `failureSite(error)` in the four files above.

```ts
// proposed: one helper for client responses, used by all 23 sites
export function internalFailure(cause: unknown, publicMessage: string): NextResponse {
  log.error(publicMessage, failureSite(cause)); // failureSite from D-17
  return apiError('INTERNAL_ERROR', 500, publicMessage);
}
```

**Strongest argument against A:** users and operators need upstream text to fix setup ("model not found", "quota exceeded"). Removing it from the verify routes removes the only actionable message for a mis-set key [Inference]. Response: send allowlisted, provider-independent messages for known statuses (for example, 401 gives "The provider rejected the key"), not raw text.

- **Cost:** M (23 call sites, one helper, a sentinel table, a redactor, a UI string check).
- **Reversal:** revert the helper. No data involved.
- **Confidence:** 0.7.
- **What would change my mind:** evidence that the verify routes are reachable only by callers who already hold the key (then no new party learns the text). Or a UX decision that details are part of the public contract.
- **Unknown:** whether any upstream body contains credentials, and whether the chat route's caught errors contain upstream text. [Unverified: chat paths not traced.]

---

## D-04 Password hashing cost (B15)

**Recommended option: A (keep 2^16 this cycle), plus the parse-ceiling fix now, whatever option is chosen.**

### Evidence

- [Measured: `scryptSync`, 3 samples each, one process] 2^16, r=8, maxmem 128 MiB: 194, 211, 208 ms. 2^17, r=8, maxmem 256 MiB: 400, 416, 467 ms.
- [Measured] At 2^17 with maxmem 128 MiB (`MAX_MEMORY_BYTES`, `password.ts:23`), scrypt throws synchronously. The minimum maxmem is **134,220,800 bytes** = 128·r·(N+2) + 128·r·p. At 134,220,799 it throws; at 134,220,800 it passes. Raising `COST_N` alone therefore makes every registration fail with 500 (`password.ts:109-114`).
- [Measured] `password.ts:152` accepts the three exact-boundary combinations at today's ceiling, and scrypt rejects them: (N=2^16, r=16), (N=2^17, r=8), (N=2^18, r=4), for p=1 (and p=2 for the first). This is a latent defect at today's cost.
- [Verified: `password.test.ts:75`] A test pins `65536`, `8`, `1`. [Verified: `password.test.ts:68-70`] `beforeAll` hashes at production cost, so the whole file fails first on a cost change.
- [Verified: `password.test.ts:145-165`] The queue test submits 67 derivations. With 2 active and 64 queued (`password.ts:57`, `:62`, `:79-87`), the 67th is refused: 1 refused, 66 settled. Under option B with one active derivation and a queue of Q, the counts become refused = 67 − (1+Q) and settled = 1+Q. For Q=16: 50 and 17. Under option C the counts stay the same and runtime roughly doubles: 33 rounds × about 0.43 s ≈ 14 s [Inference from the measured derivation time].
- [Verified: `service.ts:108-138`] Registration hashes before the taken-name check and has no throttle. Each registration request costs one derivation, including a repeat for a taken name. At 2^17 each costs about twice the CPU. This is a CPU amplifier independent of sign-in.
- [Verified: no match for `rehash`, `needsRehash` or `upgrade` in `lib/server/accounts` or `tests/accounts`] Login never re-hashes. Existing 2^16 hashes stay at 2^16. A cost raise helps only new passwords.
- [Verified: `docker-compose.yml:128`] A memory limit is set for the render service only. The app container has none in the repo. [Unverified] The deployment memory budget.
- [Inference] Throughput: at 2^17, about 4-5 verifications per second per process (two concurrent, 0.43 s each), against about 9-10 at 2^16 [Measured derivation time × concurrency]. The 64-slot queue drains in about 14 s at 2^17 versus about 7 s at 2^16.

### Test changes that any cost change needs (a constant change alone is not enough)

1. Raise `MAX_MEMORY_BYTES` to at least 134,220,800, for example 160 MiB. It is the per-call `maxmem`, not the total. The 256 MiB figure is concurrency times per-hash.
2. Replace `128 * n * r > MAX_MEMORY_BYTES` at `password.ts:152` with the exact requirement:

```ts
/** Bytes OpenSSL needs for one scrypt derivation: 128*r*(N+2) + 128*r*p. */
function scryptMemoryBytes(n: number, r: number, p: number): number {
  return 128 * r * (n + 2) + 128 * r * p;
}
if (scryptMemoryBytes(n, r, p) > MAX_MEMORY_BYTES) return undefined;
```

3. Add `it.each` over (2^16,16,1), (2^17,8,1), (2^18,4,1). A stored hash with that cost should resolve to `false`. [Inference] Today it rejects, because the scrypt call throws.
4. Update `password.test.ts:75`, the queue numbers at `:145-165`, and the three stale timing comments.
5. Reversal caveat: after a raise, a user who registers at 2^17 becomes malformed (`false`) if `MAX_MEMORY_BYTES` is lowered again, so that user cannot sign in [Inference: `password.ts:149-152`].

**Strongest argument against A:** 2^16 sits below the 2^17 level that the review round cites, and offline cracking of a leaked database runs at half the speed at 2^17. The agenda ranks security and privacy highest. The cited 2^17 level is [Unverified]: it comes from memory, recorded as "Unverified recollection" at `scrum/BACKLOG.md:63`. Response: the memory budget and throughput are unknown, and registration amplifies CPU with no throttle.

- **Cost:** A plus the parse fix is S. B or C is S to M.
- **Reversal:** set the cost back. Stored hashes keep their cost. Observe the caveat in item 5.
- **Confidence:** 0.55.
- **What would change my mind:** (1) a confirmed container budget with headroom for two concurrent 128 MiB derivations; (2) an agreed throughput target; (3) the Security lead judging offline-crack cost as weightier than the CPU amplification. Then choose C, with the test changes above.
- **Unknown:** the production memory budget per process.

---

## D-07 Educational content review (B17)

**Recommended option: A, phase 1 only, run as a fixed protocol over `skills/agent-runtime/`.**

### Evidence

- [Measured: Node walk, read only] `skills/agent-runtime` holds 32 `.md` files with 26 link targets: 18 file links, 7 same-file anchors and 1 placeholder. Results: 0 broken file links, 0 broken same-file anchors, and one example placeholder, `[keyframe@mm:ss](mat_xxx)` at `teacher-style-clone/SKILL.md:43`, which reads as an example rather than a broken reference. The directory holds 41 files including JSON [Verified: `find`].
- [Measured: `wc` over `.md` files] `skills/agent-runtime`: 5,950 lines. `packages/@openmaic/generation/templates`: 4,583. `lib/prompts/templates`: 1,085.
- [Measured: ripgrep] No snapshot file references `agent-runtime`. [Inference] Text edits to these files therefore break no snapshot. [Unverified] `tests/providers/provider-neutrality-guard.test.ts:504` reads source files by path. Whether it covers skill documents was not checked.
- [Verified: `scripts/check-i18n-keys.mjs`] A key-parity checker already exists as a precedent for a mechanical checker.

### Protocol

1. Pin the commit SHA. Record `sha256sum` for every file in scope.
2. Run the mechanical pass (below) at the pinned SHA and save its output.
3. Manual pass against a rubric with IDs: `CR-01` contradiction; `CR-02` broken reference; `CR-03` factual claim needing an SME check; `CR-04` objective or feedback problem. Each finding records file, line range, a quote of at most 25 words, category, proposed action, and reviewer role.
4. A second reviewer re-runs step 2 and reads the same files.
5. Change one commit per finding ID. Re-run step 2 after each.
6. Keep a findings file with the SHA, rubric version and reviewer roles. Factual claims left unchanged go on an SME list with an owner.
7. Optional: promote step 2 to `scripts/check-skill-references.mjs` in CI. [Inference] Cost S.

```js
// Mechanical pass (read only): relative links must resolve; same-file anchors must match a heading.
const headingSlug = (t) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
for (const f of mdFiles) {
  const text = fs.readFileSync(f, 'utf8');
  const slugs = new Set([...text.matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => headingSlug(m[1])));
  for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(link)) continue;
    if (link.startsWith('#')) { if (!slugs.has(link.slice(1))) report(f, link); continue; }
    const [rel] = link.split('#');
    if (!fs.existsSync(path.resolve(path.dirname(f), rel))) report(f, link);
  }
}
```

The regex misses reference-style links and links that contain spaces. Phase 1 needs the manual pass to cover those.

**Strongest argument against A:** the mechanical pass finds almost nothing (0 broken links), and the real value of the review is accuracy, which no internal check tests. A phase-1 review can be reported as complete while accuracy stays untested [Inference]. Response: phase 1 covers agent instructions, not learner text, so it is the lowest-harm slice. Accuracy belongs to phase 2 with an SME. Learner-facing templates (option B) carry more harm if wrong.

- **Cost:** M (reviewer time).
- **Reversal:** one commit per finding, revert individually.
- **Confidence:** 0.6.
- **What would change my mind:** a phase-1 finding that changes learner output. Then move that file to SME review before any change.
- **Unknown:** how many factual claims are wrong. No mechanical check can say.

---

## D-10 Trust in `x-forwarded-host` (B7)

**Recommended option: A, applied to `buildRequestOrigin`, with a validated host and protocol.** Cost S.

### Evidence

- [Verified: `lib/server/classroom-storage.ts:56-60`] `buildRequestOrigin` takes `x-forwarded-host` and `x-forwarded-proto` with no check. This is the only live path (see correction 4).
- [Verified: `lib/server/media-origin.ts:74-80`] A duplicate, `requestOrigin`, has the same flaw. It has no production caller. `media-origin.ts:1-3` says "One resolver", which is not the case. Make it call the same function, or delete it. Deleting it changes `tests/server/media-origin.test.ts`.
- Stored URLs: [Verified: `lib/server/classroom-media-generation.ts:77-78`, `:155`, `:194`, `:211-212`, `:319`] media URLs built from the origin are written into scene data. [Verified: `lib/server/classroom-generation.ts:711`] `persistClassroom` stores the scenes. A forged host therefore reaches stored content, not only responses. A code change does not rewrite stored URLs.
- Returned only: `url` from `POST /api/classroom` (`classroom-storage.ts:135`), and `pollUrl` from `app/api/generate-classroom/route.ts:46`.
- Tests: [Verified: `tests/server/media-origin.test.ts:26`, `:35`, `:56`] Three tests expect the header to be honoured. They must set the flag. [Verified: ripgrep] No test calls `buildRequestOrigin` directly.
- Docs: [Verified: `README.md:296`, `.env.example:500-502`, `docker-compose.yml:113`] document `TRUST_PROXY_HEADERS` for other features. [Verified: ripgrep, case-insensitive, repo excluding `node_modules`] No document mentions `x-forwarded-host`. No documented deployment relies on it.
- [Verified: `classroom-storage.ts:58`] The protocol is not checked. A value such as `javascript` yields a non-HTTP origin. The effect depends on how the URL is rendered [Unverified: client rendering not traced].

```ts
// lib/server/classroom-storage.ts (proposed)
const HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;
export function buildRequestOrigin(req: NextRequest): string {
  if (process.env.TRUST_PROXY_HEADERS !== 'true') return req.nextUrl.origin;
  const host = req.headers.get('x-forwarded-host');
  if (!host || !HOST.test(host)) return req.nextUrl.origin;
  const proto = req.headers.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}
```

### Tests

- Flag unset: request origin, even with the header. Flag true with a valid host: the host. Flag true, protocol `javascript`: `http`. Host containing `/` or `@`: request origin.
- Warn once when the header is present and untrusted (the agenda's request). Test the warning.
- `tests/server/media-origin.test.ts:26`, `:35`, `:56`: set `TRUST_PROXY_HEADERS=true`, and add an untrusted case.

**Strongest argument against A:** a deployment whose proxy sets `X-Forwarded-Host` but not the flag will generate localhost or internal URLs. Share links and new media URLs then break silently until the flag is set [Inference]. Response: the warning the agenda asks for, and a README line.

- **Reversal:** flip the flag or revert the function. URLs already stored under a forged host need a data repair, which is a separate task.
- **Confidence:** 0.7.
- **What would change my mind:** a deployment that needs the header without the flag. Then option C, an allowlist of public origins.
- **Unknown:** whether any deployment sets `X-Forwarded-Host`. The proxy configuration is not in the repo [Unverified].

---

## D-11 Per-client throttles for sign-in and registration (B11)

**Recommended option: A, but only after the eviction defect is changed.** Confidence 0.5.

### Evidence

- [Verified: `lib/server/accounts/login-throttle.ts:44-52`] `recordFailure` evicts the oldest-inserted key when the map exceeds `maxKeys`, whatever the window.
- [Verified: `login-throttle.ts:22-26`] `maxKeys` is 10,000. One process-wide instance serves sign-in (`lib/server/accounts/runtime.ts:31-33`).
- [Verified: `lib/server/accounts/service.ts:153-163`] Failures are recorded for any normalised username before the lookup (`:163`). Unknown names therefore fill the map.
- [Measured: throttle transpiled in memory] After 8 failures for "victim", `retryAfterSeconds` = 900. After 10,000 failures for other names, the victim's value is `undefined`. Ten thousand other names clear the throttle.
- [Inference] Each unknown-name attempt runs one scrypt derivation (`service.ts:170`). At about 0.2 s per derivation with concurrency 2, 10,000 attempts take about 17 minutes. That buys 8 more guesses against the victim.
- [Verified: `tests/accounts/login-throttle.test.ts:72`] A test asserts the eviction of the oldest key. Any change to eviction changes this test.
- [Verified: `app/api/access-code/verify/route.ts:27-31`] The access-code route keys by the last `x-forwarded-for` entry when the flag is set, and uses one shared `direct` bucket when it is not. [Verified: `tests/server/access-code-verify-throttle.test.ts:87`] A test for the last entry exists. Copy its pattern.
- [Verified: `README.md:296`] Operators are told to set the flag only behind a proxy that overwrites `x-forwarded-for`.
- [Verified: `routes.test.ts:205-217`] Usernames allow dots: `Alice.X` normalises to `alice.x`.
- [Inference] Classroom users often share one NAT address, such as a school or a class. A per-client limit keyed by the forwarded address can lock out a whole class. The access-code route already carries this trade-off (B10).

### Order of change

1. Eviction: evict only keys whose failures have all left the window. If the map is still full, do not admit the new key, and answer `RATE_LIMITED` for it. [Inference] This makes the map a fail-closed budget. Security should review the denial-of-service side.
2. Per-client key with a prefix (`client:<addr>`), so a username such as `1.2.3.4` cannot share a bucket with an address. No key when the flag is off. No shared key when the flag is on and no header is present.

### Tests

- Replace `login-throttle.test.ts:72`: the victim stays throttled after 10,000 other names. This test fails today (measured above), and it is the regression test for whichever eviction change is chosen.
- Route tests: a spoofed first entry does not reset the bucket; flag off means no per-client key; flag on with no header means no shared bucket; distributed usernames from one client reach `RATE_LIMITED` at the budget; concurrent attempts are bounded (copy `access-code-verify-throttle.test.ts:66`).

**Strongest argument against A:** a per-client limit is only as good as the proxy. A proxy that passes client headers through without appending leaves the last entry attacker-chosen, and the limit is then bypassed [Inference]. The README states the requirement, so the risk is misconfiguration, not code.

- **Cost:** M (eviction change, the new key, tests).
- **Reversal:** turn the flag off. The eviction change is independent, and the old loop can be restored.
- **Confidence:** 0.5.
- **What would change my mind:** PD or UX confirms that shared NAT addresses are rare in expected classrooms. Or Security rules the fail-closed map unacceptable. Then use a larger `maxKeys` with a test.
- **Unknown:** the NAT topology of expected classrooms.

---

## Summary table

| Item | Recommended option | Confidence | Cost | Single most important unknown |
|---|---|---|---|---|
| D-17 | B: failure-site diagnostic, then 14 consecutive clean full runs | 0.7 | S, plus about 1 h CI | Which function threw the plain `Error` (closed handle, PGlite failure, or scrypt), and whether the failing test timed out |
| D-14 | A: `EPERM`/`ENOTSUP` to exclusive create; drop `EXDEV` | 0.6 | S | Whether any deployment filesystem refuses hard links |
| D-16 | A: scope widened to all 23 caught-error sites | 0.7 | M | Whether upstream bodies carry credentials (provider behaviour, unverified) |
| D-04 | A: keep 2^16, and fix the parse ceiling now | 0.55 | S (B or C: S to M) | Production memory budget per process |
| D-07 | A: phase 1, `skills/agent-runtime`, with the protocol | 0.6 | M | How many factual claims are wrong (needs an SME) |
| D-10 | A: `buildRequestOrigin` validated, flag-gated; fix the dead copy too | 0.7 | S | Whether any deployment sets `X-Forwarded-Host` without the flag |
| D-11 | A: after the eviction change | 0.5 | M | Whether expected classrooms share one NAT address |
