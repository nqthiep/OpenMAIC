# Devil's advocate: team meeting 01

[Partly unverified] Items labeled [Unverified] or [External] are not confirmed. Read-only: no production file, test, or git state changed.

## 1. Contradictions

**D-01: security B vs product A. Evidence supports A.** [Inference]
- [Measured: grep components, lib, app, en-US.json] No client calls publish or unpublish, and no publish string exists. Publish needs a real account [Verified: app/api/stages/[id]/publish/route.ts:26-31].
- [Verified: app/classroom/[id]/page.tsx:68-99; lib/persistence/bootstrap.ts:108-128] Server builds read a learner's document first. [Inference: stage.ts:1007 is the only loader caller.] The file fallback [Verified: lib/classroom/load-classroom.ts:256-270] cannot serve documents.
- [Inference] B breaks learner links to unpublished document-backed courses, with no UI to publish them. File-backed classroom links are unaffected.

**D-03: product and UX B vs security C. Evidence supports C.** [Inference]
- [Verified: README.md:94; product.md:85] Hosted mode is access-code gated. Under B, a set ACCESS_CODE opens registration, so D-02 option B passes for every code holder. Security saw this coupling [Verified: security.md:358].
- [Verified: product.md:98] Product concedes C costs schools one variable.
- [Measured: git branch -a --contains 95463b5; git tag --contains] Branch-only, untagged. Whether open.maic.chat runs it: [Unverified].

**D-04: platform B vs QA A. Evidence supports A.** [Inference]
- [Measured: medians in platform.md:58-60, combined by me] Thirty simultaneous sign-ins. A: all admitted, last about 3.6 s. B: 9 admitted, 21 get 503 at once. Platform's "3.9 s" omits them. C: all admitted, last about 7.1 s.
- [Inference] B rejects when more than nine sign-ins land within about four seconds. At 2^17, only C is burst-safe.
- [Measured: node scryptSync] 2^17 needs 134,220,800 bytes, as platform states. [Verified: lib/server/accounts/password.ts:152] The guard accepts (2^16, r=16) at 128 MiB, and scrypt rejects it. A parse correction is needed at any cost.
- [External: cheatsheetseries.owasp.org search snippet; page not opened] The snippet ranks Argon2id first. The 2^17 premise is unconfirmed.

**D-10: QA A vs security C. Neither is safe as written.**
- [Verified: Dockerfile:91; next/dist/server/base-server.js:334-337, 574; next-server.js:1266] HOSTNAME=0.0.0.0 makes `nextUrl.origin` `http://0.0.0.0:3000`. Next also fills `x-forwarded-host` from Host, so today's direct origin is the browser's own host [Inference: route-level step].
- [Verified: qa.md:309; docker-compose.yml:112-113] QA's A falls back to `nextUrl.origin` under the compose default. [Inference] New classic classrooms would persist 0.0.0.0 media URLs [Verified: lib/server/classroom-generation.ts:711-717], and a code revert does not undo them.
- [Verified: security.md:209] C keeps today's trust when unset. Relative URLs, already used by the agent runtime [Verified: lib/server/classroom-media-bytes.ts:52], avoid both problems.

**D-11: QA eviction-first vs security and platform per-username. The defect is real. QA's cost is wrong, and its fix denies service.**
- [Verified: lib/server/accounts/service.ts:163, 170; password.ts:84] The failure is recorded before derivation and the queue check, so a 503 still counts.
- Attack: (1) Eight failures lock victim V. (2) About 10,000 requests with distinct valid names evict V's key [Verified: login-throttle.ts:25, 50-54]. (3) Eight guesses at V. (4) Repeat.
- [Inference] Cost is about 10,000 requests per cycle, not 10,000 derivations as QA estimates [Verified: qa.md:342]. [Unverified] Cycle time depends on HTTP throughput.
- [Inference] QA's refuse-when-full rule, with lazy expiry [Verified: login-throttle.ts:62-65], keeps a stale map full. New names are then refused until restart.

**D-16: QA broad vs security narrow. The brief's summary of security is off.**
- [Verified: security.md:285-287] Security is also broad ("other failures use fixed categories"). The real split is BYOK users.
- [Verified: components/settings/model-edit-dialog.tsx:95; asr-settings.tsx:184] BYOK users read verify-route text. Strip upstream text only when a managed key was used.

