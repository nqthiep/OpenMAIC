import { PGlite } from '@electric-sql/pglite';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';
import {
  currentSnapshot,
  ProviderConfigNotReady,
  refreshProviderSnapshot,
  refreshProviderSnapshotIfChanged,
  resetProviderSnapshot,
} from '@/lib/server/provider-store/snapshot';
import {
  deleteCredential,
  deleteRouting,
  listCredentialViews,
  MasterKeyMissingError,
  SecretUnreadableError,
  saveCredential,
  saveRouting,
  VersionConflictError,
} from '@/lib/server/provider-store/store';

class PGlitePool {
  constructor(private readonly database: PGlite) {}
  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');
const NOW = new Date('2026-10-22T08:00:00Z');
const actor = { actorId: 'root', now: NOW };

let pglite: PGlite;
let db: PGlitePool;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.waitReady;
  db = new PGlitePool(pglite);
  await ensureAccountSchema(db);
  await ensureLearningSchema(db);
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv('PROVIDER_SECRET_KEY', `1:${KEY_A}`);
  vi.stubEnv('DATABASE_URL', 'postgres://provider-store-test');
  resetProviderSnapshot();
  await pglite.exec(
    'DELETE FROM provider_credentials; DELETE FROM model_routing; DELETE FROM account_admin_audit;',
  );
});

describe('currentSnapshot', () => {
  it('fails closed while a configured database is not loaded', () => {
    expect(() => currentSnapshot()).toThrow(ProviderConfigNotReady);
  });

  it('is empty, not an error, when there is no database', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(currentSnapshot().config.providers).toEqual({});
  });
});

