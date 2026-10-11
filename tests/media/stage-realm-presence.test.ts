import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStageRealmPresenceForTesting,
  bindStageRealmPresence,
  probeStageRealmPresence,
} from '@/lib/media/stage-realm-presence';

type PresenceModule = typeof import('@/lib/media/stage-realm-presence');

/**
 * A peer realm is modelled with its own channel: it answers presence probes the
 * way a second tab's bound module would.
 */
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
 * A BroadcastChannel whose presence replies are sent `delayMs` late, as a busy
 * peer's would be. Probes and everything else are delivered at once.
 */
function lateReplyChannel(delayMs: number): typeof BroadcastChannel {
  const Real = globalThis.BroadcastChannel;
  return class extends Real {
    private readonly pending = new Set<ReturnType<typeof setTimeout>>();

    postMessage(message: unknown): void {
      if ((message as { kind?: unknown } | null)?.kind !== 'present') {
        super.postMessage(message);
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(timer);
        super.postMessage(message);
      }, delayMs);
      this.pending.add(timer);
    }

    close(): void {
      for (const timer of this.pending) clearTimeout(timer);
      this.pending.clear();
      super.close();
    }
  } as unknown as typeof BroadcastChannel;
}

describe('stage realm presence', () => {
  afterEach(() => __resetStageRealmPresenceForTesting());

  it('reports a peer that has the same stage open', async () => {
    bindStageRealmPresence(() => 'stage-1');
    const peer = peerHoldingStage('stage-1');

    try {
      expect(await probeStageRealmPresence('stage-1')).toBe('present');
    } finally {
      peer.close();
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

  /** A separate module instance: its own channel, realm id and lease timer. */
  async function loadRealm(): Promise<PresenceModule> {
    vi.resetModules();
    const realm = await import('@/lib/media/stage-realm-presence');
    realms.push(realm);
    return realm;
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    __resetStageRealmPresenceForTesting();
    for (const realm of realms.splice(0)) realm.__resetStageRealmPresenceForTesting();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('answers present from a live peer lease, even when the peer reply misses the window', async () => {
    vi.stubGlobal('BroadcastChannel', lateReplyChannel(400));
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');

    expect(await collector.probeStageRealmPresence('stage-1')).toBe('present');
  });

  it('reports a peer whose lease has lapsed and whose reply is late as absent', async () => {
    vi.stubGlobal('BroadcastChannel', lateReplyChannel(400));
    vi.useFakeTimers({ toFake: ['Date'] });
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');

    // Past the 90 s lease window, with no renewal: the peer is treated as gone.
    vi.setSystemTime(Date.now() + 90_001);

    expect(await collector.probeStageRealmPresence('stage-1')).toBe('absent');
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
    // Late replies keep a probe from standing in for a lease that was not removed.
    vi.stubGlobal('BroadcastChannel', lateReplyChannel(400));
    const pagehide: Array<() => void> = [];
    vi.stubGlobal('addEventListener', (type: string, listener: () => void) => {
      if (type === 'pagehide') pagehide.push(listener);
    });
    const peer = await loadRealm();
    peer.bindStageRealmPresence(() => 'stage-1');
    const collector = await loadRealm();
    collector.bindStageRealmPresence(() => 'stage-2');
    expect(await collector.probeStageRealmPresence('stage-1')).toBe('present');

    // The peer bound first, so its listener is first.
    pagehide[0]!();

    expect(await collector.probeStageRealmPresence('stage-1')).toBe('absent');
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
