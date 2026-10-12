# Template mechanical pass, D-07 phase 1 (B36)

| Field | Value |
|---|---|
| Pinned commit | `9368ff15b1d2ad619c785972f397eed08d1c45e5` (output of `git rev-parse HEAD`) |
| Date | 2026-10-11 |
| Scope | The six learner-facing templates named in `scrum/meetings/product-rebuttal.md` section 6 (D-07, lines 167-170), 665 lines in total: `packages/@openmaic/generation/templates/procedural-skill-content/` (system.md, user.md), `quiz-content/` (system.md, user.md), `quiz-actions/` (system.md, user.md). Scope source: `scrum/DECISIONS.md:64`. |
| Method | Read of each template. Grep and Read of the caller that fills each template (`packages/@openmaic/generation/src/scene-generator.ts`), the loader (`packages/@openmaic/generation/src/prompts/loader.ts`), the schema (`packages/@openmaic/dsl/src/stage.ts`, `lib/types/widgets.ts`, `packages/@openmaic/generation/src/outline-types.ts`), the action parser, and the iframe sender. Mechanical checks only. |
| Edits | None. No template was edited. |
| Not run | Tests, sample generation (needs generation calls), package installs. No git state was changed. |
| Reviewer | Product and pedagogy reviewer, cycle 4. A second reviewer must re-run these checks (`scrum/meetings/qa.md:259`). |

Line numbers refer to HEAD `9368ff1`. Paths under `packages/@openmaic/generation/templates/` are written as `<template>/<file>`.

**Severity.** `defect`: the text contradicts itself or another repo file, or names a field the code schema does not define. `claim-for-review`: the text is stricter than the schema, depends on a condition the caller may not meet, duplicates another rule, or needs a product default.

---

## 1. Findings

