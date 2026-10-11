# UX and accessibility rebuttal: meeting 01

Role: UX and accessibility lead (UX). Date: 2026-10-11. Branch: as set in `scrum/meetings/01-agenda.md:3`. Responds to the devil's advocate objections to D-03, D-06, D-08, D-09, D-12 and D-15.

[Partly unverified] Items tagged [Inference] or [Unverified] are not confirmed. Read-only: no production file, test, or git state changed. Git was used only for `show`, `diff` and `log`. The test suite was not run.

## 0. Method, tree state, corrections

- Each claim cites file:line, checked with Read or Grep this round. [Measured: parity script, exit 0, re-run; grep counts as stated.]
- **The working tree changed during this round.** Uncommitted edits (mtime 05:16-05:17 UTC) touch `lib/server/accounts/runtime.ts`, `components/account/account-dialog.tsx` and `lib/server/config-validation.ts` [Measured: `git diff HEAD`]. My memo cites HEAD. This rebuttal cites HEAD and the working tree separately, and treats working-tree text as a proposal, not a decision.
- A keyword search matched one line of `scrum/DECISIONS.md`. I did not open that file, and no position below relies on the match.

> Correction: I previously made an unverified claim. That was incorrect and should have been labeled.

1. My memo said no CI config runs the parity check. [Verified: the CI workflow `workflows/ci.yml:125-131` runs `pnpm check:i18n-keys`.]
2. My memo said no `ACCESS_COOKIE_SECRET` warning exists. True at HEAD. The working tree adds one. [Verified: `lib/server/config-validation.ts:180-184`, uncommitted.]
3. My memo said the access-gate lockout is one bucket per deployment. It is one bucket per server process, because the throttle is module-level [Verified: `app/api/access-code/verify/route.ts:12-16`]. The sign-in throttle has the same per-process scope [Verified: `README.md:401-402`].
4. My memo said option B needs a parity exception. It does not, if English text sits under the existing keys, because the check compares key names only. [Verified: `scripts/check-i18n-keys.mjs:69-82`.]

Resolved: the first-account path. `registerAccount` is called only from `app/api/auth/register/route.ts:24`, and `insertAccount` only from `lib/server/accounts/service.ts:134`. [Verified: grep.] The autosave outcome is traced under D-12, step 5.

## D-03: registration default and hint. Position changed: B to C

**Objections**
- **O1. Under B, a set `ACCESS_CODE` opens registration, so D-02 B passes for every code holder. Accept.** Option B says "except open when `ACCESS_CODE` is set" [Verified: `01-agenda.md:53`]. D-02 B makes signed-in accounts the managed-key gate [Verified: `01-agenda.md:45`]. If every code holder can register, that gate admits every code holder. Hosted mode uses an access code [Verified: `README.md:94`], so the clause reaches the main hosted case. Criterion 1 weighs security and privacy most [Verified: `01-agenda.md:17`]. My memo named the clause as an argument against and did not weigh it against criterion 1. That is the change.
- **O2. C needs a temporary open setting for the first account. Accept.** The only creation path is `registerAccount` [Verified: `app/api/auth/register/route.ts:24`]. No admin path exists [Verified: `app/api/persistence/[...path]/route.ts:156`]. One operator step is needed.
- **O3. "No deployed users" is unverified. Accept as unverified; it is now the top unknown.** The skill docs describe sign-in and per-account access codes at the hosted service [Verified: `skills/openmaic/SKILL.md:60`; `skills/openmaic/references/live-demo.md:10`]. [Inference] The hosted service may run an account build. [Unverified] Whether it runs this branch. If it does, C changes behaviour for existing users (criterion 4, `01-agenda.md:20`).
- **O4. Whether `open.maic.chat` runs the branch. Accept as unverified.** Same as O3.
- **O5. Product concedes C costs schools one variable. Accept.** The variable is `ACCOUNT_REGISTRATION=open`. The risk is a cohort that finds sign-up closed because the operator did not set it.

