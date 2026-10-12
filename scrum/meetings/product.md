# Product and pedagogy memo, meeting 01

Role: Product and pedagogy lead (PD). Date: 2026-10-11. Branch: `claude/hopeful-sagan-267tw5`.
Items: D-01, D-03, D-05, D-06, D-07 (main owner), D-08.
Method: read-only. No tests run. No web research. This is the only file written.

**[Partly unverified]** This memo contains `[Unverified]` and `[Inference]` items. Each one is labelled where it appears.

Label key:
- `[Verified: path:line]` read in code or docs.
- `[Measured: how]` command output from this session.
- `[Inference]` reasoning from verified facts. Not run.
- `[Unverified]` not checked.
- `[Opinion]` pedagogical or product judgement, with the reasoning given.

---

## Positions at a glance

| Item | Position |
|---|---|
| D-01 | A: keep capability reads this cycle. Document them, correct one comment, schedule C. |
| D-03 | B: closed by default. Open when `ACCESS_CODE` is set or `ACCOUNT_REGISTRATION=open`. |
| D-05 | A, narrowed: operator-listed usernames, disable and enable, usage admin-only. No account listing. |
| D-06 | B: write the specification now, implement next cycle. |
| D-07 | A: Phase 1 on the skill documents. Safety content first. Method below. |
| D-08 | A, with a release gate: native review before a locale's account strings ship. |

---

## D-01 Reads of courses and classrooms by id

**Recommended option: A.** Keep capability reads for this cycle, with three conditions:
1. Document that a course or classroom link is a bearer credential. Deletion is the only owner revocation for a course today.
2. Correct the comment at `app/classroom/[id]/page.tsx:201-202`. It says a course "is readable by anyone it was shared with". The read path does not check sharing.
3. Record C (expiring share tokens) as the target design, with a decision date.

**Product view on the sharing need [Opinion].** A teacher sends a learner a link, and the learner opens it, often without an account. That is the only sharing path the product has (see evidence). Removing it before a replacement exists would break the use case.

**Evidence**
- `[Verified: packages/@openmaic/storage/src/document/pg.ts:522-531]` `loadStage` selects by `id` only. There is no owner predicate.
- `[Verified: lib/persistence/owner-bound-document-store.ts:194-200]` In read mode the owner is not compared. Only `deleted_at` is checked. Any owner-holder can read any non-deleted course with a `stage_meta` row, published or not.
- `[Verified: lib/persistence/document-access.ts:70-73]` The read case has no owner or published check. `[Verified: app/api/persistence/[...path]/route.ts:340]` The persistence route calls it.
- `[Verified: lib/server/agent-runtime/owner.ts (resolveRequestOwnerId)]` An anonymous visitor also gets an owner. So every visitor can read by id.
- `[Verified: app/api/classroom/route.ts:123-148]` Classroom GET reads by id with no owner check. `[Verified: lib/server/classroom-storage.ts:90-101]` It opens a file by id.
- `[Verified: grep of lib/server/classroom-storage.ts]` The classroom file format has no owner field.
- `[Verified: grep of app/api/classroom*]` No classroom route exports `DELETE`. The classroom route exports `GET` and `POST` only. Options B and C need an ownership model for classroom files first.
- `[Verified: middleware.ts:64-67, 81-86]` Without `ACCESS_CODE`, every API route is open. With it, API routes need one shared access cookie. In an ungated deployment, the id is the only control.
- `[Verified: scrum/BACKLOG.md:94]` B1 calls capability reads "Intended for shared links".
- `[Verified: app/api/classroom/route.ts:108; lib/server/classroom-generation.ts:732]` The POST response and the generation job result carry a `url` field.
- `[Verified: grep of components, app, lib]` No client reads that `url`. The link reaches API callers, not the UI.
- `[Verified: lib/i18n/locales/en-US.json; app/page.tsx:1882]` The English locale has no share or copy-link string. The home page's clipboard call copies a classroom name.
- `[Verified: grep of components, app, lib]` No client calls publish or unpublish. The publish route (`app/api/stages/[id]/publish/route.ts`) sets `is_public`. No read path checks it.
- `[Verified: app/api/stages/[id]/route.ts:180-189]` Owner-only DELETE is the only revocation for a document.
- `[Verified: lib/utils/stage-storage.ts:1273]` The agenda cites this line for the course id. It is a folder id.
- `[Verified: lib/server/classroom-generation.ts:522]` Server-generated course ids use `nanoid(10)`.
- `[Measured: node import of nanoid in this repo]` Default length 21. `nanoid(10)` length 10.
- So the agenda's "21-character course id" holds only on some creation paths. `[Unverified: which path each course uses in practice]`.

