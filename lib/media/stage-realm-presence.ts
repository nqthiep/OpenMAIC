/**
 * Detects whether another browsing realm currently has a stage open.
 *
 * A peer's unflushed edits cannot be observed: its Zustand aggregate lives in a
 * different realm and leaves no persisted trace during its save debounce. So
 * rather than trying to read that state, writers that would mutate a globally
 * keyed asset ask whether anyone else is editing at all, and fall back to
 * allocating a fresh id when the answer is yes or unknown.
 *
 * Two signals answer the question. Each realm with a stage open keeps a lease in
 * localStorage and renews it on a timer. A lease is state, not a reply, so a peer
 * whose event loop is busy still reads as present. A probe over BroadcastChannel
 * covers peers without a lease, such as a tab still running an older bundle.
 * Absence needs both signals to be silent. A realm with unflushed edits keeps its
 * lease live for a longer window (see markStageRealmDirty). The design and its
 * residual risks are in scrum/specs/presence-lease.md.
 */
const PRESENCE_CHANNEL = 'maic-stage-presence';
/** Reply window for the probe. Only a peer without a lease depends on it. */
const PROBE_TIMEOUT_MS = 250;
/** How often a realm renews its lease while a stage is open. */
const LEASE_RENEW_MS = 5_000;
/**
 * How long a lease stays live after its last renewal. Hidden tabs can have their
 * timers throttled, and a browser may align them to one-minute ticks after a few
 * minutes. That is not measured here, so the window sits well above a minute. A
 * crashed tab holds its lease for up to this long.
 */
const LEASE_TTL_MS = 90_000;
/**
 * How long unflushed edits keep a lease live after the last edit. A frozen tab cannot
 * renew its lease, so without this window a pending save would be invisible to peers
 * once LEASE_TTL_MS passed. Ten minutes covers a tab that freezes and thaws, and a save
 * that fails and retries. Past this window the residual risk remains.
 */
const DIRTY_WINDOW_MS = 10 * 60_000;
/** Edits within this span share one lease write, so typing does not write storage on every change. */
const DIRTY_WRITE_MS = 5_000;
const LEASE_PREFIX = 'maic-stage-lease:';

type PresenceMessage =
  | { readonly kind: 'probe'; readonly stageId: string; readonly probeId: string }
  | { readonly kind: 'present'; readonly stageId: string; readonly probeId: string };

/**
 * `absent` needs a storage API that answered. `unknown` means the API threw. No
 * storage API at all reads as `absent`, which keeps environments without one on the
 * probe-only answer.
 */
type LeaseReading = 'present' | 'absent' | 'unknown';

/** A stored lease: its normal expiry, and the end of its dirty window when the realm has unflushed edits. */
interface LeaseRecord {
  readonly expiresAt: number;
  readonly dirtyUntil: number;
}

const NO_LEASE: LeaseRecord = { expiresAt: 0, dirtyUntil: 0 };

let channel: BroadcastChannel | undefined;
let openStageId: (() => string | undefined) | undefined;
/** Resolves once binding has been attempted, so a probe never races the load-time bind. */
let binding: Promise<void> | undefined;
let bindingSettled: (() => void) | undefined;
/** Random per module instance, so two realms never share a lease key. */
let realmId: string | undefined;
let leaseTimer: ReturnType<typeof setInterval> | undefined;
let ownLeaseKey: string | undefined;
/** The stage whose edits are unflushed, and the end of the window that protects them. */
let dirtyStageId: string | undefined;
let dirtyUntil = 0;

/**
 * Declares that binding is about to be attempted. The pool binds asynchronously
 * at module load, so without this a probe issued in that window would see no
 * channel and report `unknown` even though presence works moments later.
 */
export function expectStageRealmPresenceBinding(): void {
  if (binding) return;
  binding = new Promise<void>((resolve) => {
    bindingSettled = resolve;
  });
}

/** Opens the gate when binding will never happen, so probes fall through to `unknown`. */
export function releaseStageRealmPresenceBinding(): void {
  bindingSettled?.();
  bindingSettled = undefined;
}

/**
 * Announces which stage this realm has open, so peers probing for owners get an
 * answer. Called once where the stage store is available.
 */
