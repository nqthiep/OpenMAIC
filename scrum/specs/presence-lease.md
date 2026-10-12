# Presence lease for stage realms (B40, B44)

Status: implemented in cycle 5 (B40) and cycle 6 (the dirty window, B44). Code: `lib/media/stage-realm-presence.ts`, `lib/store/stage.ts`. Tests: `tests/media/stage-realm-presence.test.ts` (21 cases), `tests/media/prove-exclusive-ownership.test.ts` (7 cases, which mock the presence module), and `tests/store/stage-realm-dirty-marks.test.ts` (4 cases).

## Problem

`proveExclusiveAssetOwnership` (`lib/media/collect-stage-asset-refs.ts`) allows an in-place replacement of a globally keyed asset only when no other realm has the stage open. The only signal was a BroadcastChannel probe with a timed reply window. Silence within the window meant `absent`, and `absent` allowed the global mutation.

A live peer whose event loop is busy for longer than the window reads as absent. Cycle 4 saw this at 60 ms under full-suite load and widened the window to 250 ms. A wider window reduces the chance and does not remove it. [Measured: cycle 4 full run, one false absent at 82 ms; the window was then widened.]

## Options considered

| Option | Result |
|---|---|
| Keep the timed probe, widen the window | Reduces the risk. Still a race, and every probe waits the full window. Done in cycle 4. |
| Per-run cached answer | Cuts the number of waits. Does not remove a false absent. Rejected. |
| Treat silence as `unknown` (fail closed) | A stage nobody holds can then never be proven absent, so global cleanup stops. Rejected: it turns a race into a storage leak. |
| **Lease in localStorage, renewed on a timer, plus the probe** | Chosen. A lease is state, so a busy peer still reads as present. The probe still covers peers that have no lease. |

## Design

- Each realm with a stage open writes `maic-stage-lease:<encoded stage id>:<realm id>` to localStorage. The value is JSON: `{ "expiresAt": <ms>, "dirtyUntil": <ms> }`. `dirtyUntil` is present only while the realm has unflushed edits for that stage. A bare number, the format before cycle 6, is still read as a normal expiry.
- Renewal every **5 s** (`LEASE_RENEW_MS`). A lease lapses **90 s** after its last renewal (`LEASE_TTL_MS`). The window is set well above one minute because hidden tabs can have their timers throttled. Whether a browser aligns them to one-minute ticks is [Unverified]: it is recalled, not measured here.
- **Dirty window (cycle 6).** The stage store marks the realm dirty when a change is recorded (`markStageRealmDirty`) and clean when the pending changes are saved or discarded (`markStageRealmClean`). While dirty, the lease stays live for **10 min** (`DIRTY_WINDOW_MS`) after the last edit, even if the tab freezes and cannot renew. Edits within 5 s share one storage write (`DIRTY_WRITE_MS`).
- Every renewal also removes lapsed leases for every stage, so a crashed tab's key does not stay in the table. Only realms that renew do this; a closed app leaves at most the keys of its last tabs, which the next load sweeps.
- `pagehide` removes the realm's own lease at once, except when the page is stored in the back-forward cache (`persisted` is true) or has unflushed edits. A cached page may come back, and its lease lapses on its own if it does not. A page with unflushed edits keeps its lease until the dirty window ends.
- Realm ids are random per module instance, so two tabs never share a key. A realm excludes its own lease, so a tab does not count itself as a peer. If removing its own lease fails, the key stays excluded from its own reads until it lapses.
- `probeStageRealmPresence`:
  1. A live lease from another realm answers `present` at once, with no wait. Live means `expiresAt` or `dirtyUntil` is still in the future.
  2. Otherwise the probe runs as before. A reply answers `present`.
  3. At the end of the window, the lease is read again. A lease that appeared meanwhile answers `present`. Otherwise `absent`, unless a storage read failed, in which case `unknown`.
- A storage API that throws answers `unknown` (fail closed, as the module already did for a missing channel).
- No storage API at all reads as `absent`. This applies only outside a browser, such as Node and the test environment. Browsers either provide `localStorage` or throw from it, and the throw is `unknown`. Making the no-API case `unknown` would send every test that reaches the asset path (34 files) down the fork path, and would not cover any browser case. Decision recorded in `scrum/DECISIONS-02.md`.

## What the change does not cover (residual risks)

1. **Crashed tab.** No `pagehide` runs, so its lease holds for up to 90 s, or up to 10 min if it had unflushed edits. The outcome is `present`, which forks instead of mutating. Safe, but a cleanup can wait that long. [Inference]
2. **Frozen tab with unflushed edits, longer than the dirty window.** The dirty window protects a frozen tab for 10 min after its last edit. A tab frozen for longer, with a save still pending, reads as absent once that window ends, so a peer may mutate a global asset that the pending save still references. The stage store flushes on `visibilitychange` to hidden and on `beforeunload` (`lib/store/stage.ts`), which narrows the window in the common case, but that flush is best-effort. The residual is smaller than before cycle 6, not zero. [Inference]
3. **Refused write.** When the browser refuses the lease write (for example, a full quota), that realm's lease is missing. It is covered only by the probe window, as an old bundle is. [Unverified: how often quota refusals occur on real devices]
4. **Old bundles.** A tab still running a bundle from before this change has no lease. It is covered only by the probe window, so the 250 ms race remains for that tab until it reloads.
5. **Stage opened less than one renewal ago.** A new stage has no lease until the next renewal (up to 5 s). The probe covers that gap for a peer that replies in time.
6. **Back-forward cache.** A page in the cache keeps its lease for up to 90 s while frozen. A peer reads it as present until the lease lapses, which forks rather than mutates.
7. **Stage switch.** When the open stage changes, the realm's lease moves to the new stage at once. Edits still flushing for the previous stage are not protected by a lease after the switch. The flush runs at switch time, not in a frozen window. [Inference]
8. **Probe cost.** A stage with no peers still waits 250 ms per probe, as before. The lease does not shorten that wait, because the probe is still needed for old bundles. [Unverified: size of the cost for large collections]

## Verification

- Presence file: 21 cases. Includes the cycle-6 cases: a dirty stage stays present past the 90 s window and absent after the 10 min window; a clean mark returns the stage to the normal window; a page that leaves with unflushed edits keeps its lease; a lease in the older bare-number format is read; a dirty mark for one stage does not protect another.
- Store file: 4 cases. Marks dirty on a recorded change; marks clean after a successful save; stays dirty while the save keeps failing; marks clean when a deleted stage's changes are discarded. These check the store's calls to the presence module with a spy, not the lease.
- `prove-exclusive-ownership` has 7 cases and mocks the presence module, so it tests the caller, not the lease.
- The raw-peer case uses a synchronous channel double, so the reply cannot miss the probe window. The held-reply cases release replies after the probe settles, so no test depends on timer order.
- The new behaviour cases were checked against the reasoning of the code, not by running them against the previous version. [Inference]
- [Unverified] Not run in a browser with two real tabs. The timing behaviour of hidden tabs has not been observed here.