describe('saving and loading', () => {
  it('stores the key encrypted and serves it after a refresh', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      baseUrl: 'https://gw.example/v1',
      expectedVersion: 0,
      ...actor,
    });

    const raw = await pglite.query(
      'SELECT secret_enc, key_hint, version FROM provider_credentials',
    );
    const stored = raw.rows[0] as { secret_enc: Uint8Array; key_hint: string; version: number };
    expect(Buffer.from(stored.secret_enc).toString('utf8')).not.toContain('sk-test');
    expect(stored.key_hint).toBe('6789');
    expect(stored.version).toBe(1);

    const snapshot = await refreshProviderSnapshot(db);
    expect(snapshot.config.providers.openai).toMatchObject({
      apiKey: 'sk-test-0123456789',
      baseUrl: 'https://gw.example/v1',
    });
    expect(currentSnapshot()).toBe(snapshot);
  });

  it('never returns the secret in the admin view', async () => {
    await saveCredential(db, {
      section: 'tts',
      providerId: 'openai-tts',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    const [view] = await listCredentialViews(db);
    expect(JSON.stringify(view)).not.toContain('sk-test');
    expect(view).toMatchObject({
      providerId: 'openai-tts',
      has: { apiKey: true, proxy: false },
      keyHint: '6789',
      readable: true,
      version: 1,
    });
  });

  it('keeps a secret field that is left out and clears one set to null', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789', proxy: 'http://u:p@px' },
      expectedVersion: 0,
      ...actor,
    });
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      baseUrl: 'https://x.example',
      expectedVersion: 1,
      ...actor,
    });
    let snap = await refreshProviderSnapshot(db);
    expect(snap.config.providers.openai).toMatchObject({
      apiKey: 'sk-test-0123456789',
      proxy: 'http://u:p@px',
      baseUrl: 'https://x.example',
    });

    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { proxy: null },
      expectedVersion: 2,
      ...actor,
    });
    snap = await refreshProviderSnapshot(db);
    expect(snap.config.providers.openai.proxy).toBeUndefined();
    expect(snap.config.providers.openai.apiKey).toBe('sk-test-0123456789');
  });

  it('refuses a stale version and a duplicate create', async () => {
    await saveCredential(db, {
      section: 'asr',
      providerId: 'openai-whisper',
      secret: { apiKey: 'k-0123456789ab' },
      expectedVersion: 0,
      ...actor,
    });
    await expect(
      saveCredential(db, {
        section: 'asr',
        providerId: 'openai-whisper',
        enabled: false,
        expectedVersion: 0,
        ...actor,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
    await saveCredential(db, {
      section: 'asr',
      providerId: 'openai-whisper',
      enabled: false,
      expectedVersion: 1,
      ...actor,
    });
    await expect(
      saveCredential(db, {
        section: 'asr',
        providerId: 'openai-whisper',
        enabled: true,
        expectedVersion: 1,
        ...actor,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('refuses to store a secret without a master key', async () => {
    vi.stubEnv('PROVIDER_SECRET_KEY', '');
    await expect(
      saveCredential(db, {
        section: 'providers',
        providerId: 'openai',
        secret: { apiKey: 'k-0123456789ab' },
        expectedVersion: 0,
        ...actor,
      }),
    ).rejects.toBeInstanceOf(MasterKeyMissingError);
  });

  it('stores a switch-off with no secret, and a keyless provider by base URL', async () => {
    await saveCredential(db, {
      section: 'tts',
      providerId: 'browser-native-tts',
      enabled: false,
      expectedVersion: 0,
      ...actor,
    });
    await saveCredential(db, {
      section: 'providers',
      providerId: 'ollama',
      baseUrl: 'http://ollama:11434',
      expectedVersion: 0,
      ...actor,
    });
    const { config } = await refreshProviderSnapshot(db);
    expect(config.disabled.tts.has('browser-native-tts')).toBe(true);
    expect(config.providers.ollama.baseUrl).toBe('http://ollama:11434');
  });

  it('removes a row and writes audit rows without values', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    expect(
      await deleteCredential(db, { section: 'providers', providerId: 'openai', ...actor }),
    ).toBe(true);
    expect(
      await deleteCredential(db, { section: 'providers', providerId: 'openai', ...actor }),
    ).toBe(false);
    const audit = await pglite.query(
      'SELECT action, target_id, reason FROM account_admin_audit ORDER BY id',
    );
    expect(audit.rows).toEqual([
      { action: 'provider:set', target_id: 'providers/openai', reason: 'apiKey' },
      { action: 'provider:delete', target_id: 'providers/openai', reason: null },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain('sk-test');
  });
});

describe('master keys', () => {
  it('reports a row it cannot decrypt instead of serving or throwing', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    vi.stubEnv('PROVIDER_SECRET_KEY', `1:${KEY_B}`);
    const snapshot = await refreshProviderSnapshot(db);
    // Never served with its key, but still managed: a client's key must not take its place.
    expect(snapshot.config.providers.openai).toEqual({ apiKey: '' });
    expect(snapshot.unreadable).toEqual([{ section: 'providers', providerId: 'openai' }]);
    expect((await listCredentialViews(db))[0]).toMatchObject({
      readable: false,
      has: { apiKey: true },
    });
  });

  it('keeps reading old rows after a new key is put in front', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    vi.stubEnv('PROVIDER_SECRET_KEY', `2:${KEY_B},1:${KEY_A}`);
    expect((await refreshProviderSnapshot(db)).config.providers.openai.apiKey).toBe(
      'sk-test-0123456789',
    );

    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      baseUrl: 'https://x.example',
      expectedVersion: 1,
      ...actor,
    });
    const row = await pglite.query('SELECT key_id FROM provider_credentials');
    expect((row.rows[0] as { key_id: number }).key_id).toBe(2);
    vi.stubEnv('PROVIDER_SECRET_KEY', `2:${KEY_B}`);
    expect((await refreshProviderSnapshot(db)).config.providers.openai.apiKey).toBe(
      'sk-test-0123456789',
    );
  });
});

describe('a stored secret this server cannot read', () => {
  it('is not overwritten by an edit that sets only a proxy', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    vi.stubEnv('PROVIDER_SECRET_KEY', `1:${KEY_B}`);
    await expect(
      saveCredential(db, {
        section: 'providers',
        providerId: 'openai',
        secret: { proxy: 'http://proxy:8080' },
        expectedVersion: 1,
        ...actor,
      }),
    ).rejects.toBeInstanceOf(SecretUnreadableError);
  });

  it('is not wiped by an edit that leaves the key alone, and can be replaced by a new key', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    vi.stubEnv('PROVIDER_SECRET_KEY', `1:${KEY_B}`);

    await expect(
      saveCredential(db, {
        section: 'providers',
        providerId: 'openai',
        baseUrl: 'https://x.example',
        expectedVersion: 1,
        ...actor,
      }),
    ).rejects.toBeInstanceOf(SecretUnreadableError);
    const kept = await pglite.query('SELECT secret_enc, version FROM provider_credentials');
    expect((kept.rows[0] as { secret_enc: Uint8Array | null }).secret_enc).not.toBeNull();
    expect((kept.rows[0] as { version: number }).version).toBe(1);

    // The old key comes back: the secret is still there.
    vi.stubEnv('PROVIDER_SECRET_KEY', `1:${KEY_A}`);
    expect((await refreshProviderSnapshot(db)).config.providers.openai.apiKey).toBe(
      'sk-test-0123456789',
    );

    // With the wrong key, a new key replaces it.
    vi.stubEnv('PROVIDER_SECRET_KEY', `1:${KEY_B}`);
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-new-9876543210' },
      expectedVersion: 1,
      ...actor,
    });
    expect((await refreshProviderSnapshot(db)).config.providers.openai.apiKey).toBe(
      'sk-new-9876543210',
    );
  });
});

