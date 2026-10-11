# Product and pedagogy rebuttal, meeting 01

Role: Product and pedagogy lead (PD). Date: 2026-10-11. Responds to `scrum/meetings/devils-advocate.md`. Memo: `scrum/meetings/product.md`.

**[Partly unverified]** Items labelled `[Unverified]`, `[Inference]` or `[Opinion]` are not confirmed.

Label key: `[Verified: path:line]` read this round. `[Measured: how]` command output this round. `[Inference]` reasoning from verified facts, not run. `[Unverified]` not checked. `[Opinion]` product judgement, reasons given.

Method: read-only. Read and Grep on the working tree, and read-only git (`rev-parse`, `status`, `diff`, `show`, `cat-file`, `branch`, `tag`, `merge-base`). No tests run, no packages installed, no web research. `scrum/DECISIONS.md` was not read. Other memos were read only at or near the lines the devil's advocate cites.

Working-tree state: HEAD `491c409`, `origin/main` `ebf665f` `[Measured: git rev-parse]`. Uncommitted changes exist in `lib/server/accounts/`, `components/account/account-dialog.tsx` and `tests/accounts/`. Who made them is `[Unverified]`. D-03 depends on this (section 3).

## 1. Positions after rebuttal

| Item | Memo | After rebuttal | Changed | Basis |
|---|---|---|---|---|
| D-01 | A | A, with an id floor and a threat model | Conditions added | New evidence: client-chosen classroom ids may be one character |
| D-03 | B | **C** | Yes | Stronger argument: B lets every code holder create an account, which undermines D-02 option B |
| D-05 | A, narrowed | Usage for operator-listed accounts only; no account-action API; SQL runbook | Yes | Stronger argument: gate and anonymous modes were left open; a reused storage admin hook is destructive |
| D-06 | B | B, with claim log, undo design, claim-risk rules and a sign-in notice | Spec only | DA objections accepted |
| D-07 | A (skills) | A, plus six template files | Scope | New evidence: procedure feedback and quiz integrity are defined in templates |
| D-08 | A (account block) | A, gate also covers `accessCode.*` | Scope | New evidence: access-code strings already ship on `origin/main` |

Corrections to my memo, found while verifying:
- `[Verified: lib/i18n/types.ts:5; lib/i18n/config.ts:38-39]` The default locale is `zh-CN`, and `fallbackLng` is that default. My memo said `en-US`. Wrong.
- `[Verified: lib/i18n/locales/en-US.json:963-964; components/stage/header-controls.tsx:111]` The only `share` key is an export label. No link-sharing string exists. My "no share string" was too broad.
- `[Verified: lib/server/usage-storage.ts:10]` Usage is JSONL under `data/usage/`, not in the database.
- `[Verified: app/api/stages/route.ts:30-32; lib/import/use-import-classroom.ts:396; lib/server/classroom-generation.ts:522]` Course ids are 18 characters from `POST /api/stages`, 21 on the import path, and 10 for generated classrooms.
- `[Measured: find and wc]` "37 files, 5,668 lines" combines two directories: 26 files and 4,583 lines under `packages/@openmaic/generation/templates/`, plus 11 files and 1,085 lines under `lib/prompts/templates/`.
- `[Measured: git show HEAD:lib/server/accounts/runtime.ts]` HEAD is open unless `closed`. The working tree is closed unless `open` (`lib/server/accounts/runtime.ts:26-32`). My memo describes HEAD only.
- `[Unverified]` My memo's "a teacher sends a learner a link ... the only sharing path the product has" (memo line 38) rested on no verified use. No share control exists.

## 2. D-01 Reads of courses and classrooms by id

