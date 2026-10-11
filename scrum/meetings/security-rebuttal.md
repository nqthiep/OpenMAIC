# Security rebuttal: team meeting 01

[Partly unverified] Each claim carries a label. Unlabeled sentences are my reasoning.

- Role S. Date 2026-10-11. Agenda: scrum/meetings/01-agenda.md. Memo answered: scrum/meetings/security.md.
- Snapshot: 05:29 UTC. HEAD 491c409. The working tree changed during this round: 69 modified or untracked entries at that time, including files this memo cites. Citations are to that snapshot. Where a memo or the devil's advocate cites HEAD, I say so.
- Not read: scrum/DECISIONS.md. Written: this file only. Measurements ran in memory through `node` on stdin.
- Several objections hold against HEAD and are already addressed in the tree: queue-busy refund, lock-aware eviction, per-client budget, closed-by-default registration, session-ended 401 with client handling, admin audit. Each item says which.

Changed: D-01, D-05, D-09, D-10, D-11, D-12, D-16, D-17, D-18. Unchanged: D-02, D-03.

## D-01 Reads by id. Changed: B to A for documents now.

- DA: option B breaks learner links to unpublished courses, and no client publishes. **Accept.** [Measured: rg over components/, lib/, app/ excluding app/api: no caller of `/publish` or `unpublish`; hits are doc comments at lib/server/stage-access.ts:9 and lib/persistence/stage-meta.ts:150.] [Verified: app/api/stages/[id]/publish/route.ts:26-31 refuses anonymous owners.] [Verified: lib/persistence/document-access.ts:70-74: `read` allows any caller for a non-deleted stage.] Under B, learners lose every unpublished document-backed course, and the owner has no publish path.
- DA: client-chosen classroom ids may be one character, and create-only lets anyone claim a guessable id. **Accept.** [Verified: lib/server/classroom-storage.ts:108-110 accepts 1 to 128 characters.] [Verified: app/api/classroom/route.ts:71, 76 take the client id; :88-96 create-only; :119-150 GET returns any classroom by id, with no owner check.] [Measured: rg: the only client call to `api/classroom` is the GET at lib/classroom/load-classroom.ts:261.] [Inference: the risk falls on ids a caller chooses. This repo's generators mint 21 characters (lib/import/use-import-classroom.ts:396), 18 (app/api/stages/route.ts:29-31) and 10 (lib/server/classroom-generation.ts:522).]
- Change, basis new evidence (no publish path). Position now: A for documents, with a threat model that says capability reads are revoked only by delete. New rule: client-supplied classroom ids need 16 or more characters, or the server mints them. Next cycle: C (expiring share tokens) with a publish control.
- Confidence 0.65. Cost S (C later: L). Unknown: whether any learner relies on unpublished course links today.

## D-02 Managed provider keys. Unchanged: B for signed-in accounts, with D-03 C.

- DA: signed-in is cheap under open registration, and job inputs carry no owner. **Accept.** Owner threading stays the main cost (security.md:100-101, not disputed here).
- DA, section 5: the question of which verify routes take the server key. **Answered.** [Verified: lib/server/provider-config.ts:603-611: a managed entry returns the server key and ignores the client's key; :852-854 image resolution uses the same rule.] B must cover every verify route.
- DA risk 5, no spend ceiling. **Accept.** [Verified: lib/server/usage-storage.ts:42: UsageRecord has no owner field.] A per-account quota is L; a deployment-wide cap is a separate item.
- A boot warning does not stop spend. **Accept.** [Verified: lib/server/config-validation.ts:197-210 warns only.]
- Confidence 0.5. Cost L (B); S for the stop-gap (refuse managed keys when ACCESS_CODE is unset). Unknown: whether the access code is held only by a bounded group.

## D-03 Registration default. Unchanged: C.

- DA: B's clause would open sign-up for every code holder. **Accept.** My memo already rejects that clause (security.md:119).
- DA: the first account needs a temporary `open` setting. **Accept.** Document the step (security.md:127).
- [Verified: lib/server/accounts/runtime.ts:30-32] closes registration unless `ACCOUNT_REGISTRATION=open`.
- [Verified: .env.example:526-527] still says registration is "open unless this is set to 'closed'" and that "any other value leaves registration open." Both are now wrong. Fix in the same change (S).
- Unknown: whether this branch runs anywhere public. [Unverified: README.md:94 advertises a hosted mode; open.maic.chat was not checked.] Confidence 0.75. Cost S.

## D-05 Administrator role and usage endpoint. Changed: access-code-only mode hidden, not open.

- DA: product wants the usage panel hidden from non-admins "in every mode" (product.md:120), but access-code-only mode has no admin identity. **Accept.** [Verified: lib/server/accounts/admin.ts:26-34: an administrator is a signed-in account listed in ADMIN_USERNAMES.] [Verified: app/api/usage/route.ts:77-80: admin-only only when accounts are enabled; otherwise open to every gated caller.] The current code breaks product.md:120 in that mode.
- Change, basis stronger argument plus product's stated rule: in access-code-only mode, return 403 unless the operator opts in. [Inference: security stakes are low.] [Verified: lib/server/usage-storage.ts:42-58: rows hold model, provider and token counts, no user identifier.] Product owns the final call.
- DA: admin changes need a restart, and the agenda omits an audit row. **Accept both.** [Inference: admin.ts:13-14 reads ADMIN_USERNAMES from the environment, so a change takes effect at restart.] The audit row is in the tree: [Verified: lib/server/accounts/store.ts:214-245 writes account_admin_audit in the same statement as the disable.] Empty allowlist fails closed: [Verified: admin.ts:4, 31-34].
- Confidence 0.6. Cost M (most of it is already in the tree). Unknown: product's answer on usage visibility in access-code-only mode.

## D-09 Access-cookie signing. Changed: warn now, require the secret on a dated release.

- DA: a warning does not stop offline guessing; use a startup error below 12 characters. **Modify.** I accept that a warning leaves the offline test open. [Verified: lib/server/access-token.ts:9-13 signs only the timestamp; with no secret the key is the code, access-token-policy.ts:22-27.] [Measured: M3, security.md:165: a 6-digit code falls in about 1.5 s on one core.]
- Rejected for this release: the startup error. Existing deployments would fail to boot on upgrade, and the access gate is not new (agenda criterion 4). Basis: stronger argument. Warn now; require ACCESS_COOKIE_SECRET on a dated release, with notice.
- New gap: a secret under 32 characters is ignored with a one-time console warning, and the code becomes the key again [Verified: lib/server/access-token-policy.ts:34-41]. Boot validation checks presence only [Verified: lib/server/config-validation.ts:178-190]. Add a length warning at boot (S).
- Confidence 0.55. Cost S. Unknown: how strong deployed access codes are [Unverified: no data here].

## D-10 Trust in x-forwarded-host. Changed: C, plus relative persisted URLs when unset or invalid.

- DA: C keeps today's trust when unset; relative URLs avoid both problems. **Accept.**
- [Verified: lib/server/public-origin.ts:29-32: with PUBLIC_APP_ORIGIN unset, x-forwarded-host decides the origin.] [Verified: node_modules/next/dist/server/base-server.js:574 sets the header only when absent, so a client-sent value passes through.] [Verified: lib/server/classroom-generation.ts:677-678, 711-718 and lib/server/classroom-media-generation.ts:77-79 persist media URLs built from that origin.] A direct caller who reaches the generation route with media enabled picks the host viewers load from. [Inference: depends on the access gate; in an ungated deployment, anyone.]
- **Accept** the DA's point on the fallback. [Verified: repo-root container build file, line 91, sets HOSTNAME=0.0.0.0; node_modules/next/dist/server/next-server.js:1266 builds the request URL from the bind host and port.] [Inference: under the image defaults that origin is http://0.0.0.0:3000; not run in a container.] The tree has the same fallback for an invalid PUBLIC_APP_ORIGIN [Verified: lib/server/public-origin.ts:27]. Boot warns [Verified: lib/server/config-validation.ts:232-243], but generation still persists.
- Relative URLs work in the consumers checked. [Verified: lib/media/resolve-media-ref.ts:27-30 treats a leading `/` as concrete; components/slide-renderer/use-resolved-slide.ts:186 leaves concrete refs out of the pool, so the stored src is used as-is.] [Verified: lib/server/classroom-media-bytes.ts:52 and lib/agent-runtime/lifecycle.ts:29 already store `/api/classroom-media/...`.] [Verified: lib/export/use-export-pptx.ts:633 fetches in the browser.] [Unverified: how the separate render service resolves media; render-service/ was not traced.]
- Change, basis new evidence (the header fill, the invalid-value fallback, and the renderer's use of relative refs). Existing absolute URLs stay; a scrub is optional [Unverified: how many exist].
- Confidence 0.6. Cost S. Unknown: how the render service resolves media.

## D-11 Throttles. Changed: per-client budget stays (class-sized); per-username refuses instead of evicting a live lock.

- DA: eviction lets a flood drop a blocked name's lock. **Accept, at HEAD.** [Verified: HEAD lib/server/accounts/login-throttle.ts:50-54 evicts the oldest key whatever its lock.] [Verified: HEAD service.ts:163 counts an attempt before the queue check, with no refund.] [Inference: at HEAD, refused attempts cost nothing to send, so about 10,000 requests fill the table.] The DA's chain holds there.
- DA: cost is requests, not derivations. **Reject for the tree.** [Verified: service.ts:179 counts before the check; :184 refunds only queue-busy refusals; checkCredentials (:146-157) derives for known and unknown names alike.] [Verified: login-throttle.ts:7-11 states the same.] In the tree each counted attempt costs one derivation.
- [Measured: scrypt N=2^16 r=8 p=1 in node: 214 ms sequential; 7.65 derivations per second with two in flight.] The two slots are at password.ts:57. In the tree, one 900 s window admits about 6,900 counted attempts per process. A full table (10,001 live keys) needs 180 ms or less per derivation with two slots. [Inference: unreachable on this container; production timing is unknown.]
- [Measured: the real class from HEAD and from the tree, transpiled in memory; 900 s window; victim locked at t=0.] Paced flood at 9/s: victim stays locked, in the tree and at HEAD. Paced at 12/s: lock removed in both. Burst with 63 locks ahead of the victim: removed in the tree. A burst ignores time, so the paced rows are the realistic ones.
- The DA's "locked keys evicted last" is in the tree (login-throttle.ts:99-113). The gap is the fallback `return oldest` at :112, which removes a live lock when the first 64 scanned keys are all locked.
- QA's refuse-when-full (qa.md:351). **Modify.** The DA says refusal keeps a stale map full. That needs a lazy sweep. [Verified: makeRoom sweeps the expired prefix before any decision, login-throttle.ts:86-91.] Refusal then applies only to 10,001 live keys. Residual: new names get 429 while the table is full. That is real where the fill is reachable [Inference]. It should end soon after the flood stops, since keys expire in insertion order [Inference; not simulated].
  ```ts
  // login-throttle.ts pickVictim(), line 112: never evict a live lock
  return undefined;
  // recordFailure(key), before insert: a new key needs a free slot
  if (!this.failures.has(key)) {
    this.sweepExpired();                                  // makeRoom's first loop, extracted
    while (this.failures.size >= this.options.maxKeys) {
      const victim = this.pickVictim(key);
      if (victim === undefined) return undefined;         // caller maps to RATE_LIMITED (service.ts:179)
      this.failures.delete(victim);
    }
  }
  ```
- Per-client budget: the DA's class-sized threshold is in the tree: 30 failures per 15 minutes per client, failures only [Verified: lib/server/accounts/client-budget.ts:15-19, 39-43, 61-63]. **Accept.** Residual: one address may make 30 failures per window [Inference: about 2,880 a day]. [Verified: client-budget.ts:29-33: in trusted mode a request with no address shares one `anonymous` bucket.] A missing header would lock all such clients after 30 failures. Fix: no per-client budget without an address (S).
- Access-code bucket: maxKeys 1,000, no derivation [Verified: app/api/access-code/verify/route.ts:12-16]. Filling it needs 1,000 distinct client identities in 15 minutes, in trusted mode only. Apply the same refusal rule.
- README.md:296 says a lockout lasts 15 minutes. **Accept:** under a sustained flood it lasts as long as the flood [Measured: M1, security.md:230-232]. Correct the text (S).
- My line "spraying is bounded by scrypt throughput" (security.md:234). **Modify.** It holds in the tree for every counted name, and fails at HEAD.
- Confidence 0.55. Cost S (refusal, address rule, README, tests). Unknown: production derivation time per process, and how many client identities one network can reach.

## D-12 Session expiry. Unchanged in direction (A); changed in detail.

- DA: "the 401 clears the cookie" is false. **Accept.** [Verified: app/api/persistence/[...path]/route.ts:34-36 `jsonError` sets no Set-Cookie.] The tree's `sessionEndedResponse` does set it [Verified: lib/server/agent-runtime/with-owner.ts:45-54], so the claim holds only for that helper.
- DA: a rule in the session route would turn `authenticated:false` into a 401. **Accept; not done.** [Verified: app/api/auth/session/route.ts:21 is untouched.] The rule sits in resolveSignedInSession (with-owner.ts:34-42).
- DA: three streams call the owner resolver directly. **Handled** for events, owner-events and freshness [Verified: app/api/agent/sessions/[id]/events/route.ts:80-81; app/api/agent/owner-events/route.ts:51-52; app/api/stages/[id]/freshness/route.ts:54-55]. Not handled: the learner-key resolver [Verified: lib/persistence/server-auth.ts:133] and the workspace server action [Verified: lib/workbench/workspace-actions.ts:22].
- DA: client handling is missing. **Handled in the tree.** [Verified: lib/persistence/session-end.ts:42-58 dispatches on a same-origin 401 with errorCode SESSION_ENDED; lib/persistence/bootstrap.ts:95-97 and :136 drop the learner key on that event.] The key is also re-read on focus (bootstrap.ts:134) and after a maximum age (:103).
- DA: one rule for duplicate cookies and the `acct:` header. **Accept, and a gap remains.** A duplicate or malformed cookie reads as absent [Verified: lib/server/accounts/session.ts:39]. With no cookie, resolveSignedInSession returns `ended: false` [Verified: lib/server/agent-runtime/with-owner.ts:38], although the persistence client sends the `acct:` key with its requests [Verified: lib/persistence/bootstrap.ts:123]. Documents are keyed by the anonymous owner [Verified: app/api/persistence/[...path]/route.ts:139, 340-343]. [Inference from the code paths; not run:] after natural expiry, writes go to the anonymous partition until the next focus or re-read.
  Rule: a request asserts a signed-in identity with a well-formed cookie or an `acct:` key. An assertion without a live session is 401 SESSION_ENDED with the clearing header. A malformed or duplicate cookie with no `acct:` key stays anonymous, as with-owner.ts:12-17 already says.
- DA risk 4, logout keeps the anonymous cookie. **Accept as a risk; not decided here.** [Verified: app/api/auth/logout/route.ts:22 clears only the session cookie; lib/server/agent-runtime/owner.ts:58-61 reuses an anonymous cookie.] Clearing it would orphan this browser's anonymous data. That is a product choice (D-06 area).
- Outside the agenda: [Verified: lib/persistence/bootstrap.ts:121] sends NEXT_PUBLIC_PERSISTENCE_TOKEN as a bearer token, and [Verified: README.md:381] calls that token not a secret. Where it is set, anonymous persistence needs no other credential.
- Changed: the `acct:` assertion rule is new. Basis: new evidence (the key path). Confidence 0.7. Cost S. Unknown: whether any flow needs anonymous continuation after sign-out (none found).

## D-16 Error details. Changed: narrowed to managed keys.

- DA: scope the rule to managed-key failures; BYOK users need the text. **Accept.** [Verified: components/settings/model-edit-dialog.tsx:95 shows `data.error`; components/settings/asr-settings.tsx:184 shows `details`.] That text comes from the user's own key.
- Managed-key upstream text never reaches the client. [Verified: app/api/verify-model/route.ts:33 (raw message, 401), :71 (raw message as the 500 text), :75.] The resolver knows whether a key was managed [Verified: lib/server/provider-config.ts:603-611].
- Non-provider internal errors use fixed text. The classroom route does this in the tree [Verified: app/api/classroom/route.ts:111-115, 147-151].
- Logs: the logger prints the full stack, which carries the message [Verified: lib/logger.ts:16-19]. Account routes log name, code and first frame only [Verified: lib/server/accounts/http.ts:132]. Apply that wherever an Error reaches a log, for example verify-model/route.ts:55.
- Confidence 0.7. Cost S. Unknown: whether any provider echoes key material in error text [Unverified].

## D-17 Account-route diagnostics. Changed: my wording leaked.

- DA: platform's slice leaks; QA's replace-then-frame form does not. **Accept.** My wording, "strip everything before the first `    at` frame" (security.md:312), is the leaking form. [Measured: node on stdin, message `boom`, a newline, `    at fake (evil.js:1:1)`, a newline, `password=hunter2`. Keeping everything after the first frame marker keeps `password=hunter2`; removing the exact message text does not.] Changed to: name, code, and first frame read after the header.
- In the tree: [Verified: lib/server/accounts/http.ts:132] reads the frame only after the stack's header. [Verified: tests/accounts/route-diagnostics.test.ts:23-25] has an injected-frame case. [Unverified: not run.]
- DA: diagnostics help only after a recurrence. **Accept** as a cheap step, not a root-cause fix.
- Confidence 0.75. Cost S. Unknown: root cause of the intermittent 500s, which logging does not establish.

## D-18 Earlier sessions on sign-in. Changed: B to A.

- DA: B signs out a teacher's other device at their next sign-in. **Accept.** [Verified: lib/server/accounts/store.ts:132-146: a session is valid while unrevoked, unexpired, and its account is enabled.] [Inference: the forced sign-out lands on routine multi-device use.]
- DA: a stolen token survives until the owner's next sign-in or expiry. **Accept.** [Verified: lib/server/accounts/session.ts:9: 30-day lifetime.] Logout revokes only the presented token [Verified: lib/server/accounts/service.ts:197-205]. The only other revocation is admin disable [Verified: store.ts:214-245].
- Change, basis stronger argument. B's protection needs an event the owner may never trigger, and its cost lands on routine use. The real gap is that the user has no remedy. Next cycle: a user-initiated "sign out other sessions" action (M).
- The DA's "one-session requirement" is read here as a product condition. If product requires one session per account, switch to B, which needs D-12 (otherwise the silent fallback).
- Confidence 0.6. Cost S. Unknown: whether product requires one session per account.

## Cross-cutting objections

- DA section 2: "the 401 clears the cookie" is refuted; accepted (D-12). "Spraying is bounded by scrypt throughput" is refuted at HEAD and holds in the tree (D-11). "No deployed users" was already labeled [Unverified] (security.md:25).
- DA risk 1, guessable classroom ids: accept (D-01).
- DA risk 2, unbounded anonymous writes: **accept as a gap.** [Verified: app/api/classroom/route.ts:26 reads the body with no size check; the framework default was not checked.] Not one of my items. I recommend a separate item: a body cap on POST routes (S). I do not rank it here.
- DA risk 3, gate lockout of new visitors: **accept.** [Verified: app/api/access-code/verify/route.ts:27-28, 41-46.] Keep the direct bucket: a short code's confidentiality outweighs availability (security.md:244). Fix the README wording (D-11).
- DA risks 4 and 5: accept (D-12, D-02).
- DA section 5: the renderer uses stored src as-is (D-10); verify routes use the server key (D-02). Product questions: D-05 and D-18.

## Table

| Item | Position after rebuttal | Confidence | Cost | Most important unknown |
|---|---|---|---|---|
| D-01 | A for documents now; classroom ids need 16+ characters; C with a publish control later | 0.65 | S | Whether any learner uses unpublished course links today |
| D-02 | B for signed-in accounts, with D-03 C; S stop-gap if B slips | 0.5 | L | Whether the access code is held by a bounded group |
| D-03 | C; correct the .env.example text | 0.75 | S | Whether this branch runs anywhere public |
| D-05 | A (admin allowlist, audit); access-code-only mode hidden | 0.6 | M | Product's answer on usage visibility in access-code-only mode |
| D-09 | Warn now; length warning now; required secret on a dated release | 0.55 | S | Strength of deployed access codes |
| D-10 | C, plus relative persisted URLs when unset or invalid | 0.6 | S | How the render service resolves media |
| D-11 | A: per-client budget at 30 when trusted; per-username refuses, never evicts a live lock | 0.55 | S | Production derivation time (fill reachable at 180 ms or less) |
| D-12 | A: one assertion rule (cookie or account key); client reaction already in tree | 0.7 | S | Whether any flow needs anonymous continuation after sign-out |
| D-16 | Managed-key upstream text never sent; BYOK keeps it; internal errors fixed | 0.7 | S | Whether any provider echoes key material |
| D-17 | Name, code and first frame after the header; no message | 0.75 | S | Root cause of the intermittent 500s (not established) |
| D-18 | A now; user-initiated sign-out of other sessions next cycle | 0.6 | S | Whether product requires one session per account |