describe('compare-and-set', () => {
  it('refuses a save from a form whose row was deleted, instead of recreating it', async () => {
    await saveCredential(db, {
      section: 'tts',
      providerId: 'openai-tts',
      secret: { apiKey: 'k-0123456789ab' },
      expectedVersion: 0,
      ...actor,
    });
    await deleteCredential(db, { section: 'tts', providerId: 'openai-tts', ...actor });
    await expect(
      saveCredential(db, {
        section: 'tts',
        providerId: 'openai-tts',
        enabled: false,
        expectedVersion: 1,
        ...actor,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect((await pglite.query('SELECT 1 FROM provider_credentials')).rows).toHaveLength(0);
  });

  it('applies the same rule to model routes, for save and for delete', async () => {
    await saveRouting(db, {
      stage: 'scene-content',
      value: 'openai:gpt-5',
      expectedVersion: 0,
      ...actor,
    });
    await deleteRouting(db, { stage: 'scene-content', ...actor });
    await expect(
      saveRouting(db, {
        stage: 'scene-content',
        value: 'openai:gpt-5',
        expectedVersion: 1,
        ...actor,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    await saveRouting(db, {
      stage: 'pbl-chat',
      value: 'openai:gpt-5',
      expectedVersion: 0,
      ...actor,
    });
    await saveRouting(db, {
      stage: 'pbl-chat',
      value: 'openai:gpt-4o',
      expectedVersion: 1,
      ...actor,
    });
    expect(await deleteRouting(db, { stage: 'pbl-chat', expectedVersion: 1, ...actor })).toBe(
      false,
    );
    expect(await deleteRouting(db, { stage: 'pbl-chat', expectedVersion: 2, ...actor })).toBe(true);
  });

  it('lets only one of two overlapping refreshes install, the one that started later', async () => {
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    const slow = new PGlitePool(pglite);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // The first refresh is held up after it read the old state; the second finishes first.
    const first = refreshProviderSnapshot({
      query: async (text: string, params?: unknown[]) => {
        const result = await slow.query(text, params);
        if (text.includes('FROM provider_credentials ORDER BY')) await gate;
        return result;
      },
    });
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      baseUrl: 'https://new.example',
      expectedVersion: 1,
      ...actor,
    });
    await refreshProviderSnapshot(db);
    release();
    await first;
    expect(currentSnapshot().config.providers.openai.baseUrl).toBe('https://new.example');
  });
});

describe('model routing and refresh', () => {
  it('loads the default model and the stage routes', async () => {
    await saveRouting(db, {
      stage: 'default',
      value: { model: 'openai:gpt-4o' },
      expectedVersion: 0,
      ...actor,
    });
    await saveRouting(db, {
      stage: 'scene-content',
      value: { model: 'openai:gpt-5', thinking: { enabled: false } },
      expectedVersion: 0,
      ...actor,
    });
    const { routing } = await refreshProviderSnapshot(db);
    expect(routing.defaultModel).toBe('openai:gpt-4o');
    expect(routing.routes['scene-content']).toEqual({
      model: 'openai:gpt-5',
      thinking: { enabled: false },
    });
    expect(await deleteRouting(db, { stage: 'scene-content', ...actor })).toBe(true);
  });

  it('reloads only when a row changed', async () => {
    expect(await refreshProviderSnapshotIfChanged(db)).toBe(true);
    expect(await refreshProviderSnapshotIfChanged(db)).toBe(false);
    await saveCredential(db, {
      section: 'providers',
      providerId: 'openai',
      secret: { apiKey: 'sk-test-0123456789' },
      expectedVersion: 0,
      ...actor,
    });
    expect(await refreshProviderSnapshotIfChanged(db)).toBe(true);
    expect(currentSnapshot().config.providers.openai).toBeDefined();
    expect(await refreshProviderSnapshotIfChanged(db)).toBe(false);
  });
});
