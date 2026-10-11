# Cycle 4 review

[Inference] Basis: static reading of the working tree. Nothing was executed, no tests were run, and no packages were installed. Items marked [Inference] or [Unverified] are not confirmed by a run.

- Commit reviewed: `9368ff15b1d2ad619c785972f397eed08d1c45e5` (`git rev-parse HEAD`)
- Scope: the six areas in the brief. The uncommitted change set is 24 modified and 5 untracked files. `components/access-code-modal.tsx` and `components/settings/usage-dashboard.tsx` have no uncommitted change, so they were read as committed.

## Findings

Ordered by severity. Paths are relative to the repository root.

| ID | Severity | Scope | File:line | Failure scenario | Proposed fix |
|---|---|---|---|---|---|
| F1 | High | Unchanged routes on the same operator-key path | `app/api/chat/route.ts:168-171, 178, 204`; `app/api/generate/scene-outlines-stream/route.ts:640, 687, 714`; `app/api/generate/agent-profiles/route.ts:366` | A visitor who picks a managed model and hits an upstream failure gets the upstream text in the chat error event or the 500 body, and the chat route logs the full error object. The logger writes an Error as its stack, which includes the message (`lib/logger.ts:18`). `managedKey` (`lib/server/resolve-model.ts:154`) is read only by verify-model (`route.ts:62, 78`). [Inference] Some upstream error texts echo part of a rejected key. | Return `managedKey` with every `resolveModel` result and use one helper for visitor text in each caller (sketch 1). Log name and code only when `managedKey` is true. |
| F2 | Medium | In diff (shared class) | `lib/server/accounts/login-throttle.ts:122-134` (cap at `:32`, early break at `:131`); `:111-120`; refusal at `:71-75` | `pickVictim` stops after 64 locked keys, so a new name is refused when the 64 oldest entries are locked, even if an unlocked entry sits further back. That contradicts the file's own rule (lines 7-10). [Inference] Holding this state costs about 11.6 failed attempts per second on the login table and 1.75 on the access table, against about 89 and 11.1 if every entry had to be locked; these are constant-based estimates, not measurements. | Remove the early break and scan the whole map (sketch 2). Add a test with 64 locked keys at the front, one unlocked key behind, and a full table; the new name must be admitted. |
| F3 | Medium | In diff (shared class); route unchanged | `app/api/access-code/verify/route.ts:49` (check `:40-46`, compare `:72-74`); precondition `TRUST_PROXY_HEADERS` at `:28` | `recordFailure` returns `undefined` and records nothing when the table is full of live locks, but the route ignores that and still compares the code, so that guess is not counted. [Inference] The refusal flag clears after any failure from an identity already in the table, so roughly one new-identity guess per such failure goes uncounted. | Test the return value first and answer 429 before the comparison (sketch 3). |
| F4 | Low | In diff (refusal); pre-existing (overshoot) | `lib/server/accounts/client-budget.ts:50-65`, record at `:62` | The client budget records after the attempt and ignores refusal, so an attempt made while its table is full runs uncounted at client level; the username throttle still counts it. Pre-existing: the check runs before the await and the record after, so concurrent attempts from one client all pass the check. | Reserve a slot before the attempt, refund it when the outcome is not `countedCode`, and refuse when the reservation is `undefined` (sketch 4). |
| F5 | Low | In diff | `lib/server/accounts/login-throttle.ts:48-54` (`Retry-After` at `:51`); `makeRoom` at `:112-120` | The check path refuses a new name whenever the flag is set and size is at `maxKeys`, without asking whether `makeRoom` would find a victim. A refusal can outlast a lock that has lapsed, until every stamp of some key leaves the window, and `Retry-After` is always 900 seconds. | Use one predicate ("can a new key be admitted now") in `retryAfterSeconds` and `recordFailure`, and drop the flag. |
| F6 | Low | In diff (behavior vs. intent) | `lib/server/accounts/login-throttle.ts:111-120, 179-187` | The brief's intent reads "when every tracked name is locked, a new name is refused before any password check". The code refuses only when the table is full and no victim is found, so with room left a new name is admitted even when every tracked name is locked. [Inference] The literal rule would let one locked name block all new names. | Keep the code. State "table full and every key locked" in the intent text and the file header. |
| F7 | Low | In diff | `components/account/account-control.tsx:124-134`; menu item `:166-169`; compare the guard in `handleSignOut` at `:110-113` | The new handler has no in-flight guard. Reopening the menu and selecting the item while a request is pending sends a second POST, which usually revokes 0 and shows a second toast. | Add a ref guard like `signingOutRef`. |
| F8 | Low | In diff (structure) | `app/api/verify-model/route.ts:33-39` | The inner catch returns `resolveModel`'s `error.message` without checking `managedKey`. Every throw site found in `lib/server/resolve-model.ts` (`:69, 100, 108, 114`) and in `getModel` (`lib/ai/providers.ts:2134, 2143, 2149, 2465`) returns a local message, so there is no leak today. | In the inner catch, return a fixed message when the provider has a server entry (`isServerConfiguredProvider('providers', providerId)`). |
| F9 | Low | Pre-existing template; call changed in diff | `app/api/verify-model/route.ts:61` | The visitor-supplied `model` string goes into the log message unescaped. In the default plain format (`lib/logger.ts:25`), a newline in it starts a new log line; the JSON format escapes it. | Log `JSON.stringify(model)`, or strip control characters first. |
| F10 | Low | Pre-existing | `lib/ai/providers.ts:2299` (branch), `:2326-2328` | On the local-server provider branch of the custom fetch wrapper, a response body that fails JSON parsing is logged as its first and last 500 characters. The line is not gated by `managedKey`, so upstream text from an operator-key call reaches the logs. | Log status, content type and length only. |
| F11 | Low | Pre-existing | `lib/server/proxy-fetch.ts:119, 130, 134` | The full proxy URL is logged on every proxied call, so any userinfo in it reaches the logs. [Unverified] Whether any deployment puts credentials in that URL. | Redact userinfo before logging. |
| F12 | Low | Pre-existing; unchanged by diff | `app/api/classroom/route.ts:45-46`; outer catch `:137-143` | A JSON `null` body passes the bounded read, the destructure throws, and the outer catch logs an error and returns 500 instead of 400. The earlier `request.json()` path behaved the same. | Return 400 right after the read when the body is `null` or not an object. |
| F13 | Low | In diff (moved code) | `lib/server/error-summary.ts:20-27` | [Inference] Contrived: if a message is changed after capture to a prefix of the captured text, a line from the captured text that starts with `at ` can become the frame. The normal path excludes message text. | Log name and code only, or accept a frame only when it matches `/^ {4}at /`. |
| F14 | Low | Unchanged file; pre-existing | `components/settings/usage-dashboard.tsx:117-121, 230` | The chart instance is created once and reused, but its container unmounts while data is empty. When data returns, the new container stays blank because the effect reuses the old instance. [Inference] Not executed. | Dispose the instance when the container unmounts, or re-initialize when the container changes. |
| F15 | Low | In diff (tests) | `tests/accounts/login-throttle.test.ts` (removed: "reset clears one key and leaves other keys throttled"; "drops expired keys before it evicts a key that is still throttled") | No test in `tests/accounts` calls `reset()` now, and expired-first eviction has no test. | Restore both tests, adapted to the new return type of `recordFailure`. |

