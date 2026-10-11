/**
 * The settings store's version 6 migration: 'zh-CN', the default speech
 * language, is cleared once so the UI language decides (lib/store/settings.ts).
 */
import { BrowserKVStore } from '@openmaic/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backing = new Map<string, string>();
const localStorageStub: Storage = {
  get length() {
    return backing.size;
  },
  clear: () => backing.clear(),
  getItem: (k: string) => backing.get(k) ?? null,
  key: (i: number) => [...backing.keys()][i] ?? null,
  removeItem: (k: string) => void backing.delete(k),
  setItem: (k: string, v: string) => void backing.set(k, v),
};
vi.stubGlobal('localStorage', localStorageStub);
vi.stubGlobal('window', { localStorage: localStorageStub });

const kv = new BrowserKVStore({ storage: localStorageStub });

beforeEach(() => {
  backing.clear();
  vi.resetModules();
});

async function hydrate(state: Record<string, unknown>, version: number) {
  await kv.set('settings-storage', { state, version }, 'account');
  const { useSettingsStore } = await import('@/lib/store/settings');
  await useSettingsStore.persist.rehydrate();
  return useSettingsStore;
}

describe('settings store v5 → v6: speech language', () => {
  it('clears the old default so the UI language decides', async () => {
    const store = await hydrate({ asrLanguage: 'zh-CN' }, 5);
    expect(store.getState().asrLanguage).toBe('');
  });

  it('keeps any other language and the other preferences', async () => {
    const store = await hydrate({ asrLanguage: 'en-US', playbackSpeed: 1.5 }, 5);
    expect(store.getState().asrLanguage).toBe('en-US');
    expect(store.getState().playbackSpeed).toBe(1.5);
  });

  it('clears the default in a blob from before version 5 too', async () => {
    const store = await hydrate({ asrLanguage: 'zh-CN', playbackSpeed: 1.25 }, 4);
    expect(store.getState().asrLanguage).toBe('');
    expect(store.getState().playbackSpeed).toBe(1.25);
  });

  it('does not run again: a language picked at version 6 stays', async () => {
    const store = await hydrate({ asrLanguage: 'zh-CN' }, 6);
    expect(store.getState().asrLanguage).toBe('zh-CN');
  });

  it('accepts a blob with no speech language', async () => {
    const store = await hydrate({ playbackSpeed: 1.25 }, 5);
    expect(store.getState().asrLanguage).toBe('');
    expect(store.getState().playbackSpeed).toBe(1.25);
  });

  it('accepts an empty blob', async () => {
    const store = await hydrate({}, 5);
    expect(store.getState().asrLanguage).toBe('');
  });

  it('writes the blob back at version 6', async () => {
    const store = await hydrate({ asrLanguage: 'zh-CN' }, 5);
    store.getState().setPlaybackSpeed(1.25);
    await vi.waitFor(async () => {
      const blob = await kv.get<{ state: Record<string, unknown>; version: number }>(
        'settings-storage',
        'account',
      );
      expect(blob?.version).toBe(6);
      expect(blob?.state.asrLanguage).toBe('');
    });
  });
});