| DA objection | Response | Evidence |
|---|---|---|
| Publish needs a real account; B breaks unpublished document links with no publish UI | **Accept** | `[Verified: app/api/stages/[id]/publish/route.ts:26-31]` anonymous owners get 401. `[Measured: grep]` no client calls `/publish` or `/unpublish`; no publish string in `en-US.json`. |
| Server builds read the document first; the file path cannot serve documents | **Accept** | `[Verified: lib/classroom/load-classroom.ts:133, 137]` the first load (`loadFromStorage`) runs before the server file fetch, which runs only when that load returns nothing. `[Verified: lib/utils/stage-storage.ts:460-462]` `loadStageData` reads through `accessDocument`. `[Inference]` in server builds that is the HTTP document store set up at `lib/persistence/bootstrap.ts:120-127`. `[Verified: lib/classroom/load-classroom.ts:256-270; app/api/classroom/route.ts:139-142]` a document id gets a 404 and null from the file path. "`stage.ts:1007` is the only loader caller" is `[Unverified]` this round. |
| B breaks learner links to unpublished document courses; file-backed links unaffected | **Accept** | `[Verified: lib/persistence/document-access.ts:70-73]` today any non-deleted course is readable under any owner id. B would refuse non-owners of unpublished courses. File classrooms cannot take B: `PersistedClassroomData` has no owner (`lib/server/classroom-storage.ts:62-67`). |
| Read capabilities are revocable only by delete | **Accept** | Documents: owner DELETE (`app/api/stages/[id]/route.ts:180-189`). Classrooms: no revocation. `app/api/classroom/route.ts` exports `POST` (line 22) and `GET` (line 123) only. |
| Accept with a publish control and a threat model | **Modify** | Threat model: accepted (below). Publish control: a precondition for B or C, not for A. `[Verified: lib/persistence/document-access.ts:73]` reads test `deletedAt` only. `[Measured: grep resolveStageAccess]` its callers are the stage-meta, status, publish, unpublish and generation-complete routes; none gates content. A control built now would show a state that protects nothing. |
| Guessable classroom ids; create-only lets anyone claim an id first | **Modify** | `[Verified: lib/server/classroom-storage.ts:70-72]` one character is allowed. `[Verified: app/api/classroom/route.ts:71-78]` a client id is used when given. `[Measured: grep]` no app code calls `POST /api/classroom`; only `e2e/tests/classroom-complete-adaptive.spec.ts:86` does. Generated ids: 10 characters, 60 bits (`lib/server/classroom-generation.ts:522`). Document ids: 18 characters, 72 bits (`app/api/stages/route.ts:30-32`). `[Inference: enumeration over HTTP is not practical at these lengths; not measured]`. The live exposure is API-chosen ids. |

Open question, answered: `NEXT_PUBLIC_PERSISTENCE`. `[Verified: .env.example:509-510]` ships it commented out. `[Verified: README.md:469]` says to leave it unset for browser-only. `[Verified: lib/persistence/bootstrap.ts:27]` server persistence needs `'1'`. So B's breakage reaches only operators who opted in. Whether production sets it: `[Unverified]`.

Learner dependence (assigned question):
- `[Unverified]` No telemetry in the repo shows learners opening links to unpublished courses.
- `[Verified: app/page.tsx:1307; app/generation-preview/page.tsx:1052]` the UI navigates by id. `[Verified: lib/server/agent-runtime/curriculum-tools.ts:323]` the agent's tool text says "open it at /classroom/{id}", so links travel in chat.
- `[Inference]` Learners get links by manual copying. Under B, such a link is refused for any course the owner did not publish, and no in-app path publishes one. Anonymous owners cannot publish (`app/api/stages/[id]/publish/route.ts:26-31`), and they are the default owner (`lib/server/agent-runtime/owner.ts:53-66`).
- The mechanism works today for any visitor (`lib/persistence/document-access.ts:70-73`). Whether learners rely on it is the open unknown.