| Template path | Check | Finding | Evidence (file:line) | Severity | Proposed fix |
|---|---|---|---|---|---|
| `quiz-content/user.md` | Duplicated or contradictory instructions | The prompt says to use the system prompt's object shape. Its example object has no `analysis` and no `points`. The system prompt requires both on every question. A generation call that copies the example drops them. | `quiz-content/user.md:9-10`; `quiz-content/system.md:12-13, 101`; `packages/@openmaic/dsl/src/stage.ts:202, 205` (both optional in the type) | defect | Add `"analysis": "..."` and `"points": 10` to the example object at `user.md:10`. |
| `procedural-skill-content/system.md` | Field not defined by the code schema | The "minimum shape" of the widget config lists a top-level `errorConsequences`. `ProceduralSkillConfig` has no such field; its fields are `type`, `task`, `description`, `tools`, `steps`, `successCriteria`. The step fields do match. The template also asks the generator to use the consequences for feedback paths. | `system.md:83, 92`; `lib/types/widgets.ts:183-198` | defect | Decide the contract. Either add `errorConsequences?: string[]` to `ProceduralSkillConfig` (a code change, outside B36), or remove `system.md:83` and say where consequences live. [Inference: the feedback path depends on this choice.] |
| `procedural-skill-content/system.md` (and `user.md`) | Duplicated or contradictory instructions | The tools/materials area is conditional at `system.md:49` ("when tools are provided"). The interaction rules at `system.md:99` say each task must include tools/materials, and `user.md:45` requires the area with no condition. With no tools in the input, the rules disagree. Impact: low. | `system.md:49, 99`; `user.md:45` | defect | Change `system.md:49` to "A tools/materials area (say 'None' when no tools are given)." |
| `quiz-actions/system.md` | Duplicated or contradictory instructions (format) | The output example is fenced in a json code block (`:15-22`), and the same file says "no code fences" (`:26`). `user.md:10-11` shows the unfenced form. Impact: low. | `system.md:15-22, 26`; `quiz-actions/user.md:10-11` | defect | Show the example unfenced, as `user.md:11` does. |
| `quiz-content/system.md` | Format contradiction with a spliced snippet | The snippet spliced at `:5` says "Do NOT wrap with ```json code blocks". The "Output Format" example at `:103-142` is wrapped in a json code fence. [Inference: a generation call may copy the fence into its output.] Impact: low. | `quiz-content/system.md:5, 103, 142`; `packages/@openmaic/generation/snippets/json-output-rules.md:4` | defect | Show the output example at `:103-141` unfenced. Fences in the question-type examples (`:23-74`) can stay, since those are not output. |
| `quiz-actions/system.md` | Reference to context the prompt may not supply | The system prompt says the user prompt includes "a **Course Outline** and **Position** indicator" (`:64`). `buildCourseContext` returns an empty string when no context is passed, and the context is optional at the caller, so on that path the prompt has no Position. | `quiz-actions/system.md:64`; `packages/@openmaic/generation/src/prompt-formatters.ts:9-10`; `packages/@openmaic/generation/src/scene-generator.ts:122, 1699` | claim-for-review | Reword `:64` to "When the user prompt includes ...", or add a fallback for pages with no context. |
| `quiz-content/system.md` | Stricter than the code schema | The template says every question must include `analysis` and `points` (`:12-13, 101`), and that short answers must include `commentPrompt` (`:14`). The code type makes all three optional, and the code does not reject a missing field. | `quiz-content/system.md:12-14, 101`; `packages/@openmaic/dsl/src/stage.ts:196-206` | claim-for-review | Decide whether the product requires them. If yes, say so in the schema comment and keep the rule. If no, change "must" to "should". Pair with the first row. |
| `quiz-content/system.md` | Duplicated or contradictory instructions (instruction vs examples) | The design rules say "Randomize correct answer position" (`:89`). Both single-choice examples use answer `"A"` (`:34, :115`). The template cannot randomize. [Inference: the examples may anchor the answer position.] | `quiz-content/system.md:34, 89, 115` | claim-for-review | Use a different letter in one example. Keep `:89` as an instruction to the generator. |
| `procedural-skill-content/system.md`; `procedural-skill-content/user.md` | Language or format vs the reply-language rule (`lib/server/agent-runtime/course-tools.ts:273`) | The only language rule is "Follow the requested language directive exactly when provided" (`system.md:352-354`). With an empty directive, the caller passes `''` (`scene-generator.ts:1255`), and the Language section of the user prompt is blank (`user.md:35-37`). `course-tools.ts:273` governs chat replies, not widget text. The two rules do not conflict in wording, but this path has no fallback. | `procedural-skill-content/system.md:352-354`; `procedural-skill-content/user.md:35-37`; `scene-generator.ts:1255`; `course-tools.ts:273` | claim-for-review | Add a fallback line. Proposed default for product to confirm: "If no directive is given, write in the language of the course title." |
| `quiz-actions/system.md`; `quiz-content/system.md` | Language or format vs the reply-language rule (`course-tools.ts:273`) | Neither system prompt states a language rule. Their examples are in English (`quiz-actions/system.md:19, 48`; `quiz-content/system.md:27, 35`). The only language instruction is `{{languageDirective}}` in the user prompts (`quiz-actions/user.md:8`; `quiz-content/user.md:6-7`), and the caller passes `''` when it is absent (`scene-generator.ts:874, 1701`). | `quiz-actions/system.md:19, 48`; `quiz-content/system.md:27, 35`; `quiz-actions/user.md:8`; `quiz-content/user.md:6-7`; `scene-generator.ts:874, 1701` | claim-for-review | Add one line to each system prompt: "Write all speech and text in the language given by the directive." Use neutral placeholders in examples. |
| `procedural-skill-content/system.md` | Duplicated instructions (no conflict found) | The same rules are restated: visual variety (`:26, :313, :346`); reset (`:106, :198, :306-307, :342`); null-safe DOM writes (`:205-211, :311-312, :344`); no `window.parent.postMessage` (`:253, :299`); no fences (`:61, :350`). The wording matches today. | as cited | claim-for-review | Keep one statement per rule, and cross-reference it from the quality checklist (`:328-350`). |
| `procedural-skill-content/user.md` | Duplicated instructions across the two prompts | The 22-item list (`:41-66`) repeats rules from `system.md` (`:40-62`, `:215-222`, `:249-250`). The wording matches today, so a later edit to one prompt can leave the other behind. | `procedural-skill-content/user.md:41-66`; `system.md` as cited | claim-for-review | Keep the mandatory list in one prompt, and reference it from the other. |
| `quiz-actions/system.md` | Duplicated instructions (no conflict found) | The segment count is stated at `:60` ("1 text object, sometimes 2") and at `:79` ("1-2 short segments"). The answer-safety rules repeat at `:40-44` and `:50-52`. No conflict. | as cited | claim-for-review | Keep one statement per rule. |

