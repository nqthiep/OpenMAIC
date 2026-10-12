# UX and accessibility memo: meeting 01

Role: UX and accessibility lead (UX). Date: 2026-10-11. Branch: `claude/hopeful-sagan-267tw5`.
Items: D-03, D-06, D-08, D-09, D-12, D-15, plus checks 1 to 4 from the brief.

**Label status.** This memo contains [Inference] and [Unverified] items. Each is tagged where it appears. No recommendation depends on an untagged claim.

## 0. Method and corrections

**Method.** Read-only. The only file written is this memo.
- [Measured: `node` with i18next 26.0.1 from `node_modules`, options copied from `lib/i18n/config.ts:37-43`, resources read from `lib/i18n/locales/*.json`.]
- [Measured: `node scripts/check-i18n-keys.mjs`, exit 0.]
- [Measured: headless Chromium, build 1194, at `/opt/pw-browsers/chromium`. An inline page, served by a local server that the probe started and stopped, reproduces the call order at `components/access-code-modal.tsx:27-53`. It does not run the React component.]
- [Measured: read-only git queries (`log`, `branch --contains`, `tag --contains`).]
- The test suite was not run.

**Corrections to the agenda.** Each rests on code.
1. D-09 says "Changing the secret signs everyone out." [Verified: `lib/server/access-token-policy.ts:28-44`, `app/api/access-code/verify/route.ts:77`, `app/api/access-code/status/route.ts:14`, `middleware.ts:76`.] The secret signs access-gate cookies only. Account sessions are random tokens stored as SHA-256 digests and do not use it [Verified: `lib/server/accounts/session.ts:14-20`]. The shipped docs say "signs every visitor out" about the gate [Verified: `.env.example:556`]. [Inference] Operators may read that as covering accounts.
2. D-08 says "fall back to English." The configured fallback is `zh-CN` [Verified: `lib/i18n/config.ts:38-39`, `lib/i18n/types.ts:4-5`], and the measured fallback is Chinese (check 3).
3. D-03 asks whether accounts have deployed users. [Measured: `git branch -a --contains 95463b5` lists only `claude/hopeful-sagan-267tw5` and its remote; `git tag --contains` is empty.] Whether any server runs this branch is [Unverified].
4. D-12 says requests "may then silently use the anonymous owner for documents." Confirmed for documents and the library list. Runtime requests carrying the stale account key are refused [Verified: `lib/persistence/server-auth.ts:95`].
5. B23 (`scrum/BACKLOG.md:116`) says the access modal "may lack dialog semantics." Confirmed in check 1.

## Check 1: accessibility differences between the two components