**Registration-closed copy and where the hint shows**
- Working tree: a muted paragraph above the fields, shown when registration is closed. It reuses `account.errors.registrationDisabled`: "New accounts are not open right now." [Verified: `lib/i18n/locales/en-US.json:2067`; `components/account/account-dialog.tsx` diff, +6 lines.]
- It shows on open, without typing. That part works.
- It is not the dialog description. The dialog links only the description, through `aria-describedby` [Verified: `node_modules/.pnpm/*react-dialog@1.1.15*/node_modules/*/dist/index.mjs:225`]. Focus lands on the username field [Verified: `account-dialog.tsx:177-180`], and its description is the username hint [Verified: `account-dialog.tsx:240`]. [Inference] A screen reader user on that field probably does not hear the paragraph. Not tested with assistive technology.
- "Right now" implies a temporary state, so a learner may wait for a change that does not come. [Inference] This reads from the copy alone; not tested with users.
- It does not reach a signed-out visitor who never opens the header's sign-in control. In a sign-in-only setup, signed-out persistence requests return 503 [Verified: `app/api/persistence/[...path]/route.ts:325-331`; `README.md:404-406`]. `/api/stages` returns the anonymous list with 200 when the runtime is configured [Verified: `app/api/stages/route.ts:36-42`]. [Inference] The library can look empty with no sign-in prompt. The README says that browser path was not checked [Verified: `README.md:406-407`].
- Minor: the username and password hints describe new-account rules and show in sign-in mode too [Verified: `account-dialog.tsx:242-262`]. Hide them in sign-in mode.

Proposed: the closed state becomes the dialog description, so it is linked and read on open. New key `account.dialog.registrationClosed`:

```tsx
<DialogDescription>
  {creating ? t('account.dialog.createDescription')
    : registrationOpen ? t('account.dialog.signInDescription')
    : t('account.dialog.registrationClosed')}
</DialogDescription>
```

Copy: "New accounts are closed on this site. If you already have an account, sign in." CI checks parity for all 12 locales [Verified: `ci.yml:125-131`], so the key needs a value in each. Until review it carries English text (D-08).
- Docs: `README.md:407` and `.env.example:528` describe the old default. Update both, with the first-account step.

**Position after rebuttal: C.** Closed unless `ACCOUNT_REGISTRATION=open` (the working-tree default). No `ACCESS_CODE` clause. Closed copy as the description. First-account step documented. Confidence 0.7. Cost M (copy in 12 locales, docs, tests). Reversal S (one variable).
- Would change it: a statement that every hosted cohort should self-register. Then the explicit `ACCOUNT_REGISTRATION=open` is the route, not the clause. Evidence that the hosted service already runs this code with accounts. Then keep its current behaviour (criterion 4).
- Most important unknown: whether the hosted service already runs an account build from this code.

## D-06: claim flow. Position: B (unchanged), modified

- **O1. B defers the highest-rated loss, and claims have no undo. Reject as a reason to move now.** The loss is visibility, not deletion. Courses stay in the browser [Verified: `README.md:399-400`; `lib/server/agent-runtime/owner.ts:58-66`]. A claim would move courses that may belong to another person sharing the browser. The only claim path is at create time, and it cannot reassign an owned course [Verified: `lib/persistence/owner-bound-document-store.ts:210-216`; `lib/persistence/stage-meta.ts:103-115`]. Criterion 1 (privacy) outweighs visibility.
- **O2. Accept with a claim-log spec.** One audit row per claimed course: account id, course id, time. A log supports a later undo design. It undoes nothing.
- **O3. Per-person confirmation. Modify.** [Inference] The UI cannot tell two people apart. The only identity event is sign-in. The prompt runs once per sign-in, which is the strongest check available.
- **O4 (risk 4). Sign-out leaks anonymous courses; no option addresses it. Accept.** My sign-out disclosure is a mitigation, not a fix. The leak exists today. Logout clears only the session cookie [Verified: `app/api/auth/logout/route.ts:20-22`], and signed-in requests ignore the anonymous cookie [Verified: `owner.ts:58`], so anonymous courses return at sign-out. My default, "Keep them here", keeps the leak for those courses. Stopping it needs a decision outside D-06: clear the anonymous cookie at sign-out (this orphans those courses), or claim them (option A). Security and product should decide that separately.

