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
 * Absence needs both signals to be silent. The design and its residual risks are
 * in scrum/specs/presence-lease.md.
 */
const PRESENCE_CHANNEL = 'maic-stage-presence';
/** Reply window for the probe. Only a peer without a lease depends on it. */
const PROBE_TIMEOUT_MS = 250;
/** How often a realm renews its lease while a stage is open. */
const LEASE_RENEW_MS = 5_000;
/**
 * How long a lease stays live after its last renewal. Browsers align the timers of
 * hidden tabs to one-minute ticks after a few minutes, so this must sit well above
 * a minute. A crashed tab therefore holds its lease for up to this long.
 */
const LEASE_TTL_MS = 90_000;
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

let channel: BroadcastChannel | undefined;
let openStageId: (() => string | undefined) | undefined;
/** Resolves once binding has been attempted, so a probe never races the load-time bind. */
let binding: Promise<void> | undefined;
let bindingSettled: (() => void) | undefined;
/** Random per module instance, so two realms never share a lease key. */
let realmId: string | undefined;
let leaseTimer: ReturnType<typeof setInterval> | undefined;
let ownLeaseKey: string | undefined;

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
 * Whether another realm holds a live lease on this stage. Lapsed leases found on
 * the way are removed, so the table does not grow with closed tabs.
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
  let live = false;
  const lapsed: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix) || key === ownLeaseKey) continue;
      if (Number(storage.getItem(key)) > now) live = true;
      else lapsed.push(key);
    }
    for (const key of lapsed) storage.removeItem(key);
  } catch {
    return 'unknown';
  }
  return live ? 'present' : 'absent';
}

/** Writes this realm's lease for the stage it has open, and moves it when that stage changes. */
function renewLease(): void {
  if (!realmId) return;
  const stageId = openStageId?.();
  const nextKey = stageId ? leaseKey(stageId, realmId) : undefined;
  try {
    const storage = browserStorage();
    if (ownLeaseKey && ownLeaseKey !== nextKey) storage?.removeItem(ownLeaseKey);
    ownLeaseKey = nextKey;
    if (nextKey) storage?.setItem(nextKey, String(Date.now() + LEASE_TTL_MS));
  } catch {
    // A refused write leaves peers to the probe. This realm's own answer is unchanged.
  }
}

function releaseLease(): void {
  const key = ownLeaseKey;
  ownLeaseKey = undefined;
  if (!key) return;
  try {
    browserStorage()?.removeItem(key);
  } catch {
    // Nothing else to clean up: the lease lapses on its own.
  }
}

function startLease(): void {
  if (leaseTimer !== undefined) return;
  realmId ??= `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  renewLease();
  leaseTimer = setInterval(renewLease, LEASE_RENEW_MS);
  // Leaving the page removes the lease at once instead of waiting for it to lapse.
  if (typeof addEventListener === 'function') addEventListener('pagehide', releaseLease);
}

/** Test seam: drops the channel and the lease so a suite can model separate realms. */
export function __resetStageRealmPresenceForTesting(): void {
  channel?.close();
  channel = undefined;
  openStageId = undefined;
  if (leaseTimer !== undefined) clearInterval(leaseTimer);
  leaseTimer = undefined;
  releaseLease();
  realmId = undefined;
}
