# Content review, D-07 phase 1 (product and pedagogy)

**[Unverified in parts]** The subject-matter claims (F-01 to F-23) are not checked against a named edition. The sample generation test (memo criterion 6) was not run because it needs model access. Phase 1 is not closed.

| Field | Value |
|---|---|
| Pinned commit | `491c409e278e68b8dda001554398286c26c37ec2` (output of `git rev-parse HEAD`) |
| Date | 2026-10-11 |
| Reviewer | Product and pedagogy reviewer, automated pass. Named human reviewers: none assigned [Unverified: memo line 284]. |
| Method | Checklist C1 to C11 (memo lines 264-274), applied to 13 in-scope files. Decision D-07 (DECISIONS.md). |
| Edits | 6 hunks in 4 files under `skills/agent-runtime/`, committed in the same change set as this review. See Section 3. Cycle 4 adds one hunk (E7, `fact-check/SKILL.md`). See "Cycle 4 fixes". |

**Checks run (read-only):** Read, Grep, Glob, `git rev-parse HEAD`, `git status --short`, `git diff --stat`, `git ls-files`, a grep over snake_case identifiers in the six skill bodies, and `python3 -I -m json.tool` on the two constraint files. No tests were run, no packages installed, and no git state was changed.

**Working-tree note.** `scrum/DECISIONS.md` and `scrum/meetings/` are untracked at this commit, so citations to the memo and the decision are to working-tree copies. `git status` lists other modified or untracked paths (for example `lib/server/accounts/*`, `lib/i18n/config.ts`). This review did not touch them. The only changes made here are the six hunks in Section 3.

**Line numbers** refer to the files at the pinned commit. In `fact-check/SKILL.md`, lines after 102 shift by +1 after edit E4. Short code paths are relative to `lib/server/agent-runtime/` (for example `generation-tools.ts`, `skills.ts`, `course-tools.ts`, `fetch-url.ts`, `session-urls.ts`, `ask-user.ts`, `web-search.ts`, `dsl-tools.ts`). Short skill paths are relative to `skills/agent-runtime/` (for example `stage-design/SKILL.md`, `stage-dsl/references/quiz.md`).

---

## 0. Scope

| # | File | Lines | Role |
|---|---|---|---|
| 1 | `skills/agent-runtime/feynman-learning/SKILL.md` | 152 | learner-facing skill |
| 2 | `skills/agent-runtime/fact-check/SKILL.md` | 153 | learner-facing skill |
| 3 | `skills/agent-runtime/deep-research/SKILL.md` | 157 | learner-facing skill |
| 4 | `skills/agent-runtime/k12-core-literacy-planning/SKILL.md` | 185 | learner-facing skill |
| 5 | `skills/agent-runtime/curriculum-planner/SKILL.md` | 203 | learner-facing skill |
| 6 | `skills/agent-runtime/vocational/SKILL.md` | 67 | learner-facing skill |
| 7 | `skills/agent-runtime/deep-research/outline-constraints.json` | 5 | constraint file |
| 8 | `skills/agent-runtime/vocational/outline-constraints.json` | 12 | constraint file |
| 9 | `skills/agent-runtime/k12-core-literacy-planning/references/core-literacy.md` | 69 | reference |
| 10 | `skills/agent-runtime/k12-core-literacy-planning/references/subjects/mathematics.md` | 38 | reference |
| 11 | `skills/agent-runtime/k12-core-literacy-planning/references/subjects/science.md` | 38 | reference |
| 12 | `skills/agent-runtime/k12-core-literacy-planning/references/subjects/languages.md` | 43 | reference |
| 13 | `skills/agent-runtime/k12-core-literacy-planning/references/subjects/humanities.md` | 41 | reference |

Six SKILL.md files total 917 lines and the five references total 229 lines, which matches memo line 200. The two constraint files are in scope because the memo names "their constraint files". Other constraint files under `skills/agent-runtime/` (for example `lecture-style`, `pptx-import`) are outside D-07 scope and were not read.

---

## 1. Checklist results

Key: **P** pass. **F** fail, with finding ID. **S** partial, with style ID. **SME** flagged for subject or safety review, with F-ID. **N/A** not applicable. "edited" means fixed in Section 3; the result is for the post-edit text.

| File | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| feynman-learning | P | S (S-06) | F (D-17, D-18) | P | P | S (S-10) | F (D-19) | P | N/A | S (S-01, S-05) | S (S-15); SME F-20 |
| fact-check | P | N/A | F (D-16) | F edited (D-12) | P | S (S-11) | P | P | N/A | F edited (D-15); S-02 | P |
| deep-research | S (S-09) | S (S-08) | F (D-13) | F (D-11 edited; D-12 edited) | F edited (D-10) | S (S-12) | F (D-14) | P | N/A | S (S-05) | S (S-15) |
| k12-core-literacy-planning | P | P | F (D-20); S (S-16) | F (D-21) | P | S (S-13) | S (S-18) | SME F-18 | SME F-19 | S (S-03, S-05) | S (S-15); SME F-17 |
| curriculum-planner | P | P | F edited (D-07, D-08); D-09 open | F (D-09) | P | S (S-14) | N/A | F edited (D-07) | N/A | S (S-05) | S (S-15) |
| vocational | P | S (S-07) | S (S-17); D-04 edited | F (D-01, D-05) | F (D-01) | F (D-06) | P (note: thresholds unsourced, D-03) | F (D-03) | F (D-02) | S (S-04, S-05) | S (S-15); SME F-21 to F-23 |
| deep-research/outline-constraints.json | N/A | N/A | N/A | P | P | N/A | N/A | N/A | N/A | N/A | N/A |
| vocational/outline-constraints.json | N/A | N/A | N/A | F (D-05 open; D-04 edited) | F (D-01) | N/A | N/A | N/A | N/A | N/A | N/A |
| references/core-literacy.md | N/A | N/A | F (D-20) | F (D-21) | N/A | N/A | N/A | SME F-01 to F-09 | N/A | S (S-03) | N/A |
| references/subjects/mathematics.md | N/A | N/A | P | N/A | N/A | N/A | N/A | SME F-10, F-11 | N/A | S (S-05) | S (S-15) |
| references/subjects/science.md | N/A | N/A | P | N/A | N/A | N/A | N/A | SME F-12, F-13 | SME F-19 | S (S-03) | S (S-15) |
| references/subjects/languages.md | N/A | N/A | P | N/A | N/A | N/A | N/A | SME F-14 | N/A | S (S-05) | S (S-15) |
| references/subjects/humanities.md | N/A | N/A | P | N/A | N/A | N/A | N/A | SME F-15, F-16 | N/A | S (S-05) | S (S-15) |