| # | Aspect | `access-code-modal.tsx` | `account-dialog.tsx` | WCAG 2.2 |
|---|---|---|---|---|
| 1 | Dialog role | None. A `motion.div` overlay [Verified: `:58-59`] | `role="dialog"` from Radix [Verified: `node_modules/.pnpm/@radix-ui+react-dialog@1.1.15*/node_modules/@radix-ui/react-dialog/dist/index.mjs:223`] | 4.1.2 (A) |
| 2 | `aria-modal` | Absent | Set on the content [Verified: `:174`]. The Radix `dist/index.mjs` has no `aria-modal` literal [Measured: grep] | 4.1.2 (A) |
| 3 | Dialog name | `<h1>` not linked to any dialog [Verified: `:106-113`] | `DialogTitle` [Verified: `:187-189`]; Radix links it to the dialog [Inference] | 1.3.1 (A), 4.1.2 (A) |
| 4 | Input label | Placeholder is the only text [Verified: `:136`] | Visible `<Label htmlFor>` [Verified: `:229`, `:248`] | 3.3.2 (A), 1.3.1 (A) |
| 5 | Field hints | None | Linked by `aria-describedby` [Verified: `:240`, `:258`] | 1.3.1 (A) |
| 6 | Invalid field | Border colour only; no `aria-invalid`, no link to the error [Verified: `:146-147`] | `aria-invalid` and `aria-describedby` [Verified: `:239-240`, `:257-258`] | 1.3.1 (A), 4.1.2 (A) |
| 7 | Error text | One string for every failure, including a 429 lockout [Verified: `:44`, `:49`; `en-US.json` `accessCode.error`; `app/api/access-code/verify/route.ts:41-46`] | Mapped per error code [Verified: `:79-110`] | 3.3.1 (A), 3.3.3 (AA) |
| 8 | Error announced | Conditionally mounted `<p>`, no role or live region [Verified: `:178-190`] | Always-mounted `role="alert"` [Verified: `:266-269`] | 4.1.3 (AA) [Inference on AT behaviour] |
| 9 | Submit control name | Icon only; no `aria-label`, no text [Verified: `:152-174`] | Text label that changes while pending [Verified: `:163-169`, `:287`] | 4.1.2 (A) |
| 10 | Pending state | Spinner only; input disabled [Verified: `:149`, `:161-162`] | `aria-busy` on the form; text label; spinner hidden from AT [Verified: `:226`, `:281-286`] | 4.1.3 (AA) |
| 11 | Focus on open | Input focused in an effect [Verified: `:21-25`] | Username focused [Verified: `:177-180`] | 2.4.3 (A): both pass |
| 12 | Focus after failure | `focus()` runs while the input is still disabled, so it does nothing [Verified: `:46` with `:149`]. Measured: focus ends on `<body>` [Measured: probe below] | Focus moved to the field, which is never disabled [Verified: `:134`]. Focus moved off the submit button before it disables [Verified: `:116-118`] | 2.4.3 (A) [Inference: focus loss to `<body>` is assessed under this criterion] |
| 13 | Focus after success | Input disabled on success [Verified: `:149`]; focus is lost the same way [Inference] | Not applicable | 2.4.3 (A) |
| 14 | Focus return | None; the gate cannot close | Returns to the trigger [Verified: `:181-184`] | APG pattern, not WCAG |
| 15 | Containment | None. Children stay mounted and focusable behind the overlay [Verified: `components/access-code-guard.tsx:40-57`] | Radix calls `hideOthers` on the content [Verified: `index.mjs:137`], which hides the rest of the page from AT [Inference: modal mode only]. Focus scope [Inference] | 2.4.3 (A) |
| 16 | Escape | Not handled; the gate cannot be dismissed | Dismisses; blocked while pending [Verified: `:151-154`]. The Escape binding is a Radix default [Inference] | APG pattern, not WCAG |
| 17 | Touch target | Submit icon 32 px [Verified: `:156`, `h-8 w-8`] | Not measured | 2.5.8 (AA): pass for the access button |
| 18 | Motion | No reduced-motion handling in the component [Verified: `:87-93`]. A global MotionConfig was not checked [Unverified] | `motion-reduce:animate-none` [Verified: `:176`, `:283`] | 2.3.3 is AAA; not an AA item |
| 19 | Autocomplete | `off` [Verified: `:150`]; reasonable for a shared code | Username, current and new password [Verified: `:233-254`] | 1.3.5 (AA) applies to the account fields |

**Probe result.** [Measured: focused input, then `disabled = true`: active element is `body` at once. `focus()` while disabled: still `body`. After re-enabling: `body`. Enabling first and then calling `focus()`: the input again.] This matches the call order in `access-code-modal.tsx:46` and `:149`.

**Summary.** The gate lacks the dialog contract that Radix gives the account dialog. It also has four AA-level gaps that the account dialog does not have: no programmatic label (3.3.2), errors not announced (4.1.3, [Inference] on AT behaviour), no name on the submit control (4.1.2), and focus lost on error (2.4.3).

## Check 2: D-12, what a signed-in user sees after expiry