**Strongest argument against A.** The mission's first goal is that each account's data is isolated (`scrum/BACKLOG.md:9`). A keeps unpublished courses readable by anyone who holds the id. The owner's only revocation is deletion. Criterion 1 weighs privacy most, so A runs against it. If course content can hold private teacher material or learner data, A is not acceptable. `[Unverified: whether course content can carry personal data. Materials feed generation through materialFacts, generation-tools.ts:71, 316.]`

**Cost:** A is S (documentation and one comment). C is L: a token model, a share control, an owner field for classroom files with a migration, and a grace period for existing links.

**Reversal path:** A is reversible with a single revert. Moving to C later breaks any link already shared, unless a grace period is set. Recipients cannot undo a broken link.

**Confidence:** 0.6

**What would change my mind**
- Evidence that course or classroom content holds personal or private material. Then C, with a grace period.
- Evidence that real learners use these links. Then keep A and schedule C with a migration plan.
- A decision that publish is the sharing model. Then B, but only after a publish control exists. B alone would break every link to an unpublished course.

---

## D-03 Registration default

**Recommended option: B.** Closed by default. Open when `ACCESS_CODE` is set, or when `ACCOUNT_REGISTRATION=open`.

Sketch, not run `[Unverified]`:
```ts
export function registrationOpen(env = process.env): boolean {
  const flag = env.ACCOUNT_REGISTRATION?.trim().toLowerCase();
  if (flag === 'open') return true;
  if (flag === 'closed') return false;
  return Boolean(env.ACCESS_CODE?.trim()); // gated: the code already guards /api/*
}
```

**Evidence**
- `[Verified: lib/server/accounts/runtime.ts:27-28]` Open unless `ACCOUNT_REGISTRATION=closed`.
- `[Verified: lib/server/accounts/service.ts:112]` The flag refuses registration when closed.
- `[Verified: middleware.ts:70-86]` With `ACCESS_CODE` set, `/api/auth/register` needs the shared access cookie. `[Inference]` Opening registration behind the code exposes no route the code holder cannot already call. Its only addition is a persistent account.
- `[Verified: scrum/BACKLOG.md:107]` B14 recommends closed for public deployments.
- `[Verified: git cat-file on origin/main, head ebf665f]` `lib/server/accounts/runtime.ts` is not on `origin/main`. Accounts exist only on this branch.
- `[Unverified: whether any deployment runs this branch]` The repository cannot show production state. The agenda's "no deployed users" is not checked.
- `[Verified: app/api/auth/session/route.ts:19-24]` The flag reaches the client. `[Verified: en-US.json account.errors.registrationDisabled]` The closed message already exists in the UI.

**Strongest argument against B.** Two conditions are harder to explain than one. A public deployment that follows the README gets "New accounts are not open right now" on first use. Under the rule as sketched, removing `ACCESS_CODE` later closes registration without a warning. C (closed always) is simpler. Its cost for school deployments is one environment variable. `[Opinion: C is the simpler rule. B fits gated deployments better, because the code already guards everything.]`

**Cost:** S (a few lines, tests, README and `.env.example` text).

**Reversal path:** An environment variable. No data change. Immediate.

**Confidence:** 0.6