Counts: High 1, Medium 2, Low 12. Total 15.

## Proposed code

### Sketch 1 (F1): one helper for visitor text

```ts
// lib/server/resolve-model.ts
export function visitorErrorText(error: unknown, managedKey: boolean, fallback: string): string {
  if (managedKey) return fallback; // operator key: never echo upstream text
  return error instanceof Error ? error.message : fallback;
}
```

Each route declares `let managedKey = true;` before its `try` (fails closed), sets it from the resolved model after `resolveModel` returns, and passes it to every error response and log line.

### Sketch 2 (F2): scan the whole map

```ts
private pickVictim(keep: string): string | undefined {
  const cutoff = this.now() - this.options.windowMs;
  for (const [key, stamps] of this.failures) {
    if (key === keep) continue;
    if (stamps.filter((at) => at > cutoff).length < this.options.maxFailures) return key;
  }
  return undefined;
}
```

Delete `EVICTION_SCAN_LIMIT`. The scan runs only on an insert into a full table.

### Sketch 3 (F3): refuse before the code comparison

```ts
if (accessCodeThrottle.recordFailure(throttleKey) === undefined) {
  const response = apiError('RATE_LIMITED', 429, 'Too many attempts. Try again later.');
  response.headers.set('Retry-After', String(15 * 60));
  return response;
}
```

Place it where line 49 is, before the body is read.

### Sketch 4 (F4): reserve before the attempt, refund when not counted