| Step | What happens | Evidence |
|---|---|---|
| 1 | The header reads the session once on mount and never refreshes it. The username stays after expiry | [Verified: `components/account/account-control.tsx:39-55`, `:84`] |
| 2 | Account sessions last 30 days from issue. The browser cookie uses the same Max-Age, so the browser stops sending it about when the row expires | [Verified: `lib/server/accounts/session.ts:9`, `:43-45`; `lib/server/accounts/service.ts:95`; `lib/server/accounts/store.ts:134-135`]. Clock alignment [Inference] |
| 3 | The page keeps its account key for its whole lifetime and sends it as `x-learner-key` | [Verified: `lib/persistence/bootstrap.ts:92-95`, `:98-106`] |
| 4 | Documents: with no live session the owner falls back to the anonymous cookie. The document authenticator returns that owner and never reads the header | [Verified: `lib/server/agent-runtime/owner.ts:58-66`; `lib/server/agent-runtime/with-owner.ts:54-56`; `app/api/persistence/[...path]/route.ts:139`] |
| 5 | Runtime: a stale `acct:` key is refused. 401 when `PERSISTENCE_DEV_TOKEN` is set, 503 when it is not | [Verified: `server-auth.ts:95`; route `:325-331`; `packages/@openmaic/storage/docs/reference-server.md:77-92`; `scrum/BACKLOG.md:105`] |
| 6 | Library: `/api/stages` sends no header. It resolves the anonymous owner and lists that owner's courses | [Verified: `lib/utils/stage-storage.ts:770`; `app/api/stages/route.ts:35-43`; `lib/persistence/owner-bound-document-store.ts:129-139`]. The wrapper `getOwnerScopedDocumentStore` was not read [Unverified] |
| 7 | The client commits that list without error. If a later reload fails while a list is showing, the error is dropped | [Verified: `lib/hooks/use-home-discovery.tsx:122-133`, `:136`] |
| 8 | Classroom open: reads are not owner-checked, so the course opens. The `/api/classroom` fallback is id-only | [Verified: `lib/persistence/document-access.ts:70-74`; `lib/persistence/owner-bound-document-store.ts:120-127`, `:195`; `app/api/classroom/route.ts:123-148`]. The client path `accessDocument` (`lib/document-store/migration.ts:624`) was not traced [Unverified] |
| 9 | Classroom save: a write to an account-owned course is refused with 403 `FORBIDDEN_DOCUMENTS` | [Verified: `lib/persistence/document-access.ts:75-80`; test `tests/accounts/owner-isolation.test.ts:394-399`]. The user-visible message is [Unverified]. `lib/utils/stage-storage.ts` and `lib/store/stage.ts` contain no toast calls [Measured: grep] |
| 10 | The `auth-change` listeners never fire | [Verified: `lib/hooks/use-home-discovery.tsx:194-199`; `lib/workbench/agent-skills.ts:134`]. No dispatch found in ts and tsx files [Measured: grep] |

The repo's own test asserts that after sign-out the stage list is `{stages: []}` [Verified: `tests/accounts/owner-isolation.test.ts:390-392`]. The test was not executed.

**What the signed-in user sees, in order.**
- [Inference] Right after expiry, nothing changes on screen.
- [Inference] On the next list load (reload, move, delete, or import), the list switches to the anonymous owner's courses. That list may be empty, or it may show older courses made in this browser before sign-in. No message appears.
- [Verified: path] A classroom save is refused with 403. The message is [Unverified].
- [Verified: path] Agent and chat calls fail with 401 or 503, depending on whether `PERSISTENCE_DEV_TOKEN` is set.

The README says that on a persistence failure the home page must not show "an empty library" [Verified: `README.md:377-379`]. Expiry produces that symptom without a failure signal [Inference].

**Access gate, same pattern.** `AccessCodeGuard` checks status once [Verified: `components/access-code-guard.tsx:14-36`]. When the cookie stops validating, API calls return 401 [Verified: `middleware.ts:81-86`]. The open page keeps rendering until reload [Inference].