**What would change my mind**
- Evidence that most deployments are public and expect self-registration. Then open by default for public deployments (A).
- Evidence that access codes circulate beyond the intended group. Then C.

---

## D-05 Administrator role and usage endpoint

**Recommended option: A, narrowed.**
- Operator-listed usernames in an environment variable.
- Admin actions limited to disabling and enabling an account, and reading usage.
- Drop "list accounts" from this cycle unless a written use case appears.
- Usage endpoint admin-only when accounts are enabled, as in A.
- No admin UI this cycle.
- Hide the usage panel from non-admins in every mode. `[Opinion: deployment-wide cost and model volumes have no learner purpose. Showing them to learners exposes operator data.]`

**Evidence**
- `[Verified: packages/@openmaic/storage/src/server/index.ts:660, 669]` Admin routes call `authorizeAdmin`. `[Verified: app/api/persistence/[...path]/route.ts:156]` The app passes `async () => false`.
- `[Verified: lib/server/accounts/store.ts:88, 135]` Sign-in reads `disabled`. Session lookup excludes disabled accounts.
- `[Verified: grep]` No code path writes `disabled_at`. Today the only way to disable an account is SQL.
- `[Verified: app/api/usage/route.ts:71]` GET aggregates the deployment-wide usage log.
- `[Verified: lib/server/usage-storage.ts:42-59]` `UsageRecord` has no owner field. Per-user usage needs a schema change first.
- `[Verified: components/settings/usage-dashboard.tsx:70]` The only client consumer. `[Verified: components/settings/general-settings.tsx:115]` It is mounted at the top of general settings. Neither the panel nor the endpoint checks a role. `[Inference]` Every user who opens general settings sees deployment totals now.
- `[Verified: README.md:416]` Operator documentation addresses a database administrator. `[Inference]` Operators already control the database.
- `[Unverified: written admin requirements]` The repository has none. Only `scrum/BACKLOG.md:10` ("administrator features") and B16 ("limited administrator privileges") exist. `[Inference]` Two needs are supported by the code: disabling an account, and seeing usage. Both serve operators, not learners.

**Strongest argument against A.** The answer depends on who the administrators are. Operators with database access can already do what an admin API would do, using SQL. In that case option C with a runbook is cheaper. Restricting usage "when accounts are enabled" leaves B21 open in gate-only and anonymous deployments. Environment-listed admins need a restart to change. A as written has no audit record. The B16 design includes one.

**Cost:** M (admin routes, authorization checks, tests, panel visibility). No schema change under A.

**Reversal path:** Remove the routes and the variable. There is no schema to undo.

**Confidence:** 0.55

**What would change my mind**
- A written requirement from staff who have no database access. Then A stays.
- Confirmation that all operators have database access. Then C: a runbook for disabling accounts, and usage hidden from non-operators, at S cost.
- A need for accountable multi-admin action. Then B (a role column) with an audit log.

---

## D-06 Claiming anonymous data at sign-in

**Recommended option: B.** Write the specification now and implement next cycle. The two related changes below are not agenda options.