**D-18: security B vs agenda A. Evidence supports A.** [Inference]
- [Verified: security.md:342] B revokes other sessions at the owner's next sign-in. A teacher signing in at the projector PC would sign the laptop out, and the laptop falls back to anonymous silently [Verified: with-owner.ts:22-24].
- [Verified: store.ts:128-137] A stolen token dies only at the owner's next sign-in or at expiry. Security concedes a password holder keeps access [Verified: security.md:348].

**D-12 and D-05: claim check. True today; the 401 proposal has gaps.**
- [Verified: with-owner.ts:22; owner.ts:58-66] A cookie that does not resolve falls back to the anonymous owner.
- [Measured: grep] 25 route files resolve the owner. Three streams call `resolveRequestOwnerId` directly [Verified: owner.ts:47-50], so a wrapper-level rule misses them.
- [Verified: app/api/auth/logout/route.ts:15-24] Logout reads the cookie directly and does not break. [Verified: app/api/auth/session/route.ts:21] A rule in `resolveRequestAccount` would turn `authenticated:false` into a 401.
- [Verified: app/api/persistence/[...path]/route.ts:34-36; session.ts:53] "The 401 clears the cookie" is false. The error helper sets no Set-Cookie.
- [Verified: session.ts:38] A duplicated cookie reads as absent. Security keys on presence, UX on the `acct:` header. These need one rule.

**Smaller contradictions.**
- D-05: product wants usage admin-only "when accounts are enabled" and hidden from non-admins "in every mode" [Verified: product.md:118, 120]. Access-code-only mode has no admin identity [Inference: platform.md:176].
- D-13: platform's snippet drops the flag check the route keeps [Verified: platform.md:340-343; render/route.ts:34].
- D-14: QA's `wx` write can leave an empty file after a crash, which QA concedes [Verified: qa.md:137, 146]. Platform's B is safer.
- D-17: platform's `slice(1,6)` leaks message text [Measured: node -e]. QA's replace-then-first-frame form does not.

## 2. Unverified claims

- The three most load-bearing: D-10 Docker chain, confirmed by code. D-01 learner path and missing publish UI, confirmed. D-11 cost basis, refuted: the cost is requests, not derivations.
- OWASP 2^17 premise: [External] snippet only (platform.md:13).
- Refuted: "the 401 clears the cookie" (security.md:250).
- [Unverified] "No deployed users" (D-03). "Teachers share links" (product.md:38; no share control, product.md:52). "Providers never echo keys" (D-16).
- [Inference] "Spraying is bounded by scrypt throughput" (security.md:234) does not hold for one name under eviction.

## 3. Risks no role mentioned, or mentioned without a decision

1. **Guessable classroom ids** [not in memos]. [Verified: lib/server/classroom-storage.ts:70-72; app/api/classroom/route.ts:71, 97-104, 123-148] One-character ids are allowed. GET returns any classroom by id. Create-only lets anyone claim a guessable id first.
2. **Unbounded anonymous writes** [not in memos]. [Verified: route.ts:26] No body size check; each POST writes a file. [Verified: security.md:31] Open in ungated deployments. Platform body limits: [Unverified].
3. **Gate lockout of a class** [measured by security, not rated]. [Verified: app/api/access-code/verify/route.ts:27-31, 41-46] With the flag unset, 10 wrong codes per 15 minutes block new visitors. [Inference] Cookie holders still pass.
4. **Sign-out leaks anonymous courses** [noted at product.md:156; no option addresses it]. [Verified: app/api/auth/logout/route.ts:22; owner.ts:58-65] Pre-sign-in courses reappear for the next person on that browser.
5. **No spend ceiling** [partly in security]. [Verified: security.md:103, cited] Usage rows have no owner, so a leaked code means unlimited managed spend.

## 4. Challenge each recommendation