## Check 3: D-08, i18n configuration and fallback

- Config: `lng: defaultLocale` and `fallbackLng: defaultLocale` [Verified: `lib/i18n/config.ts:38-39`]. `defaultLocale` is `'zh-CN'` [Verified: `lib/i18n/types.ts:4-5`]. The parity source is `en-US` [Verified: `scripts/check-i18n-keys.mjs:5`].
- Measured (i18next 26.0.1, same options, resources from the repo):

| Lookup | Observed |
|---|---|
| de-DE `accessCode.title`, missing in de-DE, present in zh-CN | "请输入访问码" (Chinese) |
| de-DE `account.errors.generic`, missing in de-DE | "出现问题，请重试。" (Chinese) |
| de-DE `accessCode.placeholder`, missing in de-DE and zh-CN | "accessCode.placeholder" (the key itself) |
| en-US `accessCode.title`, `account.errors.generic` | English text |

- Shipped strings: parity passes for 12 locale files [Measured: `node scripts/check-i18n-keys.mjs`, exit 0]. [Inference] No shipped key reaches the fallback today.
- Enforcement: the script is wired as `check:i18n-keys` [Verified: `package.json:19`]. No CI config referencing it was found [Verified: grep of `.github`, which returned nothing]. Other CI systems [Unverified].
- Guide: no fallback or review rule [Verified: `lib/i18n/TRANSLATION_GUIDE.md`; grep for fallback, draft, review, and english returned nothing].
- Scope: 33 leaf strings under `account.*` and `accessCode.*` in en-US; two use `{{interpolation}}` [Measured: script over `lib/i18n/locales/en-US.json`]. B13 names only the `account` blocks [Verified: `scrum/BACKLOG.md:106`]. The provenance of the `accessCode.*` strings in the other locales is [Unverified].
- Option B as written: an English fallback needs `fallbackLng` changed to `en-US` and the drafts removed, which the parity check forbids. Left unchanged, option B would show Chinese text to German, French, and other users for any missing key.

## Check 4: D-06, the claim prompt

**Current behaviour.**
- Anonymous owner: `anon:<uuid>` from an HttpOnly `anonymous_id` cookie, 30 days [Verified: `lib/server/agent-runtime/owner.ts:22-28`, `:53-66`].
- Signed-in requests never read that cookie [Verified: `owner.ts:58`].
- Logout clears only the session cookie [Verified: `app/api/auth/logout/route.ts:22`]. [Inference] Earlier anonymous courses reappear after sign-out in the same browser.
- The device learner key lives in the browser's device KV and is sent as `x-learner-key` [Verified: `lib/runtime/learner-key.ts:4-8`; `lib/persistence/bootstrap.ts:83`, `:103`]. The HTTP merge route is refused [Verified: `app/api/persistence/[...path]/route.ts:155`].
- The README documents that pre-sign-in courses stay in the browser [Verified: `README.md:399`]. The backlog rates B2 High [Verified: `scrum/BACKLOG.md:95`].
- The owner-bound store exposes no method that reassigns `owner_id` [Verified: `lib/persistence/owner-bound-document-store.ts:78-170`]. Its only claim is at create time [Verified: `:216`]. The inner `PgDocumentStore` was not read [Unverified].

**Proposed prompt (plain language).**

> **Move your courses to your account?**
> Before you signed in, you made {{count}} course(s) in this browser. Moving them adds them to your account, so you can open them after you sign in on any device. Only the courses listed below move. Your settings and playback position stay in this browser.
>
> [course name and date created, one per line]
>
> If other people use this browser, choose **Keep them here**. Anyone who uses this browser while signed out can open courses that stay here.
>
> [**Move {{count}} course(s)**] [**Keep them here**]

**Behaviour.**
- Opens once, right after a successful sign-in or account creation. Never on page load, never silently.
- Initial focus and Escape both select "Keep them here." No close icon.
- After the action, a status message: "Moved {{count}} course(s) to your account." or "Nothing was moved."