Notes on the table:
- C4 for the SKILL files also covers cross-file references. All referenced files resolve: `/stage-design`, `/learning-to-learn`, `/style-clone`, `/pptx-import`, `pro-editing`, the five references (Glob, V-02).
- C5 identifier check: 25 snake_case identifiers in the six skill bodies. 23 match agent-runtime code. The two misses, `fix_all` and `fix_confirmed`, are ask_user option ids (fact-check:144), as the memo expects (V-01).

---

## 2. Defects

Priority: P1 safety-critical or blocks a required output; P2 contradiction or gap that changes what is generated; P3 low impact. Status: "edited" means a Section 3 edit, "open" means a decision is needed (Section 7).

### D-01. vocational/SKILL.md:17-18, 26-32; outline-constraints.json:10. P1, open (OD-1)
- **Item:** C4, C5.
- **Claim as written:** "At least three body scenes must be `interactive` with `widgetType: "procedural-skill"`" (SKILL:26-27). Constraint: `"requiredWidgetTypes": ["procedural-skill"]`.
- **Evidence:**
  - [Verified: lib/server/agent-runtime/generation-tools.ts:50-60] The `generate_scene` widget union accepts only `simulation`, `diagram`, `code`, `game`, `visualization3d`. Line 59 says "procedural-skill stays gated behind task-engine mode and is not accepted here."
  - [Verified: tests/agent-runtime/generation-tools.test.ts:442-444] A test pins that rejection.
  - [Verified: generation-tools.ts:458-461] After each page the active skill's constraints are checked. `skills.ts:815-818` reports "no scene uses the required `widgetType: procedural-skill`".
  - [Verified: lib/config/feature-flags.ts:117-129] Procedural output needs `OPENMAIC_ENABLE_VOCATIONAL` (default off) and `taskEngineMode`. The consumers are generation routes: `app/api/generate/scene-content/route.ts:178`, `app/api/generate/scene-outlines-stream/route.ts:415`, `lib/server/classroom-generation.ts:404`.
  - [Inference: in a conversational build, the required structure cannot be created, and a violation is reported after every page. The skill text does not state the gate.]
- **Severity:** defect.
- **Proposed correction:** Decision OD-1. Minimum text change: state in the description and in Structure that procedural-skill pages need task-engine mode; without it, the agent tells the user and offers an ordinary course. Scope `requiredWidgetTypes` and the interactive floor to the same gate. Widening `generate_scene` is a code change outside D-07.

### D-02. vocational/SKILL.md:4, 39-40. P1, open (OD-1, safety lead)
- **Item:** C9.
- **Claim as written:** Description: "Use when the requirement names ... a clinical or industrial procedure, or a certification skill." Scene titles: 「断电确认与验电」「绝缘电阻测量与判读」.
- **Evidence:** [Verified: grep of the file] No scope limit, review requirement, practitioner or sign-off wording. Memo line 288: clinical content needs a clinician, or the clinical scope should be removed. The titles name electrical isolation and insulation testing (F-21).
- **Severity:** defect (safety-critical).
- **Proposed correction:** Add a scope line: non-clinical occupational tasks only; clinical tasks are out of scope until a clinician reviews them. Add: every procedure needs a named practitioner review before real-world use. Safety lead signs off C9 (memo line 289).

### D-03. vocational/SKILL.md:24, 48-53. P1, open
- **Item:** C8.
- **Claim as written:** "`tools`: the actual tools, instruments, PPE or materials" (:48). "`successCriteria`: ... thresholds, readings, states" (:50-51).
- **Evidence:** [Verified: grep for "source", "cite", "standard", "verif"] The only hit is the step name "verification" (:24). The skill has no sourcing rule. Deep-research has one: "Never invent sources, citations, URLs or publication dates" (deep-research:137-138). k12 has one: "Never invent a standard number" (k12:48-49). [Inference: the generator is asked for thresholds and PPE with nothing to check them against.]
- **Severity:** defect (safety-critical).
- **Proposed correction:** Add: "Every number, threshold, PPE item and isolation step needs a source with edition or date, or is marked [Unverified: practitioner review required]. Do not invent thresholds." Per memo line 300, the claims stay out of real-world use until sourced and signed (F-23).

### D-04. vocational/outline-constraints.json:11; vocational/SKILL.md:44-53. P2, edited (E5)
- **Item:** C3, C4.
- **Claim as written:** Constraint `requiredWidgetOutlineFields: ["task", "steps", "successCriteria"]`. Skill requires six fields.
- **Evidence:** [Verified: lib/types/generation.ts:128-133] Six procedural-skill fields. [Verified: lib/prompts/templates/task-engine-outlines/system.md:216-223] Six fields required. [Verified: skills.ts:882-890] The post-page check drops this list. [Verified: V-14] `renderConstraints` has no production caller, so no runtime path applies the three-field list.
- **Severity:** defect (skill, template, type and constraint disagree).
- **Proposed correction:** Edited (E5).