**What a learner loses today.** This applies to server-persistence builds with accounts enabled. Browser-only builds do not run the session check (`[Verified: components/account/account-control.tsx:40]`), and the commit says the control renders nothing there (`[Verified: commit 857017c message]`). So the case does not arise.
1. After sign-in the page reloads, and the library lists the account's data. Courses created while signed out are no longer listed. `[Verified: components/account/account-dialog.tsx:124-128; lib/utils/stage-storage.ts:803-807, 769-771; app/api/stages/route.ts:35-42; packages/@openmaic/storage/src/document/pg.ts:953]` `[Inference: from the verified path, not run in a browser]`
2. Folders, workbench sessions, skills and materials created while signed out stop listing. `[Verified: app/api/folders/route.ts:52-55; app/api/agent/sessions/route.ts:191-196; app/api/agent/skills/route.ts:26-30; app/api/materials/route.ts:120-137]` Each resolves its owner with `withRequestOwnerId`.
3. Runtime state keyed by the device learner key stops being used. Playback position stays in the browser. `[Verified: lib/persistence/bootstrap.ts (resolveLearnerKey); app/api/persistence/[...path]/route.ts:125-145]`
4. Nothing tells the learner. `[Verified: en-US.json, account block from line 2028, has no line about existing data]`
5. Sign-out reloads the page and clears only the session cookie. The anonymous owner returns, and the courses reappear while the cookie is valid. `[Verified: account-control.tsx:90-91; app/api/auth/logout/route.ts:22; owner.ts:60-65]` `[Inference]`
6. The anonymous cookie is set once for 30 days and not refreshed on use. `[Verified: lib/server/agent-runtime/owner.ts:4, 60-65; lib/workbench/workspace-actions.ts (currentOwnerId) sets it only when missing]` `[Inference: 30 days after first issue, the anonymous courses cannot be reached from that browser, with or without sign-in.]`
7. Wording: the agenda says the courses "stay with the browser". In server builds they are rows keyed by an anonymous cookie. `[Verified: owner.ts; pg.ts]`

**Design seam.** `[Verified: packages/@openmaic/storage/src/agent-session/types.ts:498-508]` A `resolveFinalOwner` hook exists for owner merge, and it must follow the host operation's lock order. `[Verified: lib/server/agent-runtime/user-skills.ts header]` The skills module says there is "deliberately no owner-merge machinery".

**Requirements for the specification [Opinion, with reasons]**
- Claim only on an explicit user action after sign-in. Show what was found: a count and titles. Default: not now. `[Reason: the anonymous owner belongs to the browser profile, owner.ts. Another person on that browser would otherwise claim the first person's courses.]`
- After a claim, tombstone or empty the moved rows under the anonymous owner. `[Reason: otherwise the next person who signs out of that browser sees them. Inference from owner.ts and the sign-out reload.]`
- Move only the rows the claim names. Never merge into an account that already has rows of that kind. `[Reason: avoids silent overwrites.]`
- Apply the agent-session lock order before a claim commits. `[Verified: types.ts:503-506]` states that a create can commit under an identity right after a merge without it.
- Device-keyed runtime state stays on the device. `[Reason: it is device state by design, bootstrap.ts.]`
- Related, not in the options: refresh the anonymous cookie on use (S), or state the 30-day limit in the documentation (S). `[Opinion: refresh is the better behaviour for active learners.]`

**Cost:** B is S now, with M to L later. A is L: six kinds of data in one transaction, conflict rules, concurrency.

**Reversal path:** B needs no code. Under A, moved rows are hard to reverse once committed.

**Strongest argument against B.** The loss is immediate and visible at the first sign-in. Specifications tend to slip. A narrower claim for documents and folders, the most visible loss, is S to M. C (document and do nothing) leaves a silent loss. `[Opinion: C is not acceptable from the learner's side.]`

**Confidence:** 0.6

**What would change my mind**
- A date for accounts reaching users before next cycle. Then implement the narrow claim for documents and folders now.
- Evidence that anonymous use is rare in real deployments. Then lower priority, with C and a notice.

---

## D-07 Educational content review (main owner)

**Recommended option: A.** Phase 1 covers the six built-in skill documents and their constraint files, plus the five k12 references. Read-only except for internal defects. Factual claims are flagged, not changed. Order:
1. Safety first: vocational thresholds and procedure content, and the k12 curriculum tables (flagged for subject review).
2. Internal contradictions: search budgets, the deep-research outline statement, fact-check report labels, feynman's undefined thresholds and the storage dependency.
3. Coverage: the k12 guidance for IT, arts, PE and labor.

Defer B (generation templates: 37 files, 5,668 lines, `[Measured: find and wc]`) until the method has run on A.

**Why skill text matters to learners.** `[Verified: lib/server/agent-runtime/skills.ts header]` A skill body feeds the outline generator, and its constraints are checked against the outline. `[Verified: skills.ts:186]` `[Inference: skill text shapes generated course content. Not tested by running a generation.]`

