/**
 * What this browser keeps for an account: removed when the account changes or
 * ends, except the interface preferences and the importer's bookkeeping. The
 * storage is an in-memory stand-in; the device cache is injected.
 */
import { describe, expect, it } from 'vitest';

import {
  accountChangedElsewhere,
  clearAccountClientState,
  endAccountSession,
  LAST_ACCOUNT_KEY,
  prepareAccountSwitch,
} from '@/lib/accounts/client-state';
import { LEDGER_KEY, LEDGER_VERSION } from '@/lib/legacy-browser-import/ledger';
import { LEGACY_AGENT_REGISTRY_KEY } from '@/lib/legacy-browser-import/agents-import';
import { MODEL_SETTINGS_IMPORT_KEY } from '@/lib/legacy-browser-import/model-settings';
import { MODEL_SETTINGS_UNIMPORTED_KEY } from '@/lib/legacy-browser-import/model-settings-unimported';
import {
  COURSE_ORDER_STORAGE_KEY,
  SESSION_ORDER_STORAGE_KEY,
} from '@/lib/workbench/workspace-order';
import { COURSE_TABS_STORAGE_KEY } from '@/lib/workbench/workspace-course-tabs';
import { LAST_WORKSPACE_SESSION_STORAGE_KEY } from '@/lib/workbench/workspace-session-memory';
import {
  CHAT_COLLAPSED_STORAGE_KEY,
  CHAT_WIDTH_STORAGE_KEY,
  CLASSROOM_COLLAPSED_STORAGE_KEY,
  NAV_COLLAPSED_STORAGE_KEY,
} from '@/lib/workbench/workspace-panes';
import { RAIL_WIDTH_STORAGE_KEY } from '@/lib/workbench/workspace-navigation';
import { RAIL_TAB_STORAGE_KEY } from '@/lib/workbench/workspace-rail-tab';

const INTERFACE_KEYS = [
  'theme',
  'locale',
  'recentClassroomsOpen',
  'interactiveModeEnabled',
  RAIL_WIDTH_STORAGE_KEY,
  RAIL_TAB_STORAGE_KEY,
  NAV_COLLAPSED_STORAGE_KEY,
  CHAT_COLLAPSED_STORAGE_KEY,
  CLASSROOM_COLLAPSED_STORAGE_KEY,
  CHAT_WIDTH_STORAGE_KEY,
  'workbench.panel.session-1',
];

const ACCOUNT_KEYS = [
  'maic:account:settings-storage',
  'maic:account:user-profile-storage',
  'maic:device:editor-current-scene:stage-1',
  'maic:device:playback-cursor:stage-1',
  'maic:device:runtime.pblDrain.stage-1.scene-1.acct_1',
  'maic:device:document-migration:stage-1',
  'maic:device:document-storage-generation',
  COURSE_ORDER_STORAGE_KEY,
  SESSION_ORDER_STORAGE_KEY,
  COURSE_TABS_STORAGE_KEY,
  LAST_WORKSPACE_SESSION_STORAGE_KEY,
  'learnDoor.nickname',
  'learnDoor.opened',
  'providersConfig',
  'a-key-nobody-wrote-yet',
];

const COMPLETE_LEDGER = JSON.stringify({
  version: LEDGER_VERSION,
  browserId: '0'.repeat(32),
  failedRuns: 0,
  courses: {},
  folders: {},
  completedAt: 1,
  agents: 'done',
});

const OPEN_LEDGER = JSON.stringify({
  version: LEDGER_VERSION,
  browserId: '0'.repeat(32),
  failedRuns: 0,
  courses: {},
  folders: {},
});

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  } as Storage;
}

function keysOf(storage: Storage): string[] {
  return [...Array(storage.length).keys()].map((index) => storage.key(index) as string);
}

function seededLocal(extra: Record<string, string> = {}): Storage {
  const seed: Record<string, string> = {};
  for (const key of INTERFACE_KEYS) seed[key] = `value of ${key}`;
  for (const key of ACCOUNT_KEYS) seed[key] = `data of ${key}`;
  return memoryStorage({ ...seed, ...extra });
}

const noDevice = async () => {};