**What it promises.**
- The listed courses move, and only those.
- They then appear in the account on any device where the user signs in.
- If the move fails, no course moves. D-06 option A in the agenda requires one transaction [Verified: `scrum/meetings/01-agenda.md:76`].
- "Keep them here" changes nothing.

**What it does not promise.**
- It does not say the move can be undone. No reverse path exists in the code I read (check 4, owner-bound store). If the spec adds one, the copy changes.
- It does not move settings, playback position, or device-only runtime data [Verified: `README.md:366-367`].
- It does not hide courses from other people who use the browser [Verified: `lib/server/agent-runtime/owner.ts:22-28`].
- It does not promise that courses kept here will appear on another device.

**Shared-browser handling.**
1. Confirmation by name. The button states the count, and the list appears above it. WCAG 3.3.4 (AA) applies because the action changes stored user data. A listed, named confirmation fits the "confirmed" branch [Inference: the criterion accepts reversible, checked, or confirmed].
2. Safe default. Focus and Escape select "Keep them here."
3. Disclosure at sign-out. When anonymous courses remain, the sign-out item says they stay here and are visible to the next user. Do not rotate the anonymous cookie on sign-out: that would orphan them [Inference].
4. The UI cannot tell two people apart. Disclosure and a safe default are the protection, not identity [Inference].
5. Server. The preview and claim endpoints must read the anonymous cookie explicitly, because the normal resolver ignores it for signed-in requests [Verified: `owner.ts:58`]. A client-supplied device key would act as a bearer capability for the runtime data it names [Inference; security lead to confirm].
6. Accessibility. `role="dialog"` with a name; the result in `role="status"` (4.1.3) [Inference: standard pattern].

**Notice for this cycle (copy only).** Show "Courses you made before signing in are still in this browser. Sign out to see them." only when a device-local flag was set at course creation while signed out. The app cannot read the HttpOnly cookie, so an unconditional notice would be false for some users [Inference].

## Item positions

Each item gives: recommended option, evidence, strongest argument against, cost, reversal, confidence, and what would change the position.

### D-03: Registration default (B14)

- **Recommended: B**, with two conditions: a closed-state line in the sign-in dialog, and a README line on first-account setup. Without both, B is a dead end.
- **Evidence.** Default open [Verified: `lib/server/accounts/runtime.ts:27-28`]. When closed, the mode toggle is hidden and the dialog is forced to sign-in [Verified: `components/account/account-dialog.tsx:74`, `:197`]. The dialog then shows "Sign in" and "Enter your username and password." and nothing about registration [Verified: `lib/i18n/locales/en-US.json` `account.dialog`; `account-dialog.tsx:186-195`]. A name that does not exist gets "Incorrect username or password.", the same message as a wrong password [Verified: `lib/server/accounts/service.ts:148`, `:166-170`; `account-dialog.tsx:90-91`]. The username rules are shown in sign-in mode too [Verified: `account-dialog.tsx:242-262`].
- **First account.** No admin path exists; `authorizeAdmin` returns false [Verified: `app/api/persistence/[...path]/route.ts:156`]. The only creation path I read is `registerAccount` [Inference: I did not grep for every `insertAccount` caller]. So the first account needs a temporary open setting.
- **Signed-out visitors.** With `PERSISTENCE_DEV_TOKEN` unset, signed-out persistence requests return 503 [Verified: `route.ts:325-331`; `README.md:404-406`]. The README says the browser behaviour there "has not been checked in a real browser" [Verified: `README.md:406-407`]. A closed default makes that the common case [Inference].
- **Copy.** Add `account.registrationClosed`: "New accounts are not open on this server. If you already have an account, sign in." Do not promise that the app works without an account; the sign-in-only setup may not allow it [Verified: `README.md:404-406`].
- **Strongest argument against.** The default slows first-run setup and leaves a dead end for anyone without an account. It also opens when ACCESS_CODE is set, so the protection covers only deployments without a code. A private deployment pays the friction and gets nothing back.
- **Cost.** M: copy in 12 locales (depends on D-08), the default change, updates to `tests/accounts/routes.test.ts` (around lines 419-440), README, and `.env.example:526-528`.
- **Reversal.** S: flip the default in `runtime.ts`, or set `ACCOUNT_REGISTRATION=open`. No data changes.
- **Confidence.** 0.6.
- **What would change my position.** A product statement that deployments are private (then A is fine for UX). A D-08 decision that delays the translated copy (then the closed-state line would ship in English only, which is worse than shipping it later).
- **Most important unknown.** Does the target deployment set `PERSISTENCE_DEV_TOKEN`?