**Reference checks [Measured: grep and comparison]**
- 23 of 25 underscore-style identifiers in the six SKILL.md files match a quoted name in the agent-runtime code. The 2 misses, `fix_all` and `fix_confirmed`, are option ids in fact-check, not tool names.
- Presence check only, not a signature check: `materialFacts` is a `generate_scene` parameter (`generation-tools.ts:71`). `nextOffset`, the `detail` values (`dsl-tools.ts:404`), `folderId` and `options` appear in the agent-runtime code.
- The procedure enum `repair | assembly | inspection | operation | custom` matches `lib/types/generation.ts:128`. The scene types match `packages/@openmaic/dsl/src/stage.ts:22`.
- Referenced files exist: the five k12 references and the skills `stage-design`, `pro-editing`, `learning-to-learn`, `style-clone`, `pptx-import`.
- The six SKILL.md files total 917 lines. The five references total 229 lines.

**Per-skill review.** Body language: Chinese for feynman, English for the other five. All six titles are Chinese.

**1. feynman-learning (152 lines, Chinese body)**
- Objective: clear and observable. The deliverable is a learning record and a next goal (lines 9, 108-120). `[Opinion: strong.]`
- Contradiction: line 67 lets the learner keep a first version offline when the component cannot save input. Line 88 needs saved first and second versions for comparison. `[Inference: the comparison can fail under the fallback.]`
- Ambiguity: "多次追问" (several probes), "必要事实或支架" (necessary facts or scaffold), and "理解证据" (evidence of understanding) have no thresholds or examples (lines 31, 81).
- Examples: only title examples (lines 39-45). No sample learner explanation, probing question, or stop condition.
- Feedback: question first, and the learner judges their own gap (lines 31, 73). No rule for when to stop probing.
- Verification flags: none. The skill makes no claims about the technique's history or efficacy. `[Opinion: a learning scientist should confirm the steps are presented as practice, not as evidence.]`
- Language: the only Chinese body. Reviewers need Chinese.

**2. fact-check (153 lines, English body)**
- Objective: clear (lines 9-11).
- Contradictions: report labels are fixed in Chinese (lines 105-107, 112). Option labels follow "the user's language" (lines 137-138). The search budget is "about 6–8 searches" (lines 60-62). Deep-research allows "at most 8" for the whole session (`deep-research/SKILL.md:46-47`). The description says to combine them (line 4). Who governs the shared budget is not stated.
- Examples: one format example (line 112). No severity criteria for groups A, B and C.
- Feedback: the report and approval steps are well specified (lines 98-153). No criteria separate "明确事实错误" from "表述不严谨" beyond the labels.
- Verification flags: none. The sections on versioned knowledge (lines 75-76) are procedure.

**3. deep-research (157 lines, English body)**
- Objective: the production process is clear (research, outline, generate). No learner outcome is stated. `[Opinion: a learner-facing objective would help reviewers.]`
- Contradiction: line 107 says "There is no outline generator". `outline-constraints.json` exists, and `skills.ts:186` loads it for any skill that has one. `[Unverified: whether this path reaches the outline generator.]`
- Ambiguity: "the better-verified recent source wins" (lines 147-150) is undefined.
- Examples: scene-naming good and bad examples (lines 130-134). The ledger format is described, but no ledger entry is shown.
- Feedback: quiz distractors come from ledgered facts (lines 125-126). No guidance for wrong answers.
- Verification flags: none asserted. Method only.