### D-05. vocational/outline-constraints.json:8; vocational/SKILL.md (no slide count). P2, open
- **Item:** C4.
- **Claim as written:** Constraint: `{ "type": "slide", "max": 3 }`. Skill: no slide count.
- **Evidence:** [Verified: skills.ts:799-806; generation-tools.ts:458-461] Violations are reported after each page. The skill does not tell the agent the cap.
- **Severity:** defect.
- **Proposed correction:** Add to Structure: "No more than three slides in the whole course."

### D-06. vocational/SKILL.md:30-32, 44-53. P2, open
- **Item:** C6.
- **Claim as written:** Outputs are a six-field widget outline and a GO/STOP quiz. No example of either.
- **Evidence:** Only titles are exemplified (:39-40). The task-engine template has a widget outline example (`lib/prompts/templates/task-engine-outlines/system.md:188-190`). The skill does not.
- **Severity:** defect (structured output without a worked example).
- **Proposed correction:** Add one worked widget outline and one GO/STOP quiz item. Mark values "[Illustrative: not sourced]".

### D-07. curriculum-planner/SKILL.md:166-168. P2, edited (E1)
- **Item:** C3, C8.
- **Claim as written:** "the outline generator's plan is never exactly your proposal, and continuity has to be against reality."
- **Evidence:** [Verified: lib/server/agent-runtime/course-tools.ts:240] The runtime prompt replaces `generate_outline` with planning in the conversation. [Verified: skills/agent-runtime/stage-design/SKILL.md:31] "there is no outline tool to plan with." The absolute "never" has no source.
- **Severity:** defect.
- **Proposed correction:** Edited (E1).

### D-08. curriculum-planner/SKILL.md:156-157. P3, edited (E2)
- **Item:** C3, C4.
- **Claim as written:** "build it by the `stage-design` sequence — outline once, roster, one `generate_scene` per page in order".
- **Evidence:** [Verified: stage-design/SKILL.md:31] "there is no outline tool to plan with." The word "outline" names a step that does not exist.
- **Severity:** defect (terminology).
- **Proposed correction:** Edited (E2).

### D-09. curriculum-planner/SKILL.md:94-96, 100-104, 156-157. stage-design/SKILL.md:30 (outside D-07 scope). P1, open (OD-2)
- **Item:** C3, C4.
- **Claim as written:** Gate 1: "let Gate 2 be the one place they confirm" (:96). Gate 2: "**Never start building before the user has signed off on the full series.**" (:100-101). Execution loop: each stage is built "by the `stage-design` sequence" (:156-157).
- **Evidence:** [Verified: stage-design/SKILL.md:30] "Settle the plan with the user through `ask_user` before creating anything." [Verified: lib/server/agent-runtime/ask-user.ts:4-6] An `ask_user` call ends the run. One `ask_user` per stage would split the series run. The two repo documents disagree, and no code settles which holds.
- **Severity:** defect.
- **Proposed correction:** Decision OD-2. Either state in curriculum-planner that Gate 2 covers each stage's page list unless the user asks to review it, or change stage-design step 1 (outside D-07 scope).

### D-10. deep-research/SKILL.md:63-64. P2, edited (E3)
- **Item:** C5.
- **Claim as written:** "`fetch_url` accepts only URLs that appeared in the user's messages or in this session's `web_search` results."
- **Evidence:** [Verified: packages/@openmaic/storage/src/agent-session/pg.ts:1401-1413] The check compares origins: `urlOrigin(row.url) === candidateOrigin`. [Verified: lib/server/agent-runtime/fetch-url.ts:619-620, 627-630] Tool text and refusal text both say "origin". [Verified: lib/server/agent-runtime/session-urls.ts:4-8] "answers by WHATWG origin".
- **Severity:** defect.
- **Proposed correction:** Edited (E3). The policy in the next sentence ("Never assemble or recall a URL from memory") is unchanged. It is stricter than the gate and remains the agent's rule.

### D-11. deep-research/SKILL.md:107-108. P2, edited (E6)
- **Item:** C4.
- **Claim as written:** "plan the outline in the conversation, then `create_stage` and one `generate_scene` per page with an explicit brief." No roster step.
- **Evidence:** [Verified: stage-design/SKILL.md:38-46] "`set_roster`, before any page is generated." [Verified: generation-tools.ts:383, 446] Page generation reads agents from the stage's roster.
- **Severity:** defect.
- **Proposed correction:** Edited (E6).

### D-12. fact-check/SKILL.md:60-62; deep-research/SKILL.md:46-47. P2, fixed in cycle 4 (E7); OD-3 open for the number
- **Item:** C3, C4.
- **Claim as written:** fact-check: "A normal first pass should need no more than about 6–8 searches." deep-research: "At most **8 `web_search` calls for the whole session**". fact-check description (L4): "Combine with deep-research ...".
- **Evidence:** The two budgets cover different scopes. Under the text as written, a combined run can exceed the session limit (8 plus 6 to 8). [Verified: lib/server/agent-runtime/web-search.ts] The search tool file has no per-session cap. [Unverified: runner-level limits were not checked.] Code does not settle the number.
- **Severity:** defect.
- **Proposed correction:** Decision OD-3. Proposed: one number for the session, with fact-check's first pass counted inside it. Both files state it.

### D-13. deep-research/SKILL.md:147-150. P2, open
- **Item:** C3.
- **Claim as written:** "On external context, the better-verified recent source wins".
- **Evidence:** "better-verified" and "recent" have no ranking rule. Step 6 gives partial rules (:84-92). Memo line 223 says the same.
- **Severity:** defect.
- **Proposed correction:** Rank: primary over secondary; then the newer dated source. If still contested, present both with attribution (existing rule at :87-90).

### D-14. deep-research/SKILL.md:125-126. P2, open
- **Item:** C7.
- **Claim as written:** "Quiz distractors and interactive scenarios draw on ledgered facts too".
- **Evidence:** No rule for what the learner sees after a wrong answer. [Verified: skills/agent-runtime/stage-dsl/references/quiz.md:53] The `analysis` field is optional and "shown by quiz surfaces that expose analysis".
- **Severity:** defect.
- **Proposed correction:** Require one `analysis` line per quiz question that names the error behind each wrong option.