### D-06: Claim flow (B2)

- **Recommended: B.** Write the spec now and implement next cycle. Add the device-flag notice now (copy only).
- **Evidence.** Check 4.
- **Strongest argument against.** B2 is the highest-severity open item in the backlog [Verified: `scrum/BACKLOG.md:95`]. Deferring keeps the vanish-on-sign-in problem for another cycle, and the notice only says where the courses went. A claim done as one transaction over `owner_id` looks small.
- **Cost.** Spec: S. Implementation: L. It covers documents, folders, agent sessions, skills, and materials, plus a separate design for device-keyed runtime data [Inference].
- **Reversal.** Spec: none needed. Implementation: moved rows have no reverse path in the code I read, so a claim is hard to undo. That is the main reason for B.
- **Confidence.** 0.6.
- **What would change my position.** A copy-first design with an undo window (then A). Evidence that the claim is a single reversible statement (then A-lite).
- **Most important unknown.** Whether a claimed course can be moved back.

### D-08: Translation drafts (B13)

- **Recommended: A.** Keep the drafts. Make native review a release gate. Change one line now, and reject the parity exception.

```ts
// lib/i18n/config.ts:39
fallbackLng: 'en-US', // was defaultLocale (zh-CN); en-US is the parity source
```

- **Evidence.** Check 3.
- **Strongest argument against.** Machine drafts in the sign-in and access-code prompts carry risk. "Access code" rendered as "password" could lead a user to type an account password into the gate. The access-code prompt is shown to every visitor when ACCESS_CODE is set. An English fallback for `accessCode.*` alone is safer until review. That is option B for one namespace.
- **Cost.** S: the review gate and the config line.
- **Reversal.** S: the drafts stay in git; the config line reverts.
- **Confidence.** 0.6.
- **What would change my position.** No reviewer before release (then B for `accessCode.*`). Evidence of user confusion with the drafts.
- **Most important unknown.** Who reviews the 33 strings in 11 locales, and before which release.

### D-09: Default signing for access cookies

- **Recommended: A** as written, with the docs corrected ("re-prompts visitors for the access code; accounts are not affected"), and the stale-page behaviour addressed.
- **Evidence.** Correction 1. Startup warnings belong in `validateServerConfig()`, which runs at boot [Verified: `instrumentation.ts:40`]. The `warn` helper is `lib/server/config-validation.ts:38-39`. No ACCESS_COOKIE_SECRET warning exists. The only related warning is for a short secret [Verified: `lib/server/access-token-policy.ts:34-41`].
- **User impact of rotation.** Each gate visitor sees the code prompt on the next page load [Inference]. Open pages break silently: API calls get 401 and the guard does not re-check [Verified: `middleware.ts:81-86`; `components/access-code-guard.tsx:14-36`]. [Inference] The account control also stays hidden until reload. It reads the session once on mount [Verified: `components/account/account-control.tsx:39-55`]. The gate's `onSuccess` refetches only providers [Verified: `components/access-code-guard.tsx:45-54`]. The middleware does not exempt `/api/auth/session` [Verified: `middleware.ts:70-72`]. `AccountControl` sits inside the children that the guard wraps [Verified: `app/layout.tsx:52`; `components/header.tsx:94`].
- **Snippet.**