export function bindStageRealmPresence(currentStageId: () => string | undefined): void {
  openStageId = currentStageId;
  bindingSettled?.();
  bindingSettled = undefined;
  startLease();
  if (channel || typeof BroadcastChannel !== 'function') return;
  try {
    channel = new BroadcastChannel(PRESENCE_CHANNEL);
    channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
      const message = event.data;
      if (!message || message.kind !== 'probe') return;
      if (openStageId?.() !== message.stageId) return;
      channel?.postMessage({
        kind: 'present',
        stageId: message.stageId,
        probeId: message.probeId,
      } satisfies PresenceMessage);
    };
  } catch {
    channel = undefined;
  }
}

/**
 * Records unflushed edits for a stage. Its lease then stays live for DIRTY_WINDOW_MS
 * after the last edit, so a peer does not read the stage as absent while the save is
 * pending, even if this tab freezes before the save runs.
 */
export function markStageRealmDirty(stageId: string): void {
  const now = Date.now();
  if (dirtyStageId === stageId && dirtyUntil - now > DIRTY_WINDOW_MS - DIRTY_WRITE_MS) return;
  dirtyStageId = stageId;
  dirtyUntil = now + DIRTY_WINDOW_MS;
  renewLease();
}

/** Records that this realm's edits for a stage are saved. The lease returns to its normal window. */
export function markStageRealmClean(stageId: string): void {
  if (dirtyStageId !== stageId) return;
  dirtyStageId = undefined;
  dirtyUntil = 0;
  renewLease();
}

/**
 * Outcome of a presence probe. `unknown` is distinct from `absent` on purpose:
 * a question we could not ask must never be read as "nobody else is editing",
 * and keeping it in the type stops a caller from collapsing the two.
 */
export type StageRealmPresence = 'present' | 'absent' | 'unknown';

/**
 * Ask whether another realm has this stage open.
 *
 * A live lease from another realm answers at once. Otherwise the probe runs and
 * reports `absent` only when its window passes with no reply and no lease appears.
 *
 * Returns `unknown` whenever the answer cannot be proven: no `BroadcastChannel` in
 * this environment, binding not completed yet (the pool binds asynchronously at
 * load), a channel constructor that threw, a send that failed, or a storage API
 * that threw. Callers must treat `unknown` the way they treat `present`.
 */
export async function probeStageRealmPresence(stageId: string): Promise<StageRealmPresence> {
  const leased = leaseReading(stageId);
  if (leased === 'present') return 'present';
  if (typeof BroadcastChannel !== 'function') return 'unknown';
  if (binding) await binding;
  if (!channel) return 'unknown';
  const probe = channel;
  const probeId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<StageRealmPresence>((resolve) => {
    let settled = false;
    const finish = (presence: StageRealmPresence) => {
      if (settled) return;
      settled = true;
      probe.removeEventListener('message', listener);
      clearTimeout(timer);
      resolve(presence);
    };
    const listener = (event: MessageEvent<PresenceMessage>) => {
      const message = event.data;
      if (message?.kind === 'present' && message.probeId === probeId) finish('present');
    };
    // Silence is `absent` only if no lease appeared while we waited.
    const timer = setTimeout(() => finish(silentOutcome(stageId, leased)), PROBE_TIMEOUT_MS);
    try {
      probe.addEventListener('message', listener);
      probe.postMessage({ kind: 'probe', stageId, probeId } satisfies PresenceMessage);
    } catch {
      finish('unknown');
    }
  });
}

function silentOutcome(stageId: string, earlier: LeaseReading): StageRealmPresence {
  const later = leaseReading(stageId);
  if (later === 'present') return 'present';
  return earlier === 'unknown' || later === 'unknown' ? 'unknown' : 'absent';
}

function leaseKey(stageId: string, realm: string): string {
  return `${LEASE_PREFIX}${encodeURIComponent(stageId)}:${realm}`;
}

function browserStorage(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage;
}

/**
 * Reads a stored lease. A bare number is the format written before the dirty window
 * existed, and is still read as a normal expiry.
 */
