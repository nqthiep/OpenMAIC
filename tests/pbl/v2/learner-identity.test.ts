import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KVStore, RuntimeStore } from '@openmaic/storage';

import { synchronizePBLProjectRuntime } from '@/lib/pbl/v2/runtime/hydration';
import { configureRuntimeStorage, resetRuntimeStorageForTests } from '@/lib/runtime/config';

/**
 * PBL drains and hydration key their watermarks and runtime sessions by the
 * learner partition. A signed-in account must use its own partition; a caller
 * that injects its own KV store keeps that store's identity. These tests read
 * the keys each store is asked for, which is where the identity shows.
 */

const STAGE_ID = 'stage-pbl-identity';
const SCENE_ID = 'scene-pbl-identity';

/** The default device store reads localStorage, so a recording stand-in records every key read. */
function recordingLocalStorage(): { storage: Storage; reads: string[] } {
  const values = new Map<string, string>();
  const reads: string[] = [];
  const storage = {
    get length() {
      return values.size;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    getItem(key: string) {
      reads.push(key);
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  } as unknown as Storage;
  return { storage, reads };
}

/** A runtime store that answers only listSessions, recording the learner key it was asked for. */
function recordingRuntimeStore(): { store: RuntimeStore; learnerKeys: string[] } {
  const learnerKeys: string[] = [];
  const store = new Proxy(
    {},
    {
      get(_target, method) {
        // A proxy that looks like a thenable would hang any `await` on it.
        if (method === 'then') return undefined;
        return (...args: unknown[]) => {
          if (method === 'listSessions') learnerKeys.push(String(args[1]));
          return Promise.resolve([]);
        };
      },
    },
  ) as unknown as RuntimeStore;
  return { store, learnerKeys };
}

/** An injected KV store holding one device-scoped learner key, recording every key read. */
function injectedKv(learnerKey: string): { kv: KVStore; reads: string[] } {
  const values: Record<string, unknown> = { 'runtime.learnerKey': learnerKey };
  const reads: string[] = [];
  const kv = {
    get: async (key: string) => {
      reads.push(key);
      return values[key];
    },
    set: async (key: string, value: unknown) => {
      values[key] = value;
    },
    remove: async (key: string) => {
      delete values[key];
    },
    keys: async (prefix: string) => Object.keys(values).filter((key) => key.startsWith(prefix)),
  } as unknown as KVStore;
  return { kv, reads };
}

async function runSync(store: RuntimeStore, kv?: KVStore): Promise<void> {
  // Errors after the identity is resolved do not matter here; the reads and lookups do.
  await synchronizePBLProjectRuntime({
    stageId: STAGE_ID,
    sceneId: SCENE_ID,
    project: { runtimeEvents: [], engagementEvents: [] } as never,
    store,
    ...(kv ? { kv } : {}),
  }).catch(() => undefined);
}

describe('PBL runtime learner identity', () => {
  afterEach(() => {
    resetRuntimeStorageForTests();
    vi.unstubAllGlobals();
  });

  it('keys the device watermark and runtime sessions by the configured account identity', async () => {
    const { storage, reads } = recordingLocalStorage();
    vi.stubGlobal('localStorage', storage);
    configureRuntimeStorage({ learnerKey: () => 'acct:owner-a' });
    const { store, learnerKeys } = recordingRuntimeStore();

    await runSync(store);

    expect(reads.some((key) => key.includes('acct:owner-a'))).toBe(true);
    expect(reads.some((key) => key.includes('anon:'))).toBe(false);
    expect(new Set(learnerKeys)).not.toContain('anon:');
  });

  it('keeps the identity of an injected KV store, even when an account is configured', async () => {
    vi.stubGlobal('localStorage', recordingLocalStorage().storage);
    configureRuntimeStorage({ learnerKey: () => 'acct:owner-a' });
    const { store, learnerKeys } = recordingRuntimeStore();
    const { kv, reads } = injectedKv('anon:injected-device');

    await runSync(store, kv);

    expect(reads.some((key) => key.includes('anon:injected-device'))).toBe(true);
    expect(reads.some((key) => key.includes('acct:owner-a'))).toBe(false);
    expect(learnerKeys.every((key) => key !== 'acct:owner-a')).toBe(true);
  });
});