```ts
// lib/server/config-validation.ts (sketch), called from instrumentation.ts:40
if (process.env.ACCESS_CODE && !process.env.ACCESS_COOKIE_SECRET?.trim()) {
  warn(
    'ACCESS_CODE is set without ACCESS_COOKIE_SECRET. Access cookies are signed with the code, so a captured cookie can be checked offline. Use a secret of 32+ characters. Changing it re-prompts visitors for the access code; account sessions are not affected.',
  );
}
```

- **Strongest argument against.** Offline guessing is not throttled. The limit counts only verify requests [Verified: `app/api/access-code/verify/route.ts:41-49`], and the README calls the default weaker [Verified: `README.md:296`]. The security lead may rank this above UX. Requiring the secret (option B) then becomes right, at the cost of breaking deployments that have not set it [Inference].
- **Cost.** S.
- **Reversal.** S: remove the warning.
- **Confidence.** 0.8.
- **What would change my position.** The security lead rates offline guessing as exploitable (then B). Evidence that operators rotate the code often (then the re-prompt cost matters more).
- **Most important unknown.** How often deployments rotate the code or the secret.

### D-12: Behaviour when a session expires

- **Recommended: A.** The server fails closed with 401 `SESSION_EXPIRED` when a request carries an account key without a live session. Two client changes belong in this cycle, not the next: (1) a session failure must not be dropped when a list is already shown; (2) the header must re-check the session after a failure. The prompt copy can wait.
- **Why not B.** A reload needs a signal, and the browser gives none until a request fails. B therefore needs the same server signal as A, so A is the cheaper path. A reload also loses unsaved edits unless saves are flushed first [Inference].
- **Why not C.** The list switches silently, the header keeps showing the old account, and saves fail without a clear message.
- **Snippets.**

```ts
// app/api/persistence/[...path]/route.ts, inside the withRequestOwnerId callback,
// before the 503 check at line 325
if (!signedIn && request.headers.get('x-learner-key')?.startsWith('acct:')) {
  return jsonError(401, 'SESSION_EXPIRED', 'Your session has ended. Sign in again.');
}
```

```ts
// lib/hooks/use-home-discovery.tsx:136: surface the failure even when a list is shown
fail: (err) => {
  if (isSessionExpired(err)) { onSessionExpired(); return; }
  if (stateRef.current === 'ready') return;
  // ...existing error path
}
```

`/api/stages` needs both halves. The client sends the memoised key (`getPersistenceLearnerKey()` in `lib/persistence/bootstrap.ts`) in `listOwnerStagesFromServer` (`lib/utils/stage-storage.ts:770`), and the GET route applies the same check (`app/api/stages/route.ts:35-43`). Today it sends no header [Verified: `stage-storage.ts:770`].

- **Evidence.** Check 2.
- **Strongest argument against.** A turns a silent fallback into an error for users whose cookie simply aged out. Some would rather continue anonymously with a notice. The cookie-ambiguity rule also needs care: when two session cookies share a name, `readSessionCookie` returns undefined [Verified: `lib/server/accounts/session.ts:22-41`]. A valid user could then see "session ended." The copy must say "sign in again," not "expired."
- **Cost.** M: server check, `/api/stages` header, client branch, header re-check.
- **Reversal.** S: remove the check and the branch. No data changes.
- **Confidence.** 0.7.
- **What would change my position.** Product wants anonymous continuation (then C with a notice). Evidence that a refused classroom save already shows a clear message (lower urgency for the client change).
- **Most important unknown.** What a refused classroom save shows today [Unverified].

### D-15: Access-code prompt semantics

- **Recommended: A.** Adopt the account dialog's semantics, with three gate changes: no Escape dismissal, no focus return, and status-specific error text. Also address the focus loss and the placeholder-only label.