- **D-01 A:** Read capabilities are revocable only by delete. Accept with a publish control and a threat model.
- **D-02 B:** Signed-in is cheap under open registration, and job inputs carry no owner (security.md:100-101, cited). Accept with owner threading, tests, and D-03 C.
- **D-03 C:** Post-deploy sign-up needs a temporary open setting (security.md:127). Accept with that step documented.
- **D-04 A:** Keeps 2^16 against an unconfirmed standard. Accept with burst data or a confirmed OWASP page, then C, not B.
- **D-05 A:** Admin changes need a restart, and the agenda omits an audit row. Accept with audit and fail-closed additions.
- **D-06 B:** Defers the loss product rates highest, and claims have no undo. Accept with a claim-log spec and per-person confirmation.
- **D-07 A:** Learner text comes from templates (product.md:308), so skill review misses it. Accept with a sample generation showing skill-caused errors.
- **D-08 A:** Drafted access strings can lead a user to type an account password (ux.md:184). The UX config line changes nothing shipped [Inference]. Accept with a review gate on `accessCode.*`.
- **D-09 A:** A warning does not stop offline guessing of the code-keyed cookie (security.md:163-164, cited). Accept with a startup error below 12 characters.
- **D-10 C:** Unset keeps trust (security.md:209). Accept only with relative URLs when unset.
- **D-11 A:** Untrusted default unchanged. With trust, one school NAT lets eight failures lock a class for up to 15 minutes [Inference]. Accept with locked keys evicted last and a class-sized threshold.
- **D-12 A:** Users sit behind 401s with no prompt until next cycle. Accept with clear-cookie, duplicate handling, and a header re-check this cycle.
- **D-13 A:** The snippet drops the gate, so identity is attacker-chosen when unset. Accept with `if (process.env.TRUST_PROXY_HEADERS !== 'true') return 'direct';` kept.
- **D-14 B:** A link-less volume fails classroom creation with a 500. Accept with a startup probe and a lock-file fallback if the probe fails.
- **D-15 A:** A full-screen gate is a page, not a dialog. Accept once that is decided.
- **D-16 A, narrowed:** Broad scope removes the connection diagnostics BYOK users rely on. Accept, because that text is the user's own key.
- **D-17 B:** Diagnostics help only after a recurrence, and 14 clean runs take about an hour. Accept with QA's form and adversarial test.
- **D-18 A:** Teachers on several devices is the normal case. Accept with a one-session requirement and sign-out-others next cycle.

## 5. Open questions

- [Repo] Does any production build set NEXT_PUBLIC_PERSISTENCE (docker-compose.yml:12)? If none does, D-01 B breaks less.
- [Repo] Does the scene renderer use stored media `src` as-is?
- [Repo] Which verify routes use the server key when the client sends none (provider-config.ts:852-854)?
- [Product] Is more than nine sign-ins in four seconds plausible per process?
- [Product] Is one session per account required (D-18)?
- [Product] In access-code-only mode, is the usage panel hidden or open (D-05)?

## 6. Table

| Item | Accept | Confidence | Fact that would change it |
|---|---|---|---|
| D-01 | A | 0.7 | Publish control shipped, or no learner uses document links |
| D-02 | B, with D-03 C and owner threading | 0.5 | Job inputs shown to carry owners, with tests |
| D-03 | C | 0.7 | Product wants open registration behind the code |
| D-04 | A | 0.6 | Burst data under nine per four seconds, plus confirmed OWASP 2^17 |
| D-05 | A, explicit no-admin rule | 0.6 | Product rules out account-based admins |
| D-06 | B | 0.6 | A claim log and undo path |
| D-07 | A | 0.7 | Sample output with skill-caused learner errors |
| D-08 | A, review gate on accessCode.* | 0.6 | Native review finds errors in access strings |
| D-09 | A, startup error under 12 characters | 0.5 | Measured code entropy above the floor |
| D-10 | C, relative URLs when unset | 0.6 | Client cannot render relative media |
| D-11 | A, locked keys evicted last | 0.5 | Measured HTTP throughput makes the attack cheap or costly |
| D-12 | A, with clear-cookie and duplicates | 0.7 | Product requires anonymous continuation |
| D-13 | A, flag gate kept | 0.8 | Two-hop proxy topology |
| D-14 | B, with probe | 0.6 | Link-less volume found in a target deployment |
| D-15 | A | 0.8 | Gate becomes a page |
| D-16 | A, managed-key scope | 0.7 | Evidence that BYOK text carries credentials |
| D-17 | B, QA form | 0.7 | Cycle-2 log showing a timed-out test |
| D-18 | A | 0.7 | Product requires one session per account |