### D-15. fact-check/SKILL.md:105-107, 112, 117-120 vs 137-138. P2, edited (E4)
- **Item:** C10, C3.
- **Claim as written:** "Group them under these bold plain-text labels" with fixed Chinese labels (:105-107). Options: "in the user's language" (:137-138).
- **Evidence:** [Verified: lib/server/agent-runtime/course-tools.ts:273] "Reply in the user's language unless the user requests another language." The fixed Chinese labels contradict this for non-Chinese users. The option labels already follow the rule.
- **Severity:** defect.
- **Proposed correction:** Edited (E4).

### D-16. fact-check/SKILL.md:105-107. P3, open
- **Item:** C3.
- **Claim as written:** "A. 明确事实错误", "B. 表述不严谨", "C. 需要核实 — include only when the claim matters".
- **Evidence:** No criteria for A, B or C (memo line 216). A test pins the label text (tests/agent-runtime/skills.test.ts:389-391), so the labels are kept.
- **Severity:** defect (low impact).
- **Proposed correction:** One line per group: A = contradicted by a source you checked; B = correct but absolute or imprecise; C = could not verify.

### D-17. feynman-learning/SKILL.md:31, 81. P2, open
- **Item:** C3.
- **Claim as written:** "只有多次追问仍卡住且用户允许时，才提供必要事实或支架" (:31). "出现什么理解证据后停止" (:81).
- **Evidence:** "多次" (several), "必要事实或支架" (necessary facts or scaffold) and "理解证据" (evidence of understanding) have no threshold or example (memo lines 206-208). The stop point is left to the brief.
- **Severity:** defect.
- **Proposed correction (PD decision):** At most three probes per gap. Evidence is the learner stating the causal step in their own words. Give a scaffold only after that.