```tsx
// components/access-code-modal.tsx (sketch)
const codeId = useId();
const errorId = `${codeId}-error`;
const refocusAfterError = useRef(false);

useEffect(() => {                       // runs after the input is enabled again
  if (!loading && refocusAfterError.current) {
    refocusAfterError.current = false;
    inputRef.current?.focus();
  }
}, [loading]);
// non-OK branch: refocusAfterError.current = true;   (replaces inputRef.current?.focus())

// JSX
// <label htmlFor={codeId} className="sr-only">{t('accessCode.placeholder')}</label>
// <input id={codeId} aria-invalid={error ? true : undefined}
//        aria-describedby={error ? errorId : undefined} ... />
// <button type="submit" aria-label={t('accessCode.submit')} ...>   // new key, all 12 locales
// <p id={errorId} role="alert" ...>{error}</p>                      // always mounted
```

- **Status mapping.** 429 gets its own text, "Too many attempts. Try again in N minutes.", built from `Retry-After` [Verified: `app/api/access-code/verify/route.ts:43-44`]. Other failures get the generic text. Keep the typed code on 429 and 5xx.
- **Success path.** Move focus to the main landmark, because the input is disabled on success [Verified: `components/access-code-modal.tsx:149`] [Inference on the focus target].
- **Evidence.** Check 1 and the probe.
- **Strongest argument against.** A full-screen gate is a page, not a dialog. A page with a main landmark, one h1, a labelled field, and a `role="alert"` meets the same criteria with less machinery. Modal semantics on a surface that cannot be dismissed add a dependency to the one path every visitor needs.
- **Cost.** S: labels, alert, focus. M if the status mapping and new keys land together.
- **Reversal.** S: revert the component.
- **Confidence.** 0.8.
- **What would change my position.** A decision to make the gate a page (then the same criteria apply to the page, and the dialog parts drop).
- **Most important unknown.** How often users see the 429 lockout text. When `TRUST_PROXY_HEADERS` is unset, all visitors share one lockout bucket for 15 minutes [Verified: `README.md:296`; `app/api/access-code/verify/route.ts:27-31`, `:41-46`].

## Cross-item dependencies

- D-08 first: new strings for D-03 and D-15 would otherwise fall back to Chinese.
- D-09 and D-12 share one bug class: stale pages after an auth change. One pattern (re-check on 401) can cover both [Inference].
- D-06 needs the security lead's review of any client-supplied key.
- D-03 and D-12 depend on `PERSISTENCE_DEV_TOKEN` in the target deployment (platform lead).

## Questions for the coordinator

1. Is `PERSISTENCE_DEV_TOKEN` set on the target deployment? (D-03, D-12)
2. Does product want an expiry path that continues anonymously? (D-12)
3. Who does native review, and before which release? (D-08)
4. Is open sign-up intended for any deployment? (D-03)
5. Must claimed courses be undoable? (D-06)

## Summary

| Item | Recommended option | Confidence | Cost | Most important unknown |
|---|---|---|---|---|
| D-03 | B: closed by default, with closed-state copy and first-account setup | 0.6 | M | Whether the target deployment sets `PERSISTENCE_DEV_TOKEN` |
| D-06 | B: write the spec now; add the device-flag notice | 0.6 | S (spec); L (build) | Whether a claimed course can be moved back |
| D-08 | A: keep the drafts; review gate; `fallbackLng: 'en-US'` | 0.6 | S | Who reviews the strings, and by which release |
| D-09 | A: opt-in with startup warning; address stale gate; correct docs | 0.8 | S | How often operators rotate the code or secret |
| D-12 | A: fail closed with `SESSION_EXPIRED`; do not drop the failure | 0.7 | M | What a refused classroom save shows today |
| D-15 | A: account-dialog semantics, with gate changes | 0.8 | S | How often users see the 429 lockout text |
