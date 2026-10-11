# Presence lease for stage realms (B40)

Status: implemented in cycle 5. Code: `lib/media/stage-realm-presence.ts`. Tests: `tests/media/stage-realm-presence.test.ts` (20 cases with `prove-exclusive-ownership`).

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
- Renewal every **5 s** (`LEASE_RENEW_MS`). A lease lapses **90 s** after its last renewal (`LEASE_TTL_MS`). The window is well above one minute because browsers align the timers of hidden tabs to one-minute ticks after a few minutes. [Unverified: this browser behaviour is recalled, not measured here.]
- `pagehide` removes the realm's own lease at once. Hidden tabs keep their lease, because they can return.
- Realm ids are random per module instance, so two tabs never share a key. A realm excludes its own lease, so a tab does not count itself as a peer.
- `probeStageRealmPresence`:
  1. A live lease from another realm answers `present` at once, with no wait.
  2. Otherwise the probe runs as before. A reply answers `present`.
  3. At the end of the window, the lease is read again. A lease that appeared meanwhile answers `present`. Otherwise `absent`, unless a storage read failed, in which case `unknown`.
- A storage API that throws answers `unknown` (fail closed, as the module already did for a missing channel). No storage API at all (Node, the test environment) reads as `absent`, so environments without one keep the probe-only answer.
- Lapsed leases found during a read are removed, so the table does not grow with closed tabs.

## What the change does not cover (residual risks)

1. **Crashed tab.** No `pagehide` runs, so its lease holds for up to 90 s. The outcome is `present`, which forks instead of mutating. Safe, but a cleanup can wait up to 90 s. [Inference]
2. **Frozen tab with unflushed edits.** A frozen tab cannot renew. After 90 s its lease lapses, and a peer may read it as absent while its edits are unflushed. The stage store flushes on `visibilitychange` to hidden and on `beforeunload` (`lib/store/stage.ts`), but that flush is best-effort: a failed save leaves the dirt in place. This risk is smaller than before, not zero. [Inference] Follow-up: B44.
3. **Old bundles.** A tab still running a bundle from before this change has no lease. It is covered only by the probe window, so the 250 ms race remains for that tab until it reloads.
4. **Stage opened less than one renewal ago.** A new stage has no lease until the next renewal (up to 5 s). The probe covers that gap for a peer that replies in time.
5. **Probe cost.** A stage with no peers still waits 250 ms per probe, as before. The lease does not shorten that wait, because the probe is still needed for old bundles. [Unverified: size of the cost for large collections]

## Verification

- Targeted tests: 20 pass (presence, exclusive ownership). The new cases: a live lease answers present while the reply is 400 ms late; a lapsed lease with a late reply answers absent; renewal keeps a lease live for 180 s of fake time and release removes it; a realm does not count its own lease; ids that share a prefix stay separate; pagehide removes the lease at once; an unreadable storage API answers unknown.
- [Unverified] Not run in a browser with two real tabs. The timing behaviour of hidden tabs has not been observed here.