**4. k12-core-literacy-planning (185 lines, English body, Chinese references)**
- Objective: the strongest of the six. The learning contract uses observable verbs (lines 51-61).
- Ambiguity: "Choose only one or two primary dimensions" (line 53). The compulsory mathematics row is "三会" (`core-literacy.md:13`), which is three components. The granularity does not match.
- Undefined acronym: "UDL" (line 43).
- Coverage gap: IT, arts, PE and labor get four bullets (`core-literacy.md:54-69`). No stage arcs, misconceptions or non-negotiables, which the other subjects have. The completion check requires the central misconception to be handled (line 178).
- Examples: good and bad titles (lines 105-107). Authentic contexts for mathematics (`mathematics.md:3-6`).
- Feedback: "feedback teaches, not merely marks wrong" (lines 99-101). No rubric template.
- Subject-matter verification, all `[Unverified]`. `core-literacy.md` cites no source or edition. The description says "2022 课标" (line 4).
  - Dimension names by subject and stage: `core-literacy.md:10-28`.
  - Mathematics "三会" and stage manifestations: `core-literacy.md:13, 30-36`. Naming differs by stage: 推理意识 (line 33), 推理能力 (line 35), 逻辑推理 (line 14). Whether that is intended is a subject question.
  - Misconception claims: `science.md:27-34`, `mathematics.md:32-34`, `languages.md:30-32`, `humanities.md:20-22`.
  - Values tension: `humanities.md:33-36` says values grow through deliberation, not a "one-way 'correct answer' speech". The target dimensions include 政治認同 (`core-literacy.md:15-16`). `[Opinion: a policy reviewer and a subject reviewer must decide how these fit together. The skill does not reconcile them.]`
**5. curriculum-planner (203 lines, English body)**
- Objective: a process objective, clear. Each stage's learner outcome is required at Gate 2 (lines 109-110).
- Contradictions: none found in the text.
- Ambiguity: "the outline generator's plan is never exactly your proposal" (line 167) is an absolute claim about system behaviour. `[Unverified.]`
- Examples: round and title examples (lines 53-60, 144-145). Good.
- Feedback: not applicable to a process skill. `[Opinion.]`
- Verification flags: none.

**6. vocational (67 lines, English body, with constraint file)**
- Objective: clear performance target: a work task with GO and STOP decisions. The briefing must state "the training objective" (lines 18-21), with no guidance on writing one.
- Contradiction and gap: the skill requires six `widgetOutline` fields (lines 44-53). `vocational/outline-constraints.json` checks three: `task`, `steps`, `successCriteria`. `[Verified: outline-constraints.json, requiredWidgetOutlineFields]` `errorConsequences` and `tools` are not checked by machine. The constraint file also caps slides at three (`max: 3`). The skill does not state that cap. `[Verified: outline-constraints.json typeMix]`
- Sourcing gap, highest risk: the file has no rule on sources, standards or verification. `[Verified: grep for source, verif, cite, standard number, invent: only "verification" as a step name, line 24]` The k12 skill says "Never invent a standard number" (lines 48-49). Deep-research says "Never invent sources" (line 137). Vocational asks for "thresholds, readings" in `successCriteria` (line 51), with no sourcing rule.
- Scope gap: the description covers "a clinical or industrial procedure" (line 4). It has no scope limit and no review requirement.
- Examples: scene titles name electrical isolation and insulation testing (lines 39-40). No worked widget outline.
- Feedback: `errorConsequences` and the GO and STOP quiz are strong feedback design. `[Opinion.]`
- Verification flags, safety-critical: every number, isolation step, PPE item and GO or STOP threshold needs a source and a practitioner's sign-off before the course is used for real work. `[Opinion, with reason: the skill asks for readings and thresholds and supplies no source.]` `[Inference: the generator will produce numbers the document does not contain.]`

**Inconsistencies between skills and constraint files**
- deep-research: the skill says there is no outline generator, while its constraint file exists (see above).
- vocational: the skill requires six fields and the checker enforces three (see above).

### Method for a full review