**Position after rebuttal: B.** The spec includes the claim log and a per-sign-in prompt. The sign-out leak becomes a separate decision. Confidence 0.6. Cost S for the spec (L to build). Reversal: none for the spec; a build needs an undo design first. Most important unknown: whether a claimed course can be moved back.
- Would change it: a copy-first design with an undo window (then A).

## D-08: translation drafts. Position: A, modified

- **O1. Drafted access strings can lead a user to type an account password. Reject the mechanism; accept the review gate.** No `accessCode` block in the 12 locales uses a password word [Measured: grep of every `accessCode` block and password term]. Example: de-DE title "Zugangscode eingeben" [Verified: `lib/i18n/locales/de-DE.json:2006`]. The gate field is `type="password"` [Verified: `components/access-code-modal.tsx:135`], as is the account password field [Verified: `components/account/account-dialog.tsx:253`]. [Inference] The masked field, not the wording, is the path to a wrong secret. Low likelihood; not observed. Mitigation: a visible label. The placeholder is the only text today [Verified: `access-code-modal.tsx:136`].
- **Concrete defect found.** zh-TW renders "access code" as 課堂碼 ("classroom code") in all three keys [Verified: `lib/i18n/locales/zh-TW.json:1991-1993`]. The term appears nowhere else in that file [Measured: grep count 3]. Review should correct it.
- **O2. The fallback line changes nothing shipped. Accept.** Every key is present in all 12 files [Measured: parity script, exit 0]. CI blocks missing keys [Verified: `ci.yml:125-131`]. The line matters only if a key goes missing at runtime [Verified: `lib/i18n/config.ts:39`]. Keep it as hygiene, not as a mitigation.
- **O3. Review gate on `accessCode.*`. Accept, extended.** The gate covers `account.*` and every new key this cycle: D-03 copy, D-12 status, and D-15 rate-limit and network-error text. Until review, a new key carries English text in non-English locales. Parity holds, and no fallback to Chinese occurs.

**Position after rebuttal: A, modified.** Keep the drafts; review before release; correct the zh-TW term; English text under new keys until review. Confidence 0.7. Cost S. Reversal S. Most important unknown: who reviews the strings, and before which release.

## D-09: access-cookie signing. Position: A, modified

- **Scope correction.** My memo said no missing-secret warning exists. True at HEAD. The working tree adds it, and adds a warning for an access code under 12 characters [Verified: `lib/server/config-validation.ts:170`, `:177-190`, uncommitted].
- **O1. A warning does not stop offline guessing. Accept.** A warning does not change exposure.
- **O2. "Startup error below 12 characters." Modify.** I read the 12 as the access-code length floor [Verified: `config-validation.ts:170`]. The secret floor is 32 [Verified: `lib/server/access-token-policy.ts:18`]. A set secret under 32 is ignored at runtime, with one log line at first use [Verified: `access-token-policy.ts:34-41`]. The working-tree check looks only for presence [Verified: `config-validation.ts:180`]. So:
  1. Boot warning for a set secret under 32, using the same constant. Accept. Cost S.
  2. Boot error for an access code under 12. Accept only if security rates offline guessing exploitable. The working-tree comment says warnings keep existing deployments booting [Verified: `config-validation.ts:175`]. A boot error is the clearer operator state. [Inference] A learner sees one re-prompt.
- **O3. Measured code entropy as the trigger. Accept as unknown.** [Unverified] The repo holds no measurement of operator codes.

```ts
// lib/server/config-validation.ts, validateAccessGate(): length check for a set secret
const secret = process.env.ACCESS_COOKIE_SECRET?.trim() ?? '';
if (secret && secret.length < ACCESS_COOKIE_SECRET_MIN_LENGTH) {
  warn(`ACCESS_COOKIE_SECRET is shorter than ${ACCESS_COOKIE_SECRET_MIN_LENGTH} and is ignored.`);
}
```