### D-18. feynman-learning/SKILL.md:67, 88, 146-150. P2, open (OD-4)
- **Item:** C3, C4.
- **Claim as written:** L88: "保留第一版与第二版的可比较差异，供最终学习记录使用。" L67: if the component cannot save free input, the learner writes or says a first version and "让老师旁白提醒其保留". L146-150: static pages cannot continuously save explanation versions.
- **Evidence:** [Verified: lib/types/widgets.ts] No widget config has a free-text learner-answer field. The only `input` is `CodeTestCase.input` (:64). [Verified: stage-dsl/references/quiz.md:52] Short-answer items list "accepted short-answer values" [Inference: the answer is compared to a fixed list, not to an open explanation]. [Unverified: whether any runtime path persists learner text.] The comparison in L88 has no typed storage. The L67 fallback is a narration reminder.
- **Severity:** defect.
- **Proposed correction (OD-4):** Either record the first version in the conversation (the skill's own fallback) and state that the comparison happens there, or remove the saved-comparison requirement from L88.

### D-19. feynman-learning/SKILL.md:73, 81. P2, open
- **Item:** C7.
- **Claim as written:** "让学习者自己判断「我卡在哪里」，不要只展示 AI 评分" (:73).
- **Evidence:** No rule for what the learner sees after a response, and no rule for when a check counts as passed (memo line 209).
- **Severity:** defect.
- **Proposed correction:** After each response, the learner sees which causal step is missing (no score). The check counts as passed when the learner states that step. PD decision.

### D-20. k12-core-literacy-planning/SKILL.md:53; references/core-literacy.md:13. P2, open (OD-5)
- **Item:** C3.
- **Claim as written:** "Choose only **one or two** primary literacy dimensions for one lesson." The reference row for compulsory mathematics (core-literacy.md:13) is "三会", which names three components in one cell.
- **Evidence:** "Dimension" is not defined, and one row holds three components (memo line 230).
- **Severity:** defect.
- **Proposed correction:** Decide OD-5. Proposed: 三会 counts as one dimension, and the brief names the component.

### D-21. k12-core-literacy-planning/SKILL.md:35, 178; references/core-literacy.md:54-69. P2, open (OD-5, SME)
- **Item:** C4.
- **Claim as written:** Completion check: "the central misconception is handled by an activity or quiz" (:178).
- **Evidence:** IT, arts, PE and labor each get four bullets and no misconceptions, stage arcs or non-negotiables (core-literacy.md:54-69). The other subjects have them: mathematics.md:32-34, science.md:27-34, languages.md:30-32, humanities.md:20-22. The completion check cannot be met for those four subjects from the reference.
- **Severity:** defect.
- **Proposed correction:** A subject reviewer adds those sections, or the completion check is scoped to subjects that have a misconception list.

---

## 3. Edits (internal contradictions only)

Rule applied: an edit is made only where two repo statements disagree and code or repo documentation settles which is right. No edit changes an education or safety claim. Each edit is listed with the text before and after.

Post-edit check: the new text is present at the lines listed (Grep). Substrings pinned by tests are still present: fact-check (skills.test.ts:376-399) and curriculum-planner (skills.test.ts:697-703). Tests were not run.

| ID | Finding | File and lines (pre-edit) | Settled by |
|---|---|---|---|
| E1 | D-07 | curriculum-planner/SKILL.md:167-168 | course-tools.ts:240; stage-design/SKILL.md:31 |
| E2 | D-08 | curriculum-planner/SKILL.md:157 | stage-design/SKILL.md:26-31 |
| E3 | D-10 | deep-research/SKILL.md:63-64 | pg.ts:1401-1413; fetch-url.ts:619-630; session-urls.ts:4-8 |
| E4 | D-15 | fact-check/SKILL.md:102 (post-edit 102-103) | course-tools.ts:273 |
| E5 | D-04 | vocational/outline-constraints.json:11 | vocational/SKILL.md:44-53; generation.ts:128-133; task-engine system.md:216-223 |
| E6 | D-11 | deep-research/SKILL.md:108 | stage-design/SKILL.md:38-46; generation-tools.ts:383, 446 |

**E1. curriculum-planner/SKILL.md, lines 166-168**

Before:
```
   build — the outline generator's plan is never exactly your proposal, and
   continuity has to be against reality.
```
After:
```
   build. The built stage may differ from the plan you proposed, so
   continuity has to be checked against what is there.
```

**E2. curriculum-planner/SKILL.md, line 157**

Before: `outline once, roster, one`
After: `plan the page list in the conversation, set the roster, one`

**E3. deep-research/SKILL.md, lines 63-64**

Before:
```
- `fetch_url` accepts only URLs that appeared in the user's messages or in
  this session's `web_search` results.
```
After:
```
- `fetch_url` accepts only URLs whose origin (scheme, host and port) appeared in
  the user's messages or in this session's `web_search` results.
```

**E4. fact-check/SKILL.md, line 102 (post-edit lines 102-103)**

Before: `and omit an empty group. Keep them at normal body-text size: do not prefix them`
After:
```
and omit an empty group. Write these labels and the bullet labels below in the
user's language; the Chinese forms shown here apply to a Chinese reply. Keep them at normal body-text size: do not prefix them
```

**E5. vocational/outline-constraints.json, line 11**

Before: `  "requiredWidgetOutlineFields": ["task", "steps", "successCriteria"]`
After: `  "requiredWidgetOutlineFields": ["procedureType", "task", "tools", "steps", "successCriteria", "errorConsequences"]`

Runtime effect: none today. No production path applies this list (V-13, V-14). The file still parses (`python3 -I -m json.tool`).

**E6. deep-research/SKILL.md, line 108**

Before: `` `create_stage` and one `generate_scene` per page with an explicit brief. ``
After: `` `create_stage`, `set_roster`, and one `generate_scene` per page with an explicit brief. ``

---

## 4. Style items (no edit; proposed corrections)

| ID | File:line | Item | Proposed correction |
|---|---|---|---|
| S-01 | feynman/SKILL.md:25, 29, 73 | C10: "PPT", "AI" unexpanded | Expand on first use. |
| S-02 | fact-check/SKILL.md:9 | C10: "AI hallucinations" unexpanded | Expand on first use. |
| S-03 | k12/SKILL.md:4, 35, 43, 102-103; core-literacy.md:25, 27, 59, 63; science.md:10 | C10: "K-12", "IT", "PE", "UDL", "PBL", "CER" unexpanded | Expand on first use. |
| S-04 | vocational/SKILL.md:13, 22, 30-31, 48 | C10: "JSON", "GO/STOP", "PPE" | Expand; define GO/STOP in one line. |
| S-05 | all six SKILL.md; references | C10: feynman body is Chinese; the other bodies are English with Chinese example titles; no stated rule | Bilingual reviewer sets one rule (OD-7). |
| S-06 | feynman/SKILL.md:53-55 | C2: audience is required; stage, age and course language are not | Add stage or age and course language. |
| S-07 | vocational/SKILL.md (no trainee level, :9-21) | C2 | Add trainee level, or state "ask the user". |
| S-08 | deep-research/SKILL.md:46-48 | C2: no audience or level; only "write queries in the language of the course" | Add audience and course language. |
| S-09 | deep-research/SKILL.md:9-12, 23-24 | C1: objective is the production process; no learner outcome | Add one outcome line (PD). |
| S-10 | feynman/SKILL.md:39-45, 31, 81 | C6: examples are titles only; no sample explanation, probing question or stop condition | Add one good and one bad example for each. |
| S-11 | fact-check/SKILL.md:112 | C6: one format example; no finding example | Add one finding example and one non-finding example. |
| S-12 | deep-research/SKILL.md:77-80 | C6: ledger described with no entry | Add one ledger row. |
| S-13 | k12/SKILL.md:56-57, 121-127 | C6: contract template and brief checklist have no filled example | Add one filled contract and one page brief. |
| S-14 | curriculum-planner/SKILL.md:106-118, 163-164, 189-194 | C6: no example for the Gate 2 list, per-lesson paragraph or series summary | Add one example each. |
| S-15 | feynman :29-33; k12 :59-61, 69-70, 99-101, 159-161; curriculum-planner :81-83, 136-142; vocational :33, 59-60; deep-research :23-24 | C11: opinions stated without label or reason | Prefix with "[Opinion: reason]", or cite the source. The k12 developmental claims are also in F-17. |
| S-16 | k12/SKILL.md:133-135 | C3: "A turn ends only at an `ask_user` gate, after a page has actually persisted, or when ..." reads as a stop after one page | Rewrite: a turn ends at an `ask_user` gate or when the stage passes the checks; one persisted page is not an end. |
| S-17 | vocational/SKILL.md:22, 31-32 | C3: GO/STOP outcomes are defined only by example | Define the three outcomes (proceed, recheck, stop) in one line. |
| S-18 | k12/SKILL.md:99-101 | C7: "feedback teaches, not merely marks wrong" with no quiz analysis rule | Same as D-14: one analysis line per quiz option (quiz.md:53). |

---

## 5. Claim log

### 5a. Flagged for subject-matter or safety review (not changed)

Verdict rule (memo line 293): confirmed, corrected, or unverifiable. Every F-row is **unverifiable** today because the repo cites no edition and no source. Memo line 299 keeps unverifiable claims out of generation until resolved. Whether that rule covers the whole dimension table is a PD and QA decision (OD-8).

| ID | File:line | Claim | Label | Reviewer needed |
|---|---|---|---|---|
| F-01 | core-literacy.md:10-11 | Chinese dimension names, compulsory and senior high | [Unverified: no source or edition in repo] | Chinese subject reviewer |
| F-02 | core-literacy.md:12 | English, Japanese and Russian dimension names | [Unverified] | languages reviewer |
| F-03 | core-literacy.md:13 | 三会 as the compulsory mathematics dimension | [Unverified] | mathematics reviewer |
| F-04 | core-literacy.md:14 | Senior-high mathematics, six dimensions | [Unverified] | mathematics reviewer |
| F-05 | core-literacy.md:15-16 | Morality and law; ideology and politics dimensions, including 政治认同 | [Unverified] | humanities and policy reviewer |
| F-06 | core-literacy.md:17-18 | History and geography dimensions | [Unverified] | humanities reviewer |
| F-07 | core-literacy.md:19-24 | Science, physics, chemistry and biology dimensions | [Unverified] | science reviewer |
| F-08 | core-literacy.md:25-28 | IT, arts, PE and health, labor dimensions | [Unverified] | IT, arts, PE and labor reviewers |
| F-09 | core-literacy.md:14, 30-36 | Stage forms of 三会; naming changes: 推理意识 (:33), 推理能力 (:35), 逻辑推理 (:14) | [Unverified]; naming intent is a subject question (memo line 237) | mathematics reviewer |
| F-10 | mathematics.md:12-17 | Stage arcs | [Inference: pedagogical design claim] | mathematics reviewer |
| F-11 | mathematics.md:32-34 | Typical misconceptions | [Unverified] | mathematics reviewer |
| F-12 | science.md:9-11 | Stage arcs, including the CER model | [Unverified] | science reviewer |
| F-13 | science.md:27-34 | Misconceptions: life defined by movement; force as cause of motion; colour change as proof; observation as inference | [Unverified] | science reviewer |
| F-14 | languages.md:30-32 | Misconceptions: appreciation, debate, cultural confidence | [Unverified] | languages reviewer |
| F-15 | humanities.md:17-22 | 家国情怀 emerges through understanding; novels and screen stories are not historical evidence | [Unverified] | humanities reviewer |
| F-16 | humanities.md:33-36 | Values come through deliberation, not a "one-way 'correct answer' speech"; this sits against the political identity target (core-literacy.md:15-16) | [Opinion: memo line 239 says policy and subject reviewers must decide] | humanities and policy reviewers |
| F-17 | k12/SKILL.md:159-161 | Developmental register by school stage | [Unverified: developmental claim] | curriculum and developmental reviewer |
| F-18 | k12/SKILL.md:4, 9-10 | "2022 课标" and "Chinese curriculum standards' core-literacy model" | [Unverified: no edition in repo]; [Speculation: some senior-high wording may come from an earlier edition] | curriculum reviewer, who names the edition |
| F-19 | science.md:9, 19 | Hands-on inquiry in primary and junior high, with no safety scope | [Opinion, with reason: hands-on work with materials needs a safety scope] | safety lead and science reviewer |
| F-20 | feynman/SKILL.md:29-33 | Principles, including "能背术语不等于理解" (:32) | [Opinion: memo line 210 asks a learning scientist to confirm practice versus evidence] | learning scientist |
| F-21 | vocational/SKILL.md:39-40 | Scene titles: electrical isolation check (断电确认与验电) and insulation resistance (绝缘电阻测量与判读) | [Unverified] | licensed electrical practitioner and safety lead; blocked from real-world use until sourced and signed (memo line 300) |
| F-22 | vocational/SKILL.md:4 | Clinical procedure and certification skill are in scope | [Opinion: memo line 288] | clinician, or remove the clinical scope |
| F-23 | vocational/SKILL.md:44-53 | PPE, tool lists, steps, threshold readings, error consequences | [Unverified]; [Inference: the generator would produce numbers the file does not contain (memo line 255)] | practitioner and safety lead; blocked as above |

Count of flagged claims: **23** (F-01 to F-23).

### 5b. Verified against code or repo (read-only)

| ID | Claim | Evidence | Verdict |
|---|---|---|---|
| V-01 | Snake_case identifiers in the six skills exist in code | 25 scanned; 23 found; misses `fix_all`, `fix_confirmed` are option ids (fact-check:144; ask-user.ts:30-32) | Confirmed; matches memo lines 196-197 |
| V-02 | Referenced skills and reference files exist | Glob: stage-design, pro-editing, learning-to-learn, style-clone, pptx-import; five k12 references | Confirmed |
| V-03 | Scene types slide, quiz, interactive, pbl | packages/@openmaic/dsl/src/stage.ts:22 | Confirmed |
| V-04 | `procedureType` values | lib/types/generation.ts:128; vocational/SKILL.md:46 | Confirmed |
| V-05 | `discussion` action | packages/@openmaic/dsl/src/action.ts:197; feynman:77 | Confirmed |
| V-06 | `materialFacts` parameter | generation-tools.ts:71 | Confirmed |
| V-07 | `read_stage` detail `tree`, `source`, `text`; `nextOffset` | dsl-tools.ts:404-427, 753-767; fact-check:27-28, 39-40 | Confirmed |
| V-08 | `audioId` on speech actions | packages/@openmaic/dsl/src/action.ts:57; k12:129-131 | Confirmed |
| V-09 | `ask_user`: unique option ids; free-text "other" row in the UI | ask-user.ts:23-43; components/workbench/chat/question-form.tsx:16 | Confirmed by reading; [Unverified: not exercised in a browser] |
| V-10 | `ask_user` ends the run | ask-user.ts:4-6; curriculum-planner:23-27 | Confirmed |
| V-11 | Constraint file is read for any skill that has one | skills.ts:186 | Confirmed (memo line 223) |
| V-12 | Constraints are checked after each `generate_scene` (diagnostic) | generation-tools.ts:458-461; skills.ts:877-880 | Confirmed; the deep-research constraint is live |
| V-13 | `requiredWidgetOutlineFields` is not applied in the post-page check | skills.ts:882-890 | Confirmed |
| V-14 | `renderConstraints` and `skillOutlineContext` have no production caller | Grep of the repo: only skills.ts and tests/agent-runtime/user-skills-runtime.test.ts | Confirmed |
| V-15 | The conversational build has no outline tool | course-tools.ts:240; stage-design/SKILL.md:26-31 | Confirmed; deep-research:107 is consistent for that path |
| V-16 | `generate_scene` widget union excludes `procedural-skill` | generation-tools.ts:50-60, comment :59; tests/agent-runtime/generation-tools.test.ts:442-444 | Confirmed |
| V-17 | Vocational gate | lib/config/feature-flags.ts:117-129; three consumer routes | Confirmed |
| V-18 | `fetch_url` gate compares origins | pg.ts:1401-1413; fetch-url.ts:619-630; session-urls.ts:4-8 | Confirmed; deep-research:63 corrected (E3) |
| V-19 | Pages read agents from the stage's roster | generation-tools.ts:383, 446; stage-design/SKILL.md:38-46 | Confirmed; deep-research:107-108 corrected (E6) |
| V-20 | Chat replies follow the user's language | course-tools.ts:273 | Confirmed; fact-check:100-107 corrected (E4) |
| V-21 | Quiz `analysis` is optional | stage-dsl/references/quiz.md:53 | Confirmed |
| V-22 | Typed widgets have no learner free-text answer field | lib/types/widgets.ts (only `input` is `CodeTestCase.input`, :64) | Confirmed for types; runtime persistence [Unverified] |
| V-23 | Speech input code exists | file list from Grep: tests/audio/*, tests/server/transcription-*, types/web-speech.d.ts | Existence confirmed; whether learner pages use it [Unverified] |
| V-24 | Pinned test text is preserved by the edits | skills.test.ts:376-399, 694-718 (read) | Confirmed by reading; tests not run |
| V-25 | File line counts 917 and 229 | Read | Confirmed (memo line 200) |
| V-26 | Skill runtime reads SKILL.md through the read tool | skills.ts:7-9 | Confirmed |

---

## 6. Corrections to the product memo

These concern `scrum/meetings/product.md` (untracked working-tree copy). This review does not edit it.

- **M-1 (memo line 193).** "A skill body feeds the outline generator." Not supported by production code: `skillOutlineContext` and `renderConstraints` have no production caller (V-14). The skill body reaches the agent through the read tool (V-26), and constraints are checked after each page (V-12).
- **M-2 (memo line 222).** "[Unverified: whether this path reaches the outline generator.]" Verified for the conversational path: there is no outline tool (V-15). The deep-research line is consistent for that path.
- **M-3 (memo line 250).** "vocational/outline-constraints.json checks three." No production path applies the vocational widget-outline list (V-13, V-14). The count is correct for the file and wrong for runtime.
- **M-4 (memo line 228).** "Chinese references." The five references are English prose with Chinese dimension terms.
- **M-5 (memo lines 186-188, safety-first item).** The memo does not mention the vocational gate or the `generate_scene` widget limit (V-16, V-17). Both belong in item 1, since they decide whether the vocational skill can produce its required output at all (D-01).
- **M-6 (memo line 188, "storage dependency").** Partly verified: no typed free-text learner answer (V-22). Runtime persistence is unverified (D-18).
- **Confirmed as stated:** 23 of 25 identifiers, with the two misses expected (memo lines 196-197; V-01). Line counts 917 and 229 (memo line 200; V-25). Core-literacy cites no source or edition (memo line 235).

---

## 7. Open decisions (not accepted)

No one has accepted these in writing. Each needs the named owner.

- **OD-1. Vocational procedural output (D-01, D-02, D-03).** Owners: PD, safety lead, engineering owner. Options: (a) state the task-engine gate in the skill and tell the user when it is missing; (b) extend `generate_scene` under the same gate (code change, outside D-07); (c) remove the vocational skill from the conversational builder. Until decided, do not use this skill to generate real-world procedure content.
- **OD-2. Gate 2 versus per-stage sign-off (D-09).** Owners: PD and QA.
- **OD-3. Search budget (D-12).** Owners: PD and QA.
- **OD-4. Feynman comparison and storage (D-18).** Owners: PD and engineering owner.
- **OD-5. Dimension granularity and coverage (D-20, D-21).** Owners: PD with subject reviewers.
- **OD-6. Definitions (D-13, D-16, D-17, D-19).** Owner: PD.
- **OD-7. Language rule across skills (S-05).** Owner: bilingual reviewer (memo line 290).
- **OD-8. Unverifiable claims and generation (F-01 to F-23).** Owners: subject and safety reviewers, each naming an edition. PD and QA decide whether memo line 299 blocks the whole dimension table until then.

---

## 8. Phase 1 acceptance (memo lines 295-302)

1. **Review record per file:** Partly met. All 13 files are listed with SHA, date and checklist results. Reviewer names not assigned [Unverified].
2. **No open internal contradiction:** Not met. Six contradictions are edited (E1 to E6), and D-12 is fixed in cycle 4 (E7). Open: D-01, D-09, D-18, D-20. D-20 is a definition question with subject content, not an internal contradiction under the cycle 4 rule (see "Cycle 4 fixes").
3. **Automated checks (C4, C5, file resolution):** Identifier check 23 of 25, with 2 expected option-id misses. File resolution passes. C4 fails on D-05, D-09, D-21 and, for the vocational skill, D-01. D-12 no longer fails C4 after cycle 4 (E7).
4. **Claim log:** 23 flagged rows (F-01 to F-23) and 26 verified rows (V-01 to V-26). Flagged rows are unverifiable until editions are named.
5. **Vocational thresholds and safety steps sourced and signed:** Not met. F-21 to F-23 are blocked. No practitioner or safety sign-off exists.
6. **Sample test after edits:** Not run. It needs model access (D-07 says so).
7. **Later edits reopen review records:** The four edited files (curriculum-planner, deep-research, fact-check, vocational constraints) are reopened. A QA pass on the post-edit text is needed.

---

## 9. Working tree and reversal

- The six hunks are uncommitted. `git diff --stat` for `skills/agent-runtime/` shows four files: curriculum-planner/SKILL.md (2 hunks), deep-research/SKILL.md (2 hunks), fact-check/SKILL.md (1 hunk), vocational/outline-constraints.json (1 hunk).
- Reversal (memo line 306): restore the "Before" text in Section 3, or revert the commit once one is made. No commit was requested, so none was made.
- This review adds one file, `scrum/reviews/content-phase1.md`, under `scrum/reviews/`, which was empty before.
- Status at cycle 4: `git diff 491c409e278e68b8dda001554398286c26c37ec2 HEAD` shows the four skill files above, so the six hunks are committed at HEAD `9368ff15b1d2ad619c785972f397eed08d1c45e5`. The two bullets above describe the state before that commit.
- Cycle 4 adds one hunk (E7) in `fact-check/SKILL.md` and one file, `scrum/reviews/templates-phase1.md` (B36). Reversal of E7: restore its Before text in the "Cycle 4 fixes" section.

---

## Cycle 4 fixes

**Scope (B35).** Each open defect in Section 2 was checked against the files it cites and against code or a second repo statement. Rule applied:

- A defect is **internal** when two repo statements conflict, a reference points to something missing, or a rule conflicts with code.
- A defect is **fixed** here only when an existing statement settles the text, with no number the repo does not already state, no new learner-facing step, and no unverified fact in the edit.
- Education, safety and subject-matter claims are not changed. Everything else stays open.

Checked at HEAD `9368ff15b1d2ad619c785972f397eed08d1c45e5`. Line numbers are HEAD line numbers. No tests were run, no packages were installed, and no git state was changed.

**Result: 1 fixed (D-12, E7). 14 still open.**

**E7. `fact-check/SKILL.md`, lines 62-63 before the edit (defect D-12, cycle 4)**

Before:
```
6–8 searches. Use `fetch_url` to read the source: a result snippet or the mere
existence of a related source is not evidence.
```
After:
```
6–8 searches. When it is combined with deep-research in one session, those
searches count toward deep-research's limit of 8 `web_search` calls for the whole
session. Use `fetch_url` to read the source: a result snippet or the mere
existence of a related source is not evidence.
```

Evidence:
- `deep-research/SKILL.md:46-47`: "At most **8 `web_search` calls for the whole session**". The whole-session wording covers a combined run, so E7 uses a number the repo already states.
- `fact-check/SKILL.md:4`: "Combine with deep-research when current evidence is the course's main subject." This is the combined case.
- `web-search.ts:92-99` gives no count, and `runner.ts:1281-1290` registers the tool and the session URLs, with no count. [Verified: Grep for search-budget and limit terms under `lib/server/agent-runtime` found no count.]
- `tests/agent-runtime/skills.test.ts:387` pins "6–8 searches". E7 keeps that text (tests not run).
- Post-edit check: Grep shows the new text at `fact-check/SKILL.md:62-64`.

Residual, OD-3 stays open for the number:
- [Inference: a combined run's first pass can use most of the 8, leaving little for deep-research's facets. Whether 6–8 or 8 is the right figure is the OD-3 decision.]
- [Inference: E7 changes search behaviour, not reply text, so the SME rule at `scrum/meetings/qa-rebuttal.md:127` may not apply. Unverified: PD and QA may still want to review it.]

**Left open: internal, decision needed**

- **D-01.** Contradiction verified: `vocational/SKILL.md:26-27` requires `procedural-skill` scenes; `generation-tools.ts:58-59` rejects that widget outside task-engine mode; `vocational/outline-constraints.json:10` requires it. Not edited: `scrum/BACKLOG.md:171` (B34) says "Needs a product decision", and the OD-1 options (state the gate and fall back, extend `generate_scene`, or remove the skill) are product or code choices. The constraint file cannot be scoped without a code change.
- **D-09.** Contradiction verified: `curriculum-planner/SKILL.md:96` ("let Gate 2 be the one place they confirm") against `stage-design/SKILL.md:30` ("Settle the plan with the user through `ask_user` before creating anything"), reached through `curriculum-planner/SKILL.md:156-157`. `curriculum-planner/SKILL.md:10-11` says stage-design governs how each stage is built, which points toward a confirmation per stage; `:96` points to one confirmation for the series. The repo does not settle which holds, and the Section 3 rule allows an edit only where it does. [Inference: each correction changes how often the user is asked, so it is an OD-2 product choice.]
- **D-18.** Contradiction verified: `feynman-learning/SKILL.md:88` requires a saved first and second version; `:146-152` says generated pages cannot diagnose each input, and that continuous saving of explanation versions needs the conversation loop (path 3). [Inference: both corrections change what the learner does, namely who keeps the first version and whether the comparison happens in chat.] The final record at `:108-120` depends on the same storage. [Unverified: whether any runtime path persists learner text.] OD-4.

**Left open: not internal under the cycle 4 definition**

- **D-05.** Silence, not contradiction. `vocational/outline-constraints.json:8` caps slides at three, and the skill text does not conflict with that cap. The one-line addition the review proposes is a candidate for the next cycle.
- **D-06, D-13, D-14, D-16, D-17, D-19.** Each is a missing example, an undefined term, or a missing feedback rule. Each needs new text, not reconciliation. The memo (`scrum/meetings/product.md:188`) calls D-17 an internal contradiction; under the cycle 4 definition it is an undefined threshold.

**Left open: safety or subject matter (not changed)**

- **D-02, D-03.** Vocational clinical scope, and sourcing for thresholds and PPE (`vocational/SKILL.md:4`, `:48-53`).
- **D-20, D-21.** Dimension count and misconception coverage (`k12-core-literacy-planning/SKILL.md:53`, `:178`). Section 8 item 2 lists D-20 as internal; cycle 4 treats it as a definition question with subject content.

**Template findings (B36)** are in `scrum/reviews/templates-phase1.md`, pinned to the same HEAD. No template was edited.