**Checklist.** Apply to each file. Mark each item pass, fail or flagged, with the line.
- C1 Objective: the learner outcome or deliverable is observable.
- C2 Audience and level: stage, age and language are stated.
- C3 Internal consistency: no contradictions. Thresholds, budgets and labels are defined.
- C4 Cross-file consistency: references resolve. Shared budgets agree. Constraint files cover the required fields.
- C5 Tool and enum match: names, parameters and enum values exist in code.
- C6 Examples: at least one good and one bad example for each output the skill produces.
- C7 Feedback: what the learner sees for right and wrong answers, and what counts as evidence to move on.
- C8 Sourcing: every factual, numeric or standard-based claim has a sourcing rule or a verification flag.
- C9 Safety scope: procedure content states its scope and requires expert review.
- C10 Language and accessibility: one language per body, or a stated rule. Acronyms expanded.
- C11 Opinions: pedagogical statements are labelled as opinion, with reasons.

**Automated part (QA, read-only).** This is the check run in this session. It found 23 of 25 identifiers in code.
```bash
for t in $(grep -ohE '\b[a-z]+(_[a-z]+)+\b' skills/agent-runtime/{feynman-learning,fact-check,deep-research,k12-core-literacy-planning,curriculum-planner,vocational}/SKILL.md | sort -u); do
  grep -rqE "['\"\`]$t['\"\`]" lib/server/agent-runtime lib/agent-runtime 2>/dev/null || echo "not in code: $t"
done
```
The two misses are expected. They are option ids (`fix_all`, `fix_confirmed`), not tool names.

**Reviewers** (names to be assigned; none identified yet `[Unverified]`)
- QA lead: C3, C4 and C5, with the automated check.
- PD (this role): C1, C2, C6, C7, C10 and C11.
- Subject reviewers for k12 mathematics, science, Chinese and languages, and humanities: C8. Each names the edition of the official standard they check against.
- Vocational reviewers: a licensed practitioner per trade in scope, at least electrical. `[Opinion: clinical content needs a clinician, or the clinical scope should be removed until one reviews it.]`
- Safety lead: C9 sign-off on vocational content.
- Bilingual reviewer: C10, and the language rule across skills.
- Devil's advocate: challenges each verdict, as the meeting rules require.

**Claim log.** One row per factual or numeric claim: ID, file:line, claim, label, reviewer, verdict, source with edition or date, date. A verdict is one of: confirmed (with source), corrected (with proposed wording), or unverifiable (kept out of generation until resolved).

**Acceptance criteria for Phase 1**
1. Every file in scope has a review record: git SHA, reviewer, date, checklist result. The 41 tracked files under `skills/agent-runtime/` are in git `[Measured: git ls-files]`, so each review can be pinned.
2. No open internal contradiction. Each one in this memo is either fixed by an internal-only edit or accepted in writing by PD and QA with reasons.
3. Automated checks pass (C4, C5, file resolution).
4. Every factual claim in scope is in the claim log with a verdict. Unverifiable claims stay out of generation until resolved.
5. Vocational thresholds and safety steps have a sourced verdict and a practitioner's sign-off before any real-world procedure is generated from the skill.
6. Sample test after the Phase 1 edits: generate one course per skill from fixed briefs, then check each against C1 to C11. Phase 1 closes when no output carries a safety-critical error or an internal contradiction. `[Opinion: the threshold is PD's choice; QA may change it.]` The sample costs model calls.
7. Any later edit to a reviewed file reopens its review record.

**Cost:** M. Review time is dominated by subject reviewers. The edits are small.

**Reversal path:** Documentation commits in git. Revert the commit.

**Strongest argument against A.** Skills are instructions. The learner sees the generated pages, and those come from templates, which is B's scope. A review of skills alone may miss defects learners see. `[Counter: a skill sets what the generator is asked to produce. One bad skill affects every course built from it. The template review is a second, larger pass.]`

**Confidence:** 0.7

**What would change my mind.** A sample of generated courses shows errors that do not trace back to skill text. Then B first.

---

## D-08 Translation drafts

**Recommended option: A,** with one release gate: the account control is not shown in a non-English locale in a public release until a native reviewer signs off that locale's `account` block.