**Position after rebuttal: A, plus item 1; item 2 conditional on security.** Confidence 0.6. Cost S. Reversal S. Most important unknown: whether security rates offline guessing exploitable at the operator's code length.

## D-12: session expiry. Position: A, changed. A re-check alone is not enough this cycle

**What a learner sees when the session ends mid-use** (signed in when it ends)
1. The header keeps the username. It reads the session once on mount and has no listener [Verified: `components/account/account-control.tsx:39-55`].
2. Library: `/api/stages` sends no key and falls back to the anonymous owner [Verified: `app/api/stages/route.ts:38-42`; `lib/server/agent-runtime/with-owner.ts:18-24`; `owner.ts:58-66`]. The list commits without error [Verified: `lib/utils/stage-storage.ts:769-776`]. [Inference] The account's courses leave the view, with no message.
3. Opening an account course still works, because reads are allowed by id [Verified: `lib/persistence/document-access.ts:70-74`].
4. Saving fails. Persistence requests carry `x-learner-key: acct:…` [Verified: `lib/persistence/bootstrap.ts:98-106`]. They are refused with 401 `UNAUTHENTICATED` when `PERSISTENCE_DEV_TOKEN` is set [Verified: `lib/persistence/server-auth.ts:95`; `packages/@openmaic/storage/src/server/index.ts:409-415`], and with 503 when it is not [Verified: `app/api/persistence/[...path]/route.ts:325-331`]. A non-owner write is refused with 403 [Verified: `lib/persistence/document-access.ts:75-80`].
5. Autosave logs and retries, with backoff capped at 30 s [Verified: `lib/store/stage.ts:61-67`, `:90-102`, `:1158-1169`]. No UI reads the result. `saveToStorage` returns false after logging [Verified: `stage.ts:906-909`], and its callers ignore the value [Verified: `stage.ts:781`, `:1083`; `lib/classroom/load-classroom.ts:311`; `app/generation-preview/page.tsx:1051`]. No save-status or unsaved indicator exists in the editor path [Measured: grep]. [Inference] The edit stays in memory.
6. Agent calls and event streams fall back to the anonymous owner with no error [Verified: `lib/server/agent-runtime/with-owner.ts:54-56`; `app/api/stages/[id]/freshness/route.ts:51-52`; `app/api/agent/owner-events/route.ts:48-49`; `app/api/agent/sessions/[id]/events/route.ts:77-78`]. Streams cannot send headers [Verified: `components/workbench/workspace/WorkspaceShell.tsx:361`], so the server can use only the cookie for them.
7. Sign-in and sign-out reload the page [Verified: `components/account/account-dialog.tsx:128`; `account-control.tsx:91`]. The unload hook makes one best-effort save and no prompt [Verified: `lib/store/stage.ts:1236`]. [Inference] Edits made during the lapse are lost on reload.

**Verdict.** A re-check covers step 1 only. It does not stop the silent save loss (5), the reload that discards edits (7), or the silent switch to the anonymous owner for agent and stream calls (6). The root page shows its failure toast on every failed load [Verified: `app/page.tsx:281-293`]. The shared discovery hook does not: it returns before its toast whenever a list is showing [Verified: `lib/hooks/use-home-discovery.tsx:136`; toast at `:139`]. The README promises the toast and the kept list on persistence failure, including authentication errors [Verified: `README.md:377-379`]. So surfacing failures while a list shows is required by documented behaviour.