```ts
export async function withClientBudget<T>(key, countedCode, attempt) {
  if (key === undefined) return attempt();
  const budget = clientBudget();
  const retryAfter = budget.retryAfterSeconds(key);
  if (retryAfter !== undefined) throw new AccountError('RATE_LIMITED', '...', retryAfter);
  const token = budget.recordFailure(key); // reserve before the attempt
  if (token === undefined) {
    throw new AccountError('RATE_LIMITED', '...', budget.retryAfterSeconds(key));
  }
  let counted = false;
  try {
    return await attempt();
  } catch (error) {
    counted = error instanceof AccountError && error.code === countedCode;
    throw error;
  } finally {
    if (!counted) budget.refund(key, token); // success, or an uncounted outcome
  }
}
```

Types and message strings are omitted here.

## Areas with no finding

- **Item 1, `loginAccount` (`lib/server/accounts/service.ts:160-203`).** No bypass found in this function. The check and the record run in one synchronous step, so concurrent attempts cannot overshoot the username budget. Password checks are reached only through `loginAccount` (`service.ts:154-156`); registration does not verify a password. Format, length and NUL rejections happen before counting, but registration applies the same rules (`lib/server/accounts/validation.ts:28-33`), so those guesses cannot match a stored password. A busy refund removes a stamp only for an attempt that never reached the comparison. `pickVictim` never selects a key with enough live stamps to be locked (`login-throttle.ts:129`).
- **Item 2, revoke route and store.** No authorization gap. The revoke is scoped to the account resolved from the cookie (`lib/server/accounts/store.ts:278`), excludes the caller's own token hash (`:279`), and touches only unexpired rows (`:281`). Anonymous requests get 401 (`app/api/auth/revoke-others/route.ts:29`); cross-site requests get 403 before authentication (`route.ts:25`, `lib/server/accounts/http.ts:30-33`). Only F7 applies.
- **Item 3, verify-model.** With `managedKey` true, the outer catch and the response carry no upstream text (`app/api/verify-model/route.ts:62, 78`). `resolveModel` sets `managedKey` from the same entry that selects the operator's key (`lib/server/resolve-model.ts:93, 118`; `lib/server/provider-config.ts:603-611`). The environment-key loaders write into that same entry (`provider-config.ts:274-289`), so no unmanaged call carries the operator's key. The retry warning in `lib/ai/llm.ts:377` is not reached by verify-model, which runs with one attempt. Remaining items: F1, F8, F9, F10, F11.
- **Item 4, bounded read.** Both caps hold. A declared length over the cap is refused before any read. Received bytes are counted; the chunk that crosses the cap is not buffered, and the reader is cancelled (`lib/server/bounded-json.ts:20-38`). Malformed JSON returns 400 (`:40-45`). The route's validation is unchanged, so the read adds no new path to persistence (`app/api/classroom/route.ts:50-84`). Stage fields other than `id` are not validated in this route; that is pre-existing, and the stage passes through the sanitizer at `:113`. Only F12 applies.
- **Item 5, error summary.** The re-export (`lib/server/accounts/http.ts:128`) and the local imports (`http.ts:6`, `app/api/verify-model/route.ts:5`) both resolve. The accounts test that imports `describeUnexpectedError` from the http module still resolves through the re-export. No message text reaches a log in the normal path. Only F13 applies.
- **Item 6, React.** `account-control.tsx`: every hook (lines 38-79) runs before the early returns at lines 81 and 83, and the new handler is a plain function. `usage-dashboard.tsx`: no hook follows the early return at line 185. `access-code-modal.tsx`: no early return, and the input and button are disabled while a request is in flight (lines 166, 173). Only F7 and F14 apply.
- **Unchanged route and client budget.** `app/api/access-code/verify/route.ts` and `lib/server/accounts/client-budget.ts` are unchanged in the diff. Their behavior changed only through the shared throttle (F3, F4).

## Not verified

- [Unverified] Whether deployments set `TRUST_PROXY_HEADERS=true`, and whether the proxy appends to `X-Forwarded-For`. F3 and the client budget depend on both.
- [Unverified] Which upstream providers echo part of a rejected key in their error text (F1).
- The cost figures in F2 are arithmetic from the constants: a 900-second window, 10,000 login entries with 8 failures per lock, and 1,000 access entries with 10 failures per lock. They are not measurements.
- No tests were run. Test references come from the diff and file reads only.
