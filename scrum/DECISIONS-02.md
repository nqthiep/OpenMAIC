# Decision record: cycle 5 (team meeting 02)

Date: 2026-10-11. Branch: `claude/hopeful-sagan-267tw5`.
Inputs: the cycle 4 backlog (`scrum/BACKLOG.md`), the cycle 4 review (`scrum/reviews/cycle4-review.md`), two independent read-only reviews run in this cycle (presence lease, log hygiene; recorded in `scrum/reviews/cycle5-review.md`), and the implementation reports of two workers that each owned a fixed set of files.

## Process

1. The coordinator set the sprint from the backlog: B40 (High) first, then the items that were ready to build and did not need a product owner's date or a human reviewer.
2. Two workers built in parallel with disjoint file ownership: B33 (metadata routes) and B37 (administrator panel). Each reported the checks it ran. The coordinator re-ran the targeted suites before committing.
3. Two read-only reviewers checked the B40 change and the log-hygiene question. Their findings are dispositioned below. A finding is adopted when the reviewer's evidence holds on the code; a finding is rejected only with a reason written in the record.
4. Status key as in meeting 01. Facts that were run are labelled `[Measured: how]`; facts read from code are `[Verified: file:line]`; the rest is `[Inference]` or `[Unverified]`.

## Rulings

### D-19 Presence between realms (B40): lease plus probe — **Done (c2ff226, 6f791c0); residuals in the spec**
- A live lease from another realm answers present at once. The timed probe stays for tabs that predate leases. Absence needs both signals to be silent.
- Renewal every 5 s; lapse 90 s after the last renewal. The 90 s figure is set above one minute because hidden tabs can have their timers throttled; that throttling is not measured here.
- Adopted from review: no release on a page kept in the back-forward cache; release order fixed; every renewal sweeps lapsed leases for all stages.
- Rejected from review (finding 5): a missing storage API should read as `unknown`. Reason: only Node reaches that case; a browser either has `localStorage` or throws from it, and a throw is already `unknown`. Making the missing-API case `unknown` would send 34 test files down the fork path and cover no browser case.
- Follow-up: B44 (flush pending saves before a frozen tab can be left with edits).

### D-20 Administrator account panel (B37): minimal — **Done (a91280b)**
- Built: the account list, with disable and enable each behind a confirmation dialog. Escape cancels; focus returns to the control that opened the dialog. The administrator's own row has no control; the server refuses a self-disable.
- Not built, by scope: delete, password reset, a reason field, success toasts.
- The session response now carries `administrator`, true only for the signed-in account listed in `ADMIN_USERNAMES`. Without it, a signed-in non-administrator made one list request before the 403 hid the panel. The list route still decides; the flag only avoids the request.
- Open: rendering at 360 px in a browser `[Unverified]`. The component uses no fixed widths, but it has not been rendered.

### D-21 Body caps on state-writing routes (B33, part 2): six handlers — **Done (3515545); rest open**
- Six metadata handlers under `app/api/folders/**` and `app/api/agent/sessions/**` read their body through `readBoundedJson` with a 1 MiB cap. An oversized body answers 413 with the route's existing code.
- The cap is an inference `[Inference]`, from the largest legitimate body the code can send (about 0.3 MB of UTF-8, under 0.8 MB with worst-case escaping). It is not a measured limit.
- Not done: the stage, chat, generate, generate-classroom and pbl routes. Their caps need measured request sizes first (B47).

### D-22 Deep-research search count (B42): guidance, not enforcement — **Done (c2fb062)**
- The skill said "at most 8 web_search calls". The tool keeps no counter, so the limit was text only. It is now stated as a guideline the model keeps itself, and the fact-check skill refers to it in the same terms.
- Enforcement needs a session counter and changes behaviour, so it is a separate decision. It is not made here.

### D-23 Log hygiene and keys (B43): policy and first fixes — **Partly done; open items B45 and B46**
- Policy: server logs must not carry key material, including fragments. A visitor's body that fails to parse can echo part of a key, so body-parse failures and operator configuration errors are logged as `describeUnexpectedError` output (name, plain code, first stack frame, no message).
- Policy: with the operator's key, upstream text never reaches a visitor (`lib/server/resolve-model.ts`, `ResolvedModel.managedKey`). The review found six routes that broke this: the chat stream forwarded every event unchanged, the chat pi route, image and video generation, and both verify routes sent provider text to visitors. All six are fixed with the fixed text (`MODEL_FAILURE_TEXT` or `CONTENT_BLOCKED_TEXT`). Verify-video had the same pattern and is fixed with them.
- Fixed log sites: the YAML loader, which logged source lines that can contain the operator's key (`lib/server/provider-config.ts`); seven body-parse sites.
- Correction: cycle 4 recorded that "operator-key failure paths are covered". That was wrong. Only four provider sites use `describeUnexpectedError`. The rest of the provider error logs (about 27 sites) log the raw error object. Whether the upstream text can echo a key is `[Unverified]`; the SDK's error object does not store request headers `[Verified: node_modules/@ai-sdk/provider]`. Recorded as B45.
- Visitor content in logs (prompts, model output) is a privacy question, not a key question. Recorded as B46; not decided here.

### D-24 Usage chart lifecycle (B41): fixed — **Done (0d5be8e)**
- An instance bound to a removed container is disposed, and a new one is created for the current container. The decision lives in `chartInstanceFor`, which is tested without mounting the dashboard.

## Items that changed status

| Item | Status after cycle 5 | Where |
|---|---|---|
| B33 | Part done: six metadata handlers. Rest open (B47) | D-21 |
| B37 | Done, with the 360 px check open | D-20 |
| B40 | Done; residuals in the spec; B44 | D-19 |
| B41 | Done | D-24 |
| B42 | Done as guidance; enforcement not decided | D-22 |
| B43 | Partly done; B45 and B46 open; correction recorded | D-23 |

## Open questions (none answered by the repository)

- Enforce the eight-search limit in the tool, or keep it as guidance? Decided as guidance for now (D-22); the cost owner may overrule.
- Retention and redaction for visitor content in logs (B46). Needs a product and privacy decision.
- Whether any production deployment runs with a provider upstream that echoes keys (B45). Needs a log sample from a real deployment, which this environment cannot provide.

## Dissent summary

- No dissent was recorded against the rulings above in this cycle. Two review findings were rejected (D-19), with reasons in the record.