**Objections**
- **O1. The devil's advocate counts 25 route files that resolve the owner; three streams call `resolveRequestOwnerId` directly, so a wrapper rule misses them. Accept.** The three are the freshness, owner-events and session-events routes (cited in step 6). The workspace server action has no `Request` and reads `headers()` [Verified: `lib/workbench/workspace-actions.ts:12`, `:22`]. The rule goes in each caller of `resolveSignedInOwnerId`, through one shared helper.
- **O2. A rule in `resolveRequestAccount` turns `authenticated:false` into 401. Accept.** The session route depends on that value [Verified: `app/api/auth/session/route.ts:21-25`].
- **O3. "The 401 clears the cookie" is false. Accept as a fact; my memo did not claim it.** A clear helper exists [Verified: `lib/server/accounts/session.ts:52-55`; used by `logout/route.ts:22`]. Adding it to the 401 costs S.
- **O4. Duplicate cookies read as absent; security keys on presence and UX on the header; one rule is needed. Accept.** `readSessionCookie` returns undefined on duplicates [Verified: `session.ts:38-39`], so presence needs its own check. A duplicate set on a parent domain survives the clear, since the cookie has no Domain attribute [Verified: `session.ts:43-55`]. [Inference] Sign-in can then loop, which is rare. The copy must not say "expired" for that case.
- **O5. Users sit behind 401s with no prompt until next cycle; accept clear-cookie, duplicates and header re-check this cycle. Modify.** Accept all three this cycle. Add a visible status this cycle as well (steps 5 and 7).

**Work this cycle beyond the re-check.** The header needs new wiring: `auth-change` has listeners and no dispatcher [Measured: grep]. The owner-events stream would lose its health signal on 401, because the health observer ignores a closed stream [Verified: `lib/workbench/owner-session-client.ts:341-352`]. [Inference] The stream would then go silent. The workbench session does surface a closed stream [Verified: `lib/workbench/use-workbench-session.ts:251-253`]. [Unverified] How that renders.

```ts
// lib/server/agent-runtime/with-owner.ts: one presence rule for cookie and header (sketch)
const sessionSent = hasSessionCookieName(req.headers); // new: counts occurrences; readSessionCookie does not
const signedIn = await resolveSignedInOwnerId(req.headers);
if (sessionSent && signedIn === undefined) return sessionEnded(); // 401 SESSION_EXPIRED + clearSessionCookieHeader()
```

New copy (all 12 locales). Library: "Your session has ended. Sign in again to see your courses." Editor, shown only while changes are pending: "Your session has ended, so recent changes are not saved. Sign in again to keep them."

**Position after rebuttal: A, changed.** (a) Server: one presence rule across the wrapper, the three streams and the server action. (b) The 401 clears the cookie. (c) Failures surface while a list shows. (d) Header re-check through a new event. (e) A persistent status in the library and editor, not a transient toast. (f) Call the exported `flushStageSave` before the sign-in and sign-out reloads, and warn if it fails [Verified: `lib/store/stage.ts:1195`]. Confidence 0.6 (down from 0.7; scope grew). Cost M. Reversal S per step.
- Would change it: product requires anonymous continuation. Then C with a notice, and items (e) and (f) still apply to unsaved work.
- Most important unknown: whether unsaved edits survive a reload in server mode. [Unverified] No local copy appears in the save path I traced.

## D-15: access-code gate. Position: page semantics, not dialog (changed)

