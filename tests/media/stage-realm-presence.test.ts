import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStageRealmPresenceForTesting,
  bindStageRealmPresence,
  probeStageRealmPresence,
} from '@/lib/media/stage-realm-presence';

type PresenceModule = typeof import('@/lib/media/stage-realm-presence');
type PagehideListener = (event?: PageTransitionEvent) => void;

/**
 * A test double for BroadcastChannel that delivers each message synchronously to the
 * other channels of the same name. A reply then lands before the probe's timer can run,
 * so the test does not depend on event-loop timing.
 */
class SyncBroadcastChannel {
  private static readonly channels = new Map<string, Set<SyncBroadcastChannel>>();
  private readonly listeners = new Set<(event: MessageEvent) => void>();
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(private readonly name: string) {
    const peers = SyncBroadcastChannel.channels.get(name) ?? new Set<SyncBroadcastChannel>();
    peers.add(this);
    SyncBroadcastChannel.channels.set(name, peers);
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown): void {
    for (const peer of SyncBroadcastChannel.channels.get(this.name) ?? []) {
      if (peer !== this) peer.deliver({ data } as MessageEvent);
    }
  }

  close(): void {
    SyncBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  private deliver(event: MessageEvent): void {
    this.onmessage?.(event);
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** A peer realm is modelled with its own channel: it answers presence probes the way a second tab's bound module would. */
function peerHoldingStage(stageId: string): BroadcastChannel {
  const peer = new BroadcastChannel('maic-stage-presence');
  peer.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message?.kind === 'probe' && message.stageId === stageId) {
      peer.postMessage({ kind: 'present', stageId, probeId: message.probeId });
    }
  };
  return peer;
}

/** The subset of localStorage the lease code uses, backed by a Map. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  } as unknown as Storage;
}

/**
 * A BroadcastChannel that holds presence replies until `release()` is called. A test
 * releases them after the probe has settled, so no reply can beat the probe window.
 */
function heldRepliesChannel(): { Channel: typeof BroadcastChannel; release: () => void } {
  const Real = globalThis.BroadcastChannel;
  const held: Array<() => void> = [];
  class Held extends Real {
    postMessage(message: unknown): void {
      if ((message as { kind?: unknown } | null)?.kind !== 'present') {
        super.postMessage(message);
        return;
      }
      held.push(() => super.postMessage(message));
    }
  }
  return {
    Channel: Held,
    release: () => {
      for (const send of held.splice(0)) send();
    },
  };
}

describe('stage realm presence', () => {
  afterEach(() => __resetStageRealmPresenceForTesting());

  it('reports a peer that has the same stage open', async () => {
    vi.stubGlobal('BroadcastChannel', SyncBroadcastChannel);
    try {
      bindStageRealmPresence(() => 'stage-1');
      const peer = peerHoldingStage('stage-1');
      try {
        expect(await probeStageRealmPresence('stage-1')).toBe('present');
      } finally {
        peer.close();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports no peer when the other realm holds a different stage', async () => {
    bindStageRealmPresence(() => 'stage-1');
    const peer = peerHoldingStage('stage-other');

    try {
      expect(await probeStageRealmPresence('stage-1')).toBe('absent');
    } finally {
      peer.close();
    }
  });

  it('reports no peer when nobody answers', async () => {
    bindStageRealmPresence(() => 'stage-1');

    expect(await probeStageRealmPresence('stage-1')).toBe('absent');
  });

  it('reports unknown when the environment has no BroadcastChannel', async () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error - modelling an environment without the API
    delete globalThis.BroadcastChannel;
    try {
      expect(await probeStageRealmPresence('stage-1')).toBe('unknown');
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });

  it('reports unknown before any realm has bound', async () => {
    // No bindStageRealmPresence call: the pool binds asynchronously at load.
    expect(await probeStageRealmPresence('stage-1')).toBe('unknown');
  });

  it('reports unknown when the channel constructor throws', async () => {
    const original = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = class {
      constructor() {
        throw new Error('channel unavailable');
      }
    } as unknown as typeof BroadcastChannel;
    try {
      bindStageRealmPresence(() => 'stage-1');
      expect(await probeStageRealmPresence('stage-1')).toBe('unknown');
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });
});

describe('stage realm presence leases', () => {
  const realms: PresenceModule[] = [];
  let storage: Storage;

  /** A separate module instance: its own channel, realm id and lease timer. */
  async function loadRealm(): Promise<PresenceModule> {
    vi.resetModules();
    const realm = await import('@/lib/media/stage-realm-presence');
    realms.push(realm);
    return realm;
  }

  /** The lease keys held for one stage right now. */
  function leaseKeys(stageId: string): string[] {
    const prefix = `maic-stage-lease:${encodeURIComponent(stageId)}:`;
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key?.startsWith(prefix) === true,
    );
  }

  /** Captures the pagehide listeners the modules register, in binding order. */
  function capturePagehide(): PagehideListener[] {
    const listeners: PagehideListener[] = [];
    vi.stubGlobal('addEventListener', (type: string, listener: PagehideListener) => {
      if (type === 'pagehide') listeners.push(listener);
    });
    return listeners;
  }

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    __resetStageRealmPresenceForTesting();
    for (const realm of realms.splice(0)) realm.__resetStageRealmPresenceForTesting();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('answers present from a live peer lease, even when the peer reply is held past the window', async () => {
    const replies = heldRepliesChannel();
    vi.stubGlobal('BroadcastChannel', replies.Channel);
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');

    expect(await collector.probeStageRealmPresence('stage-1')).toBe('present');
    replies.release();
  });

  it('reports a peer whose lease has lapsed, and whose reply is held, as absent', async () => {
    const replies = heldRepliesChannel();
    vi.stubGlobal('BroadcastChannel', replies.Channel);
    vi.useFakeTimers({ toFake: ['Date'] });
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');
    expect(leaseKeys('stage-1')).toHaveLength(1);

    // Past the 90 s lease window, with no renewal: the peer is treated as gone.
    vi.setSystemTime(Date.now() + 90_001);

    expect(await collector.probeStageRealmPresence('stage-1')).toBe('absent');
    replies.release();
  });

  it('keeps a peer present while it renews, and lets its lease go once it is released', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');

    for (let elapsed = 0; elapsed < 180_000; elapsed += 5_000) {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await collector.probeStageRealmPresence('stage-1')).toBe('present');
    }

    peer.__resetStageRealmPresenceForTesting();
    expect(await collector.probeStageRealmPresence('stage-1')).toBe('absent');
  });

  it("does not count a realm's own lease as a peer", async () => {
    const realm = await loadRealm();
    realm.bindStageRealmPresence(() => 'stage-1');

    expect(await realm.probeStageRealmPresence('stage-1')).toBe('absent');
  });

  it('does not confuse a stage id with another id that starts the same way', async () => {
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-10');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');

    expect(await collector.probeStageRealmPresence('stage-1')).toBe('absent');
  });

  it("removes this realm's lease at once when the page is leaving", async () => {
    const replies = heldRepliesChannel();
    vi.stubGlobal('BroadcastChannel', replies.Channel);
    const pagehide = capturePagehide();
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');
    // Both realms registered a listener, and the peer bound first.
    expect(pagehide).toHaveLength(2);
    expect(leaseKeys('stage-1')).toHaveLength(1);

    pagehide[0]!();

    expect(leaseKeys('stage-1')).toHaveLength(0);
    expect(await collector.probeStageRealmPresence('stage-1')).toBe('absent');
    replies.release();
  });

  it('keeps the lease when the page is only stored in the back-forward cache', async () => {
    const replies = heldRepliesChannel();
    vi.stubGlobal('BroadcastChannel', replies.Channel);
    const pagehide = capturePagehide();
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');

    pagehide[0]!({ persisted: true } as PageTransitionEvent);

    expect(leaseKeys('stage-1')).toHaveLength(1);
    expect(await collector.probeStageRealmPresence('stage-1')).toBe('present');
    replies.release();
  });

  it('removes lapsed leases of any stage when a realm renews', async () => {
    storage.setItem('maic-stage-lease:old-stage:dead-realm', String(Date.now() - 1));
    const realm = await loadRealm();
    realm.bindStageRealmPresence(() => 'stage-1');

    expect(storage.getItem('maic-stage-lease:old-stage:dead-realm')).toBeNull();
    expect(leaseKeys('stage-1')).toHaveLength(1);
  });

  it('does not count its own lease as a peer after a failed release', async () => {
    const pagehide = capturePagehide();
    const realm = await loadRealm();
    realm.bindStageRealmPresence(() => 'stage-1');
    storage.removeItem = () => {
      throw new Error('storage denied');
    };

    pagehide[0]!();

    expect(await realm.probeStageRealmPresence('stage-1')).toBe('absent');
  });

  it('reports unknown, not absent, when the storage API throws', async () => {
    vi.stubGlobal('localStorage', {
      get length() {
        throw new Error('storage denied');
      },
    });
    const realm = await loadRealm();
    realm.bindStageRealmPresence(() => 'stage-1');

    expect(await realm.probeStageRealmPresence('stage-2')).toBe('unknown');
  });
});