function parseLease(raw: string | null): LeaseRecord {
  if (raw === null) return NO_LEASE;
  if (/^\d+$/.test(raw)) return { expiresAt: Number(raw), dirtyUntil: 0 };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return NO_LEASE;
    const { expiresAt, dirtyUntil: dirty } = parsed as Record<string, unknown>;
    return { expiresAt: Number(expiresAt) || 0, dirtyUntil: Number(dirty) || 0 };
  } catch {
    return NO_LEASE;
  }
}

function leaseLive(record: LeaseRecord, now: number): boolean {
  return record.expiresAt > now || record.dirtyUntil > now;
}

/**
 * Whether another realm holds a live lease on this stage. Lapsed leases are not
 * removed here: every renewal sweeps them, so the table does not grow with closed tabs.
 */
function leaseReading(stageId: string): LeaseReading {
  let storage: Storage | undefined;
  try {
    storage = browserStorage();
  } catch {
    return 'unknown';
  }
  if (!storage) return 'absent';
  const prefix = `${LEASE_PREFIX}${encodeURIComponent(stageId)}:`;
  const now = Date.now();
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (
        key?.startsWith(prefix) &&
        key !== ownLeaseKey &&
        leaseLive(parseLease(storage.getItem(key)), now)
      ) {
        return 'present';
      }
    }
  } catch {
    return 'unknown';
  }
  return 'absent';
}

/** This realm's record for the stage it has open. The dirty window applies only while that stage has unflushed edits. */
function leaseFor(stageId: string, now: number): LeaseRecord {
  const dirty = dirtyStageId === stageId && dirtyUntil > now;
  return { expiresAt: now + LEASE_TTL_MS, dirtyUntil: dirty ? dirtyUntil : 0 };
}

/** Writes this realm's lease for the stage it has open, and moves it when that stage changes. */
function renewLease(): void {
  if (!realmId) return;
  try {
    // The stage getter runs inside the store's own edit path, so a failure here must not escape.
    const stageId = openStageId?.();
    const nextKey = stageId ? leaseKey(stageId, realmId) : undefined;
    const storage = browserStorage();
    if (ownLeaseKey && ownLeaseKey !== nextKey) storage?.removeItem(ownLeaseKey);
    ownLeaseKey = nextKey;
    const now = Date.now();
    if (stageId && nextKey) storage?.setItem(nextKey, JSON.stringify(leaseFor(stageId, now)));
    if (storage) removeLapsedLeases(storage, now);
  } catch {
    // A refused write, or a failed read of the open stage, leaves peers to the probe.
    // This realm's own answer is unchanged, and the edit that triggered the renewal proceeds.
  }
}

/** Removes every lapsed lease, whichever stage it names, so a crashed tab's key does not stay. */
function removeLapsedLeases(storage: Storage, now: number): void {
  const lapsed: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      key?.startsWith(LEASE_PREFIX) &&
      key !== ownLeaseKey &&
      !leaseLive(parseLease(storage.getItem(key)), now)
    ) {
      lapsed.push(key);
    }
  }
  for (const key of lapsed) storage.removeItem(key);
}

function releaseLease(): void {
  const key = ownLeaseKey;
  if (!key) return;
  try {
    browserStorage()?.removeItem(key);
    ownLeaseKey = undefined;
  } catch {
    // The key stays excluded from this realm's own reads until its window lapses.
  }
}

function startLease(): void {
  if (leaseTimer !== undefined) return;
  realmId ??= `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  renewLease();
  leaseTimer = setInterval(renewLease, LEASE_RENEW_MS);
  // Leaving the page removes the lease at once. A page kept in the back-forward cache keeps
  // its lease: it may come back, and the lease lapses on its own if it does not. A page with
  // unflushed edits keeps its lease until the dirty window ends.
  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', (event?: PageTransitionEvent) => {
      if (!event?.persisted && dirtyUntil <= Date.now()) releaseLease();
    });
  }
}

/** Test seam: drops the channel, the lease and the dirty state so a suite can model separate realms. */
export function __resetStageRealmPresenceForTesting(): void {
  channel?.close();
  channel = undefined;
  openStageId = undefined;
  if (leaseTimer !== undefined) clearInterval(leaseTimer);
  leaseTimer = undefined;
  releaseLease();
  realmId = undefined;
  dirtyStageId = undefined;
  dirtyUntil = 0;
}
