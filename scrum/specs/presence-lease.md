# Presence lease for stage realms (B40)

Status: implemented in cycle 5. Code: `lib/media/stage-realm-presence.ts`. Tests: `tests/media/stage-realm-presence.test.ts` (16 cases) and `tests/media/prove-exclusive-ownership.test.ts` (7 cases, which mock the presence module). Together: 23 pass.

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

- Each realm with a stage open writes `maic-stage-lease:<encoded stage id>:<realm id>` to localStorage. The value is the expiry time in milliseconds.
- Renewal every **5 s** (`LEASE_RENEW_MS`). A lease lapses **90 s** after its last renewal (`LEASE_TTL_MS`). The window is set well above one minute because hidden tabs can have their timers throttled. Whether a browser aligns them to one-minute ticks is [Unverified]: it is recalled, not measured here.
- Every renewal also removes lapsed leases for every stage, so a crashed tab's key does not stay in the table. Only realms that renew do this; a closed app leaves at most the keys of its last tabs, which the next load sweeps.
- `pagehide` removes the realm's own lease at once, except when the page is stored in the back-forward cache (`persisted` is true). A cached page may come back, and its lease lapses on its own if it does not.
- Realm ids are random per module instance, so two tabs never share a key. A realm excludes its own lease, so a tab does not count itself as a peer. If removing its own lease fails, the key stays excluded from its own reads until it lapses.
- `probeStageRealmPresence`:
  1. A live lease from another realm answers `present` at once, with no wait.
  2. Otherwise the probe runs as before. A reply answers `present`.
  3. At the end of the window, the lease is read again. A lease that appeared meanwhile answers `present`. Otherwise `absent`, unless a storage read failed, in which case `unknown`.
- A storage API that throws answers `unknown` (fail closed, as the module already did for a missing channel).
- No storage API at all reads as `absent`. This applies only outside a browser, such as Node and the test environment. Browsers either provide `localStorage` or throw from it, and the throw is `unknown`. Making the no-API case `unknown` would send every test that reaches the asset path (34 files) down the fork path, and would not cover any browser case. Decision recorded in `scrum/DECISIONS-02.md`.

## What the change does not cover (residual risks)

1. **Crashed tab.** No `pagehide` runs, so its lease holds for up to 90 s. The outcome is `present`, which forks instead of mutating. Safe, but a cleanup can wait up to 90 s. [Inference]
2. **Frozen tab with unflushed edits.** A frozen tab cannot renew. After 90 s its lease lapses, and a peer may read it as absent while its edits are unflushed. The stage store flushes on `visibilitychange` to hidden and on `beforeunload` (`lib/store/stage.ts`), but that flush is best-effort: a failed save leaves the dirt in place. This risk is smaller than before, not zero. [Inference] Follow-up: B44.
3. **Refused write.** When the browser refuses the lease write (for example, a full quota), that realm's lease is missing. It is covered only by the probe window, as an old bundle is.
4. **Old bundles.** A tab still running a bundle from before this change has no lease. It is covered only by the probe window, so the 250 ms race remains for that tab until it reloads.
5. **Stage opened less than one renewal ago.** A new stage has no lease until the next renewal (up to 5 s). The probe covers that gap for a peer that replies in time.
6. **Back-forward cache.** A page in the cache keeps its lease for up to 90 s while frozen. A peer reads it as present until the lease lapses, which forks rather than mutates.
7. **Probe cost.** A stage with no peers still waits 250 ms per probe, as before. The lease does not shorten that wait, because the probe is still needed for old bundles. [Unverified: size of the cost for large collections]

## Verification

- Targeted: 23 pass. The presence file has 16 cases; `prove-exclusive-ownership` has 7 and mocks the presence module, so it tests the caller, not the lease.
- The presence file covers: a live lease answers present while the peer's reply is held; a lapsed lease with a held reply answers absent; renewal keeps a lease live for 180 s of fake time, and release removes it; a realm does not count its own lease; ids that share a prefix stay separate; pagehide removes the lease at once; the back-forward cache keeps it; a renewal removes a lapsed lease of another stage; a failed release does not make a realm count its own key; an unreadable storage API answers unknown.
- The raw-peer case uses a synchronous channel double, so the reply cannot miss the probe window. The held-reply cases release replies after the probe settles, so no test depends on timer order.
- The new behaviour cases were checked against the reasoning of the code, not by running them against the previous version. [Inference]
- [Unverified] Not run in a browser with two real tabs. The timing behaviour of hidden tabs has not been observed here.