Threat model (added at the DA's condition):
- Asset: course content, "stage + scenes + outline" (`app/api/stage-meta/[stageId]/route.ts:5-6`). `[Verified: lib/server/classroom-storage.ts:62-67]` classroom files hold no learner fields. Teacher material inside generated scenes: `[Unverified]`.
- Credential: the id. Leak paths: address bar, chat text, and the stage-meta route, which answers existence and publish state for any id (`app/api/stage-meta/[stageId]/route.ts:52-68`).
- Revocation: owner delete for documents; none for classrooms.

Position: **A**, with conditions:
1. Document the id as a bearer credential. State that classrooms cannot be revoked. My memo's "deletion is the only owner revocation" held for documents only.
2. Correct the comment at `app/classroom/[id]/page.tsx:201-202`. It says a course "is readable by anyone it was shared with". The read path checks nothing of the kind (`app/api/classroom/route.ts:123-148`).
3. `[Opinion]` Refuse client-chosen classroom ids under 16 characters on `POST /api/classroom`. Generated ids are unchanged. Existing short-id files stay readable; how many exist is `[Unverified]`.
4. Record the threat model above.
5. Schedule C after a publish control and an anonymous-publish rule exist.

Confidence **0.65** (from 0.6; B has no working publish path to migrate to, so A rests on verified facts). Cost **S**.
Would change: evidence that learners open unpublished links (keep A, move C up with a grace period). Evidence that course content holds private material (C, with a grace period).

## 3. D-03 Registration default

| DA objection | Response | Evidence |
|---|---|---|
| Under B, a set `ACCESS_CODE` opens registration, so D-02 option B passes for every code holder | **Accept** | `[Verified: middleware.ts:70-86]` with the code set, only `/api/access-code/` and `/api/health` skip the gate, so a code holder reaches `/api/auth/register`. `[Verified: scrum/meetings/security.md:358]` records the same coupling. |
| C costs schools one variable | **Accept** as the cost | `[Verified: .env.example:528]` documents the variable. `[Verified: lib/server/accounts/service.ts:110; app/api/auth/register/route.ts:24]` the register route is the only creation path, so the first account needs a temporary `open` (`scrum/meetings/security.md:127`). |
| Branch-only, untagged; hosted instance unknown | **Accept** | `[Measured: git branch -a --contains 95463b5]` the meeting branch and its remote only. `[Measured: git tag --contains 95463b5]` no tags. `[Measured: git merge-base --is-ancestor 95463b5 origin/main]` not on `origin/main`. `[Verified: README.md:94]` names a hosted instance, not its code. |
| "No deployed users" | **Accept** as unverified | `[Unverified]` The repo cannot show deployments. |
| C needs a temporary open setting after deploy | **Accept** | Documented in the rule below. |

Why B becomes C (stronger argument; criterion 1 weighs most):
- My memo said opening registration behind the code "exposes no route the code holder cannot already call." That is true of routes. It misses that an account is an identity, and D-02 option B would rely on it.
- Under B, every code holder can create an account. Any account-based control then covers the whole code population from the first deploy.
- Under C, that happens only when an operator opens registration on purpose. The default holds under any D-02 outcome. Once an operator opens it behind a shared code, the coupling returns, so the docs must say so.
- C is a safer default, not a complete remedy. A per-person gate for managed keys is a D-02 design question, and D-02 is not settled in this round.
- B stays acceptable only if D-02 stays option A. Then B's only cost is persistent accounts for code holders.

Position: **C**. Closed unless `ACCOUNT_REGISTRATION=open`, as in the working tree (`lib/server/accounts/runtime.ts:26-32`; `tests/accounts/registration-policy.test.ts:10`). My memo's sketch (`product.md:81-86`) is withdrawn. Docs to change: `README.md:407-408` and `.env.example:528` describe `closed` as the switch; add the shared-code warning. Cost **S**. Confidence **0.6**.
Unknown: whether operators set `open` for the first sign-up, since no other path exists.
Would change: D-02 settled as option A and product rejecting one variable for schools. Then B.

## 4. D-05 Administrator role and usage endpoint

Facts:
- `[Verified: app/api/usage/route.ts:71-76]` GET has no authorization beyond the gate. It returns deployment-wide totals by model, day and kind.
- `[Measured: git cat-file -e origin/main:app/api/usage/route.ts]` the route and `components/settings/usage-dashboard.tsx` exist on `origin/main`. Restricting them changes what existing gate-only and anonymous deployments show.
- `[Verified: components/settings/usage-dashboard.tsx:70]` the only app consumer, mounted for every user at `components/settings/general-settings.tsx:115`. `[Verified: tests/usage/route.test.ts:33]` a test. `[Measured: grep]` no docs or scripts in the repo call `/api/usage`. External consumers: `[Unverified]`.
- `[Verified: lib/server/usage-storage.ts:10, 42-59]` JSONL files; no owner field.
- `[Verified: lib/server/accounts/runtime.ts:22-24; lib/config/feature-flags.ts:40-42]` accounts exist only when `DATABASE_URL` is set. Deployments without it have no identity to test.
- `[Verified: lib/server/accounts/store.ts:88, 135]` `disabled_at` is honoured at sign-in and session lookup. `[Measured: grep]` no production code writes it; tests do (`tests/accounts/store.test.ts:49`).
- `[Verified: packages/@openmaic/storage/src/server/index.ts:659-662]` `DELETE /runtime` deletes all runtime state, gated only by `authorizeAdmin` (line 660). `[Verified: app/api/persistence/[...path]/route.ts:156]` the app sets it to `async () => false`. `[Verified: packages/@openmaic/storage/docs/reference-server.md:27]` the docs require a separately protected admin role.

| DA objection | Response | Evidence |
|---|---|---|
| Restricting usage "when accounts are enabled" leaves B21 open in gate-only and anonymous deployments | **Accept** | The route has no check (`app/api/usage/route.ts:71-76`). Without `ACCESS_CODE` there is no gate (`middleware.ts:64-67`). |
| Access-code-only mode has no admin identity; "hidden from non-admins in every mode" conflicts | **Accept** | My memo was inconsistent. Answer to the DA's open question: where accounts are disabled, the panel is hidden and the endpoint returns 404. |
| Operators with database access can use SQL; C with a runbook is cheaper | **Accept** for account actions. **Reject** for usage | `[Verified: README.md:415-416]` the server profile assumes a database administrator. No non-database operator is evidenced `[Unverified]`. Usage is in files, not SQL (`usage-storage.ts:10`), so the argument does not cover it. |
| Admin changes need a restart; no audit row | **Modify** | Restart accepted as a cost. An audit record becomes a requirement before any account-action API. The runbook keeps the change record with the operator. |
| Fail-closed additions | **Accept** | An empty or unset operator list means no operator. This is already the design. |
| Usage rows have no owner, so a leaked code means unlimited spend (risk 5) | **Reject** as a D-05 objection | Usage visibility does not limit spend. A per-owner ceiling needs an owner field (`usage-storage.ts:42-59`) and belongs with D-02. |

Position after rebuttal:
- Usage endpoint and panel: served only when accounts are enabled and the signed-in account's username is in `OPERATOR_USERNAMES` (new, empty by default). Otherwise 404, and the panel is not mounted. The session payload (`app/api/auth/session/route.ts:22-26`) gains `operator: boolean`.
- Disable and enable: no HTTP route this cycle. Operators run one documented SQL statement against `accounts.disabled_at`.
- Do not wire `authorizeAdmin` to the operator list. That would expose `DELETE /runtime`.
- Visible change: the usage panel disappears for existing gate-only and anonymous users. Needs a release note (criterion 4).

Code sketch `[Unverified: not run]`:
```ts
// app/api/usage/route.ts, first lines of GET
if (!accountsEnabled() || !(await isOperatorSession(req))) {
  return new Response('Not found', { status: 404 });
}
```

Cost **M**. Confidence **0.6**.
Unknown: whether anything outside this repo, or any operator without accounts, reads `/api/usage` today.
Would change: product rules out account-based operator identity. Then usage is off in every mode (cost S).

## 5. D-06 Claiming anonymous data at sign-in

Loss paths, verified (memo items 1 to 3 hold):
- `[Verified: components/account/account-dialog.tsx:123-128]` sign-in reloads the page.
- `[Verified: app/api/stages/route.ts:35-42; packages/@openmaic/storage/src/document/pg.ts:953]` document lists are owner-scoped. So are folders (`app/api/folders/route.ts:52-55`), sessions (`app/api/agent/sessions/route.ts:191-196`), skills (`app/api/agent/skills/route.ts:26-30`) and materials (`app/api/materials/route.ts:120-137`).
- `[Verified: lib/server/agent-runtime/owner.ts:53-66]` one anonymous identity per browser cookie. `[Verified: owner.ts:4]` 30-day max-age. `[Verified: owner.ts:60-65]` not refreshed on use.

| DA objection | Response | Evidence |
|---|---|---|
| Loss is rated highest; B defers it; claims have no undo. Accept with a claim-log spec and per-person confirmation | **Accept** | Per-person confirmation is already in the spec (`product.md:163`). Claim log and undo are added below. |
| Sign-out leaks anonymous courses to the next person on the browser; no option addresses it (risk 4) | **Modify** | `[Verified: app/api/auth/logout/route.ts:22]` sign-out clears only the session cookie. `[Verified: components/account/account-control.tsx:90-91]` the reload restores the anonymous identity. This is pre-existing: the identity is per browser with or without accounts (`owner.ts:63-65`). Rotating now would orphan rows, since nothing can find the old id. Rotation ships with the claim. |
| "Teachers share links" (memo line 38) | **Accept** as unverified | No share control exists (section 1). |

Claim-flow risks to data (the DA's concern), and what the spec must do:
- Wrong person gets the rows on a shared browser. `[Verified: owner.ts:63-65]` one identity per browser. Spec: claim only after an explicit action, showing a count and titles. Default is not now.
- Partial move across several data kinds. `[Verified: lib/server/agent-runtime/user-skills.ts:10]` the skills module says there is "deliberately no owner-merge machinery". `[Verified: packages/@openmaic/storage/src/agent-session/types.ts:498-508]` the owner-merge hook must follow the host lock order. Spec: one transaction, or no claim.
- A create commits under the old identity right after a merge. `[Verified: types.ts:498-508]` the hook comment says so. Spec: take the lock order before the claim commits.
- Overwrite of rows the account already has. Spec: move only the named rows; never merge into an account that already holds rows of that kind.
- Device-keyed runtime state stays on the device (`lib/persistence/bootstrap.ts:83`, `resolveLearnerKey`).

Spec additions:
- Claim log: one record per claim: who, source anonymous owner, row ids, time.
- Undo: copy rows to the account, then tombstone the source rows with `deleted_at`, which the store already treats as absent (`lib/persistence/owner-bound-document-store.ts:198-200`). Undo clears the tombstones and removes the copies within a window. `[Opinion]` 30 days, to match the cookie.
- Notice: one static line after sign-in: courses made before signing in are not in this account. It is a new key, so it enters the D-08 gate.
- Cookie refresh: deferred. It widens the shared-browser window; decide it with the sign-out rule.

Position: **B**, unchanged. Cost **S** now; **M to L** later. Confidence **0.6**.
Unknown: whether accounts reach learners before the next cycle. If yes, implement the narrow claim for documents and folders now.

## 6. D-07 Educational content review

| DA objection | Response | Evidence |
|---|---|---|
| Learner text comes from templates, so the skill review misses it; accept with a sample generation | **Modify** (scope) | The sample test stays (criterion 6). Six template files join Phase 1 (below). |

Facts:
- `[Verified: packages/@openmaic/generation/src/prompts/loader.ts:69; lib/prompts/loader.ts:78]` templates are Markdown prompt files loaded by these loaders. `[Inference]` they feed model calls, and learner text is model output shaped by templates and by skill bodies (`lib/server/agent-runtime/skills.ts:1-14`). `[Unverified]` whether any learner-visible static text sits in the templates; not searched exhaustively.
- `[Verified: skills/agent-runtime/vocational/SKILL.md:27, 42-44]` procedure scenes carry a `widgetOutline`. `[Verified: packages/@openmaic/generation/src/scene-generator.ts:1239]` the `procedural-skill` case. `[Inference]` the feedback a procedure learner sees comes from a template the skill review does not cover.
- `[Verified: packages/@openmaic/generation/templates/procedural-skill-content/user.md:51]` requires "a consequence feedback path for an unsafe or incorrect choice", such as warning, alarm, or cannot proceed.
- `[Verified: packages/@openmaic/generation/templates/quiz-actions/system.md:36-44]` "NEVER reveal or hint at the correct answer", and related rules. `[Verified: packages/@openmaic/generation/templates/quiz-content/system.md:11]` "Accurate correct answers".

Scope change. Phase 1 adds these six files (665 lines, `[Measured: wc -l]`), all under `packages/@openmaic/generation/templates/`:
- `procedural-skill-content/`: system.md (354), user.md (66)
- `quiz-content/`: system.md (142), user.md (10)
- `quiz-actions/`: system.md (82), user.md (11)

Remains deferred under B: the other 31 files, 5,003 lines.

Scope effect: yes, for these six files, for the reasons above. It does not move the item to B. The sample test decides whether B is needed.

Position: **A**, plus six template files. Cost **M**. Confidence **0.65** (from 0.7: the scope is larger and no template has been reviewed yet).
Unknown: how much learner-visible error comes from model output rather than instructions. Only the sample test answers that.
Would change: a sample shows errors that trace to neither skill nor template text. Then B first.

## 7. D-08 Translation drafts

| DA objection | Response | Evidence |
|---|---|---|
| Drafted access strings can lead a user to type an account password (`ux.md:184`); gate needs review | **Modify**: gate accepted; password claim rejected for current strings | `[Measured: python regex over the 11 non-English files, accessCode.* values, password terms in each language]` zero hits. The gate input is `type="password"` (`components/access-code-modal.tsx:135`), so mistranslation is the real risk `[Inference]`. |
| The UX config line changes nothing shipped | **Accept** | `[Verified: scripts/check-i18n-keys.mjs:23-29]` parity compares key sets. The fallback applies only to missing keys, and parity forbids them. |
| Review gate on `accessCode.*` | **Accept**, extended below | Gate covers the 33 strings. |

Facts:
- `[Measured: git show origin/main:lib/i18n/locales/<locale>.json]` the `accessCode` block is on `origin/main` in all 11 non-English files (3 keys each, 33 strings in total). For zh-CN, all three values on `origin/main` match the working copy. `[Verified: middleware.ts:88-89; components/access-code-modal.tsx:112, 135-136]` the modal appears for visitors without the access cookie in a gated deployment. `[Inference]` the strings reach any visitor who uses one of these locales. This is the live state, not the next release.
- `[Verified: lib/i18n/types.ts:5; lib/i18n/config.ts:38]` zh-CN is the default locale and the initial i18n language. `[Inference]` its strings are what a visitor sees first, unless something else sets the language.
- Provenance: the commit body (857017c) says "The non-English strings are machine drafts" in its account-block paragraph. It does not say who wrote `accessCode.*`. `[Unverified]`
- Reviewer item: zh-TW renders the title as "請輸入課堂碼" (enter class code), where other locales say access code. `[Unverified]` whether that term matches what users are given.

Position: **A**. The gate covers the 33 `accessCode.*` strings and the account block. If a locale's review does not finish before the release, copy the en-US values into that locale's `accessCode.*` keys. Key parity holds with no exception. Do not rely on `fallbackLng` (`lib/i18n/config.ts:39`), which has no effect while parity holds.
Visible change if the fallback is used: non-English visitors to gated deployments see English on the access prompt.
Changed from memo: gate scope; fallback mechanism; fallback target corrected.
Cost **S**. Confidence **0.65** (from 0.7).
Unknown: which non-English locales real gated deployments serve. The repo has no telemetry.

## 8. Final table

| Item | Position after rebuttal | Confidence | Cost | Most important unknown |
|---|---|---|---|---|
| D-01 | A, with id floor and threat model; C scheduled after a publish control | 0.65 | S | Whether learners open links to courses the owner did not publish |
| D-03 | C: closed unless `ACCOUNT_REGISTRATION=open` (changed from B) | 0.6 | S | Whether operators set `open` for the first sign-up |
| D-05 | Usage for operator-listed accounts only; off elsewhere; no account-action API; SQL runbook (changed) | 0.6 | M | Whether anything outside this repo reads `/api/usage` |
| D-06 | B, with claim log, undo design, claim-risk rules, sign-in notice; sign-out rotation ships with the claim | 0.6 | S now, M to L later | Whether accounts reach learners before the next cycle |
| D-07 | A on skill files plus six template files, 665 lines (scope changed) | 0.65 | M | How much learner-visible error comes from model output rather than instructions |
| D-08 | A, gate on `accessCode.*` and account block; en-US values as fallback | 0.65 | S | Which non-English locales real gated deployments serve |