---

## 2. Checked, no finding

- **Unmatched placeholders: none.** Each token in the three user prompts has a caller that fills it:
  - `procedural-skill-content/user.md` (ten tokens) is filled by `scene-generator.ts:1245-1256`.
  - `quiz-content/user.md` (seven tokens) is filled by `scene-generator.ts:867-875`.
  - `quiz-actions/user.md` (seven tokens) is filled by `scene-generator.ts:1694-1702`.
  - None of the three system prompts has a bare token.
  - `{{snippet:json-output-rules}}` (`quiz-content/system.md:5`) resolves to `packages/@openmaic/generation/snippets/json-output-rules.md` (Glob). The loader reads snippets from its prompts directory (`loader.ts:13, 31-39, 46-48`).
  - A token with no value stays literal (`loader.ts:101-107`), so a future missing token would reach the generation call unchanged. None exists today.
  - A test pins that `{{languageDirective}}` is filled (`packages/@openmaic/generation/test/procedural-skill-routing.test.ts:75`; read only, not run).
- **Quiz schema.** Types `single`, `multiple` and `short_answer` (`stage.ts:198`); options `{label, value}` (`stage.ts:191-194`); `answer` as option values (`stage.ts:201`); difficulty `easy`, `medium`, `hard` (`outline-types.ts:84`). The templates match.
- **Procedural fields.** Step fields `id`, `title`, `description`, `tools`, `successCriteria` (`procedural-skill-content/system.md:74-80`) match `ProceduralSkillStep` (`widgets.ts:183-189`). The procedure types match `outline-types.ts:42`.
- **Iframe message fields.** The sender posts a flat payload, `{type, ...payload}` (`components/scene-renderers/InteractiveIframeHost.tsx:254`). `SET_WIDGET_STATE` carries `state`; `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT` and `REVEAL_ELEMENT` carry `target` (`lib/action/engine.ts:873-899`). The listener in `procedural-skill-content/system.md:222-250` reads `event.data.type`, `.state` and `.target`, which matches.
- **Quiz opening output.** The output `{"type":"text","content":...}` is parsed as a speech action (`packages/@openmaic/generation/src/action-parser.ts:96-104`). The DSL's own speech type is `type: 'speech'` with `text` (`packages/@openmaic/dsl/src/action.ts:47-49`), so the template relies on the parser's mapping. [Verified: the parser maps it.]
- **Reply-language rule.** No template sentence sets a chat reply language. The templates take output language from `{{languageDirective}}`. [Inference: the chat rule and the directive cover different outputs, so there is no direct conflict.]
- **Links and vendor names.** No Markdown links or URLs in the six templates [Verified: Grep]. No model or vendor names in the six templates [Verified: Grep].

---

## 3. Summary

| Severity | Count | Rows |
|---|---|---|
| defect | 5 | `quiz-content/user.md` (example object); `procedural-skill-content/system.md` (`errorConsequences`; tools rule); `quiz-actions/system.md` (fenced example); `quiz-content/system.md` (fenced output) |
| claim-for-review | 8 | The other eight rows of Section 1 |

No template was edited. The `errorConsequences` row needs a decision on the config contract. The other four defects need text edits to the template, proposed in Section 1.

## 4. [Unverified] items

- [Unverified: whether the widget runtime reads `errorConsequences` from the embedded config (the `errorConsequences` row). Not traced.]
- [Unverified: whether generation output in practice copies the fenced examples or omits `analysis` and `points` (the example-object and fenced-example rows). Needs a sample generation, which was not run.]
- [Unverified: how often the empty-directive path occurs (the two language rows). The outline route supplies a default directive (`app/api/generate/scene-outlines-stream/route.ts:668`). Other callers were not enumerated.]