**Evidence**
- `[Verified: commit 857017c message]` "The non-English strings are machine drafts and need native review." This is the author's statement. The provenance is not checked.
- `[Measured: node comparison of the 12 locale files]` Each non-English `account` block has the same 30 keys as en-US. None is null. None is identical to English. Placeholders (`{{...}}`) and digit sequences match en-US in all 12 files.
- `[Verified: lib/i18n/config.ts:39]` `fallbackLng` is en-US, so missing keys fall back at runtime.
- `[Verified: lib/i18n/TRANSLATION_GUIDE.md:10]` Keys must remain identical. The guide has no native-review step.
- `[Verified: components/account/account-control.tsx:40; commit 857017c message]` The control is tied to browser persistence. Learner exposure is limited to server-persistence builds.
- `[Verified: en-US.json, account.errors and hints]` The block includes rate-limit and registration messages, and numeric ranges (3–32, 8–256).
- `[Verified: en-US.json:2077, 2078, 2081]` Three null values in the English workbench block (incidental).

**Product view [Opinion].** Most of the 30 keys are labels, hints and errors. The main risk is a wrong range or a misleading message in a failure state, such as rate limiting or closed registration. The mechanical checks pass. Meaning is `[Unverified]` until a native reviewer reads it.

**Strongest argument against A.** Drafts reach learners before review if the gate is not enforced. "Flag" is passive. B (English fallback) removes that exposure, but it needs an exception to the key-parity rule, which weakens the one locale check, and it gives mixed-language screens. C hides accounts from most users, which blocks the cross-device continuity the accounts feature exists for.

**Cost:** S (a review task and a release checklist line). B is S plus the parity exception. C is S with high product cost.

**Reversal path:** Each locale is independent. Replacing strings is an ordinary edit. The gate is a checklist line.

**Confidence:** 0.7

**What would change my mind**
- A native review that finds material errors in hints or errors. Then B for those keys, or a fix.
- Most users in non-English locales, with no reviewer for their language. Then B.

---

## Incidental findings (outside my items)

- `[Verified: lib/server/agent-runtime/generation-tools.ts:316, 334]` For PBL pages, `materialFacts` is written to `pblConfig.targetSkills` as well as `keyPoints`. Facts land in a field named for skills. `[Inference: probably a field mismatch. For Platform or QA to confirm.]`
- `[Verified: lib/i18n/locales/en-US.json:2077, 2078, 2081]` Three null values in the English workbench block. `[Unverified: how the runtime renders null.]` For UX to check.
- `[Verified: app/classroom/[id]/page.tsx:201-202]` The sharing comment does not match the read path (D-01).
- `[Verified: components/settings/general-settings.tsx:115]` The usage panel is mounted with no role check. `[Inference: every user who opens general settings sees it.]` (D-05)
- `[Verified: lib/server/agent-runtime/owner.ts:60-65]` The anonymous cookie is not refreshed on use (D-06).

## Caveats

- No tests were run.
- No web research was done. The curriculum facts are not verified.
- The repository cannot show production state: deployments, user counts, or which branch runs where.

---

## Output table

| Item | Recommended option | Confidence | Cost | Single most important unknown |
|---|---|---|---|---|
| D-01 | A: keep capability reads; document; fix one comment; schedule C | 0.6 | S | Whether course or classroom content holds personal or private material, and whether real learners use shared links. |
| D-03 | B: closed unless `ACCESS_CODE` is set or `ACCOUNT_REGISTRATION=open` | 0.6 | S | Whether any deployment is public and expects self-registration. |
| D-05 | A, narrowed: env-listed operators; disable and enable; usage admin-only; no account listing | 0.55 | M | Who the administrators are: operators with database access, or staff without it. |
| D-06 | B: specification now; implement next cycle; cookie refresh as a related fix | 0.6 | S now, M to L later | Whether accounts reach users before next cycle, which would require the narrow claim now. |
| D-07 | A: Phase 1 on skill documents; safety first; method above | 0.7 | M | Whether skill text or generated pages carry most of the errors learners see. The sample test decides this. |
| D-08 | A, with a native-review release gate | 0.7 | S | Quality of the 11 drafts in error and hint text. Unknown until native review. |