describe('clearAccountClientState', () => {
  it('removes account data and keeps the interface preferences', async () => {
    const storage = seededLocal({ [LEDGER_KEY]: COMPLETE_LEDGER });
    const cleared = await clearAccountClientState({ storage, clearDevice: noDevice });

    expect(cleared).toBe(true);
    expect(keysOf(storage).sort()).toEqual([...INTERFACE_KEYS, LEDGER_KEY].sort());
  });

  it('keeps the importer bookkeeping that has not finished', async () => {
    const importerKeys = {
      [LEDGER_KEY]: OPEN_LEDGER,
      [MODEL_SETTINGS_IMPORT_KEY]: '{"proposal":true}',
      [MODEL_SETTINGS_UNIMPORTED_KEY]: '{"unimported":true}',
      'maic:device:runtime.learnerKey': 'anon:1',
      [LEGACY_AGENT_REGISTRY_KEY]: '{"agents":[]}',
      'quizDraft:scene-1': '{"a":1}',
      'quizAnswers:scene-1': '{"a":1}',
      'quizResults:scene-1': '[]',
      'quizAttemptId:scene-1': 'attempt-1',
    };
    const storage = seededLocal(importerKeys);
    await clearAccountClientState({ storage, clearDevice: noDevice });

    const kept = keysOf(storage);
    for (const key of Object.keys(importerKeys)) expect(kept).toContain(key);
    for (const key of ACCOUNT_KEYS) expect(kept).not.toContain(key);
  });

  it('drops the legacy quiz state and agent registry once the import is complete', async () => {
    const storage = seededLocal({
      [LEDGER_KEY]: COMPLETE_LEDGER,
      [LEGACY_AGENT_REGISTRY_KEY]: '{"agents":[]}',
      'quizDraft:scene-1': '{"a":1}',
      'quizAnswers:scene-1': '{"a":1}',
    });
    await clearAccountClientState({ storage, clearDevice: noDevice });

    const kept = keysOf(storage);
    expect(kept).not.toContain(LEGACY_AGENT_REGISTRY_KEY);
    expect(kept).not.toContain('quizDraft:scene-1');
    expect(kept).not.toContain('quizAnswers:scene-1');
  });

  it('clears session storage', async () => {
    const sessionStore = memoryStorage({
      'openmaic:playback-action-resume:stage-1': '{"sceneId":"s"}',
      'workbench.launchPrompt': 'a prompt',
      'generationRunReviewIntent:run-1': '1',
    });
    await clearAccountClientState({
      storage: memoryStorage(),
      sessionStore,
      clearDevice: noDevice,
    });

    expect(sessionStore.length).toBe(0);
  });

  it('reports the failure of the device cache and still clears local storage', async () => {
    const storage = seededLocal();
    const cleared = await clearAccountClientState({
      storage,
      clearDevice: async () => {
        throw new Error('database blocked');
      },
    });

    expect(cleared).toBe(false);
    expect(keysOf(storage).some((key) => ACCOUNT_KEYS.includes(key))).toBe(false);
    expect(keysOf(storage)).toContain('theme');
  });

  it('does not wait past the limit for a device cache that never settles', async () => {
    const started = Date.now();
    const cleared = await clearAccountClientState({
      storage: memoryStorage(),
      sessionStore: memoryStorage(),
      clearDevice: () => new Promise<void>(() => {}),
      deviceTimeoutMs: 20,
    });

    expect(cleared).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('never throws when the storage refuses access', async () => {
    const refusing = {
      get length(): number {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    await expect(
      clearAccountClientState({ storage: refusing, sessionStore: refusing, clearDevice: noDevice }),
    ).resolves.toBe(false);
  });
});

describe('prepareAccountSwitch', () => {
  it('does nothing when this browser last served the same account', async () => {
    const storage = seededLocal({ [LAST_ACCOUNT_KEY]: 'acct-1' });
    let deviceCleared = false;
    const outcome = await prepareAccountSwitch('acct-1', {
      storage,
      sessionStore: memoryStorage(),
      clearDevice: async () => {
        deviceCleared = true;
      },
    });

    expect(outcome).toBe('unchanged');
    expect(deviceCleared).toBe(false);
    expect(keysOf(storage)).toEqual(expect.arrayContaining(ACCOUNT_KEYS));
  });

  it('clears the previous account and records the new one', async () => {
    const storage = seededLocal({ [LAST_ACCOUNT_KEY]: 'acct-1' });
    let deviceCleared = 0;
    const outcome = await prepareAccountSwitch('acct-2', {
      storage,
      sessionStore: memoryStorage(),
      clearDevice: async () => {
        deviceCleared += 1;
      },
    });

    expect(outcome).toBe('switched');
    expect(deviceCleared).toBe(1);
    const kept = keysOf(storage);
    for (const key of ACCOUNT_KEYS) expect(kept).not.toContain(key);
    expect(kept).toContain('theme');
    expect(storage.getItem(LAST_ACCOUNT_KEY)).toBe('acct-2');
  });

  it('treats a browser with no record as another account', async () => {
    const storage = seededLocal();
    const outcome = await prepareAccountSwitch('acct-1', {
      storage,
      sessionStore: memoryStorage(),
      clearDevice: noDevice,
    });

    expect(outcome).toBe('switched');
    expect(keysOf(storage)).not.toContain('maic:account:settings-storage');
    expect(storage.getItem(LAST_ACCOUNT_KEY)).toBe('acct-1');
  });

  it('keeps the old record and reports failure when the clear fails, so the next call retries', async () => {
    const storage = seededLocal({ [LAST_ACCOUNT_KEY]: 'acct-1' });
    const failing = await prepareAccountSwitch('acct-2', {
      storage,
      sessionStore: memoryStorage(),
      clearDevice: async () => {
        throw new Error('database blocked');
      },
    });

    expect(failing).toBe('failed');
    expect(storage.getItem(LAST_ACCOUNT_KEY)).toBe('acct-1');

    const retried = await prepareAccountSwitch('acct-2', {
      storage,
      sessionStore: memoryStorage(),
      clearDevice: noDevice,
    });
    expect(retried).toBe('switched');
    expect(storage.getItem(LAST_ACCOUNT_KEY)).toBe('acct-2');
  });

  it('reports failure when the record cannot be written', async () => {
    const storage = seededLocal({ [LAST_ACCOUNT_KEY]: 'acct-1' });
    const original = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (key === LAST_ACCOUNT_KEY) throw new Error('QuotaExceededError');
      original(key, value);
    };

    const outcome = await prepareAccountSwitch('acct-2', {
      storage,
      sessionStore: memoryStorage(),
      clearDevice: noDevice,
    });
    expect(outcome).toBe('failed');
  });
});

describe('endAccountSession', () => {
  it('revokes the session first, clears the state, forgets the record, then leaves', async () => {
    const storage = seededLocal({ [LAST_ACCOUNT_KEY]: 'acct-1' });
    const order: string[] = [];
    await endAccountSession({
      storage,
      sessionStore: memoryStorage(),
      revoke: async () => {
        order.push('revoke');
      },
      clearDevice: async () => {
        order.push('device');
      },
      leave: () => {
        order.push('leave');
      },
    });

    expect(order).toEqual(['revoke', 'device', 'leave']);
    expect(storage.getItem(LAST_ACCOUNT_KEY)).toBeNull();
    expect(keysOf(storage)).not.toContain('maic:account:settings-storage');
    expect(keysOf(storage)).toContain('theme');
  });

  it('still clears and leaves when the revoke fails', async () => {
    const storage = seededLocal({ [LAST_ACCOUNT_KEY]: 'acct-1' });
    let left = false;
    await endAccountSession({
      storage,
      sessionStore: memoryStorage(),
      revoke: async () => {
        throw new Error('offline');
      },
      clearDevice: noDevice,
      leave: () => {
        left = true;
      },
    });

    expect(left).toBe(true);
    expect(keysOf(storage)).not.toContain('maic:account:settings-storage');
  });

  it('leaves without waiting for a revoke that never settles', async () => {
    let left = false;
    await endAccountSession({
      storage: memoryStorage(),
      sessionStore: memoryStorage(),
      revoke: () => new Promise<void>(() => {}),
      revokeTimeoutMs: 20,
      clearDevice: noDevice,
      leave: () => {
        left = true;
      },
    });

    expect(left).toBe(true);
  });
});

describe('accountChangedElsewhere', () => {
  it('is true when another tab records a different account or forgets the record', () => {
    expect(accountChangedElsewhere({ key: LAST_ACCOUNT_KEY, newValue: 'acct-2' }, 'acct-1')).toBe(
      true,
    );
    expect(accountChangedElsewhere({ key: LAST_ACCOUNT_KEY, newValue: null }, 'acct-1')).toBe(true);
  });

  it('is false for the same account, for other keys, and for a cleared storage', () => {
    expect(accountChangedElsewhere({ key: LAST_ACCOUNT_KEY, newValue: 'acct-1' }, 'acct-1')).toBe(
      false,
    );
    expect(accountChangedElsewhere({ key: 'theme', newValue: 'dark' }, 'acct-1')).toBe(false);
    expect(accountChangedElsewhere({ key: null, newValue: null }, 'acct-1')).toBe(false);
  });
});