- **O1. A full-screen gate is a page, not a dialog. Accept; decision: page.** The gate is a fixed, full-viewport layer with an opaque background [Verified: `components/access-code-modal.tsx:58-65`]. It has no close control and no key handler (whole file), so dialog dismissal does not apply. Children stay mounted behind it [Verified: `components/access-code-guard.tsx:40-57`]. [Inference] They are reachable by Tab; not probed here. Page form: no `role="dialog"` or `aria-modal`; the background `inert`; the single `h1` kept [Verified: `access-code-modal.tsx:106-113`]; a labelled field; an always-mounted alert.
- **O2. Focus return. Reject for the gate.** Nothing closes, so there is no trigger to return to. After success, move focus to the page's main content. [Unverified] Which element exists on every route.
- **O3. Alert region. Accept, modified.** The error paragraph mounts inside `AnimatePresence` [Verified: `access-code-modal.tsx:177-190`]. [Inference] That is not a reliable live region. Use an always-mounted `role="alert"`, as the account dialog does [Verified: `account-dialog.tsx:266-269`]. Clear it at submit start [Verified: `account-dialog.tsx:119`], so an identical repeated error is announced again.
- **Focus loss on error.** `focus()` runs while the field is disabled [Verified: `access-code-modal.tsx:46` with `:149`]. My memo's headless probe showed focus on body afterwards [Measured in the memo]. Change: make the field `readOnly` during submit, and use `aria-disabled` on the button. The existing guard at `:29` still blocks a second submit.
- **O4 (risk 3). Gate lockout of a class. Accept as a risk; change the copy.** With `TRUST_PROXY_HEADERS` unset, all clients share the key `direct` [Verified: `app/api/access-code/verify/route.ts:27-32`], per process. A visitor with the correct code can be refused because of other people's attempts. The copy must not blame that visitor: "Access is paused after too many failed attempts. Try again in N minutes." The server sends `Retry-After` [Verified: `route.ts:42-45`], but the client does not read it [Verified: `access-code-modal.tsx:40-49`].
- **Network failure.** The catch branch shows "Invalid access code" [Verified: `access-code-modal.tsx:48-49`]. A network error is not a wrong code. Use a separate key.

```tsx
// components/access-code-guard.tsx: children stay mounted but unreachable while the gate is up
<div inert={needsAuth ? true : undefined}>{children}</div>   // [Inference] The wrapper may affect layout CSS.

// components/access-code-modal.tsx
<input id={codeId} readOnly={loading || success}            // not disabled: focus stays in the field
  aria-invalid={error ? true : undefined}
  aria-describedby={error ? errorId : undefined} />
<button type="submit" aria-disabled={!code || loading || success}
  aria-label={t('accessCode.submit')} />                    // new key, all 12 locales
<p id={errorId} role="alert">{error}</p>                    // always mounted; set to '' at submit start
```

React 19.2.3 is in use [Verified: `package.json:143`]. The React DOM build contains `inert` [Measured: grep]. Boolean behaviour not tested.

**Position after rebuttal: page semantics.** Inert background; labelled field; always-mounted alert; focus kept in the field; no focus return; new keys for rate limit and network error. Confidence 0.8. Cost S (M with the new keys across 12 locales). Reversal S.
- Would change it: a decision to keep a dialog. Then the full dialog contract applies (modal, background hidden, focus contained), and the page changes drop out.
- Most important unknown: how often visitors see the lockout text.

## Cross-item dependencies

- D-08 first. New keys for D-03, D-12 and D-15 need values in all 12 locales (CI parity, `ci.yml:125-131`).
- D-09 and D-12 share one bug class, stale auth state. One presence rule covers both (accepted from the devil's advocate).
- D-03 and D-12 depend on whether the target deployment sets `PERSISTENCE_DEV_TOKEN` (`README.md:404-406`).
- D-06 needs security review of any client-supplied key (unchanged).

## Summary

| Item | Position after rebuttal | Confidence (0-1) | Cost | Most important unknown |
|---|---|---|---|---|
| D-03 | C (changed from B): closed unless `ACCOUNT_REGISTRATION=open`; closed copy as dialog description; first-account step documented | 0.7 | M | Whether the hosted service already runs an account build from this code |
| D-06 | B (unchanged): claim log and per-sign-in prompt in spec; sign-out leak decided separately | 0.6 | S | Whether a claimed course can be moved back |
| D-08 | A, modified: keep drafts; review gate on `account.*`, `accessCode.*` and new keys; correct zh-TW term | 0.7 | S | Who reviews the strings, and before which release |
| D-09 | A, modified: boot warning for a set secret under 32; boot error for an access code under 12 only if security rates it exploitable | 0.6 | S | Whether security rates offline guessing exploitable |
| D-12 | A, changed: visible status this cycle; one presence rule; flush before reload | 0.6 | M | Whether unsaved edits survive a reload in server mode |
| D-15 | Page semantics, not dialog (changed): inert background, labelled field, always-mounted alert, focus kept in field | 0.8 | S | How often visitors see the lockout text |
