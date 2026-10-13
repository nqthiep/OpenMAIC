# Decision record: cycle 7

Date: 2026-10-13. Branch: `it-math`.
Inputs: the cycle 6 backlog (`scrum/BACKLOG.md`, "Backlog status after cycle 6"), `plans/access-control.md` §9 (the unfinished access-control work), and `scrum/specs/claim-anonymous-data.md` (read before building P4.4).

## Process

1. The coordinator set the sprint from the backlog: B47 (body caps), B52 (raw error logs), B48 (adapter vendor text), B49 (non-model wording), B51 (redaction suffixes), B53 (entry-tree retention), B50 (timing-sensitive tests), P4.4 (anonymous claim), server-error i18n, and B26 (watch).
2. Each code item was built sequentially with tests, then committed; `HANDOFF.md` records one task row each, with verification evidence.
3. Items needing the owner's or an expert's call were not decided by the agent; they are recorded below as decisions or recommendations.

## Rulings

### D-32 Anonymous data merges into the account on sign-in/register (P4.4, B2) — **Done (5838ad26)**

- New `lib/server/accounts/claim.ts`: `claimAnonymousOwnerData` moves every row the anonymous owner holds — stages plus `stage_meta` (both owner columns together), folders, agent sessions (children follow via `session_id`), owner events renumbered onto the target's sequence, skills, library materials — to `acct:<id>` in one transaction.
- Conflict rules, as proposed: **on an id collision the account's row wins** and the anonymous duplicate stays untouched under the abandoned source; **on a unique-name collision the anonymous folder/skill is renamed with a numeric suffix** (`Unit 1 (2)`, `my-quiz-2`), never merged and never skipped; a skill that cannot be renamed inside the name rules stays behind.
- A queued or running session blocks the whole claim (`SESSIONS_ACTIVE`): a running session's writes are bound to the source owner. Nothing moves and the anonymous cookie stays.
- The login and register routes run the claim after issuing the session and clear the `anonymous_id` cookie only when the claim actually ran. A failed claim never fails the sign-in; the next sign-in retries.
- Deliberately smaller than `scrum/specs/claim-anonymous-data.md`: no claim tables, no tombstones, no preview UI, no reversal procedure. The spec's full design assumed anonymous content creation at scale; anonymous visitors can no longer spend, so the claim is a one-shot move of legacy rows. The spec stays as the reference if the product ever needs preview/consent/reversal.
- Residual: device learner runtime data is never moved (spec §6); the shared-browser consent question (spec §14.1) is unchanged.

### D-33 B30: required `ACCESS_COOKIE_SECRET` — **Decision needed from the owner**

- The opt-in secret exists and is tested (`tests/server/access-cookie-secret.test.ts`). Making it required is a breaking change for existing deployments: any deployment that has not set it would sign users out on upgrade.
- Recommendation: name a dated release (e.g. "required from release 2026-11-01"), announce it in the changelog one release ahead, and on the cutover refuse to boot with a clear error instead of silently falling back to the code-keyed default. The owner names the date.

### D-34 B8: render-job ownership — **Still deferred, conditions restated**

- D-29's blockers stand: the render service is an external image whose job-id scheme is not in this repository `[Unverified]`; ownership needs a shared job store; and signed-out submits need a product decision (tie to an owner at submit time, or refuse them).
- Reopen when: the render service is brought in-repo or its job-id scheme is documented, and the product decides what a signed-out submit may do. Until then any gated caller who learns a job id can poll or cancel it.

### D-35 B1: capability-based reads — **Options for the owner**

- Reads are capability-based by design (21-char nanoid ids, shared links). The isolation goal conflicts with it. Options, unchanged from the backlog: (a) keep capability reads; (b) owner-or-published reads; (c) expiring share tokens. Recommendation: (b) — published courses stay link-readable, unpublished ones require the owner — because it preserves sharing while closing the leak. The owner chooses.

### D-36 B3: retire the dev bearer token — **Recommended**

- `PERSISTENCE_DEV_TOKEN` / `x-learner-key` still serve signed-out runtime requests in development. Recommendation: retire once accounts are the expected path — refuse `acct:`-less bearer keys in production unless `PERSISTENCE_ALLOW_INSECURE_DEV_AUTH` is set (already the behaviour), and remove the dev token path entirely in the release after the dated B30 cutover. No code change this cycle.

### D-37 P4.5: payment providers — **Owner to choose; not implemented**

- Candidates for Vietnam, in the order the agent would evaluate them:
  1. **Stripe** — cards and international payments, clean webhooks and test mode; weak local coverage (no domestic bank transfer, no e-wallet).
  2. **VNPay** — domestic cards, bank transfer and QR, the standard for Vietnamese checkout; paperwork-heavy onboarding, sandbox quirks.
  3. **MoMo** — the dominant e-wallet; good for small-ticket memberships; narrower dispute tooling.
- Recommendation: start with VNPay for domestic memberships (the membership product is VND-priced), add Stripe later for international cards. Nothing is implemented until the owner picks a provider and completes onboarding; the membership/quota/audit plumbing from access-control is provider-agnostic and ready to attach webhooks to.

### D-38 B13/B35/B36/B17: human review — **Not code work**

- **B13**: the eleven machine-drafted `account` translations still need a native speaker's pass (`lib/i18n/locales/*.json`). This cycle added no new user-facing keys (the new `SKILL_BUILTIN_DELETE` code reuses the generic error path), so the translation surface did not grow.
- **B35/B36**: content review (15 open defects, 23 flagged claims) and the template mechanical pass need subject-matter reviewers; recorded in `scrum/reviews/content-phase1.md` and `scrum/reviews/templates-phase1.md`.
- **B17**: educational content review (accuracy, objectives, examples, feedback) has not started and needs a domain expert.
- None of these can be closed by the agent; they are listed here so they are not mistaken for done.

## Items that changed status

| Item | Status after cycle 7 | Where |
|---|---|---|
| B2 | Done (small scope) | D-32 |
| P4.4 | Done | D-32 |
| B8 | Still deferred; reopen conditions restated | D-34 |
| B30 | Decision needed: owner names the dated release | D-33 |
| B1 | Options restated; recommendation (b) | D-35 |
| B3 | Recommended retirement path | D-36 |
| P4.5 | Owner to choose; not implemented | D-37 |
| B13/B35/B36/B17 | Need human reviewers; not code work | D-38 |
