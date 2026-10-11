import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BINDING_ENDPOINT } from '@/lib/legacy-browser-import/protocol';
import type { OwnerAuthMethod } from '@/lib/server/identity/types';

/**
 * The binding route with accounts on: an account is never given the browser's
 * pre-server data, so the route refuses before it touches the database. With
 * accounts off the same request binds as before (the control).
 */

class PGlitePool {
  constructor(readonly db: PGlite) {}
  query(text: string, params?: unknown[]) {
    return this.db.query(text, params);
  }
  async connect() {
    return {
      query: (text: string, params?: unknown[]) => this.db.query(text, params),
      release() {},
    };
  }
  async end() {
    await this.db.close();
  }
}

const BROWSER = '0123456789abcdef0123456789abcdef';
const SAME_ORIGIN_JSON = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

const sessionMethod: OwnerAuthMethod = {
  name: 'test-session',
  authenticate: async (req) => {
    const user = req.headers.get('x-test-session');
    if (!user) return { status: 'not-applicable' };
    return {
      status: 'authenticated',
      principal: {
        ownerId: `user:${user}`,
        kind: 'user',
        roles: new Set(['course:publish']),
        assurance: 'verified',
      },
    };
  },
};

describe('the legacy import binding with accounts on', () => {
  let pool: PGlitePool;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', `postgres://legacy-binding-accounts-${randomUUID()}`);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    vi.stubEnv('ACCESS_CODE', '');
    vi.stubEnv('OWNER_CLAIM_TRIGGER', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new PGlite();
    await db.waitReady;
    pool = new PGlitePool(db);
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(process.env.DATABASE_URL!, () => pool as never);
    const { configureOwnerAuthentication } = await import('@/lib/server/identity');
    configureOwnerAuthentication({ methods: [sessionMethod] });
  });

  afterEach(async () => {
    const { resetOwnerAuthenticationForTests } = await import('@/lib/server/identity/registry');
    resetOwnerAuthenticationForTests();
    await pool.end();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function bind(user: string) {
    const { POST } = await import('@/app/api/identity/legacy-import-binding/route');
    return POST(
      new Request(`http://localhost${BINDING_ENDPOINT}`, {
        method: 'POST',
        headers: { ...SAME_ORIGIN_JSON, 'x-test-session': user },
        body: JSON.stringify({ browserId: BROWSER }),
      }),
    );
  }

  it('answers 403 and reads or writes nothing', async () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    const queries = vi.spyOn(pool, 'query');

    const response = await bind('alice');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'LEGACY_IMPORT_DISABLED' },
    });
    expect(queries).not.toHaveBeenCalled();
  });

  it('binds the browser as before when accounts are off', async () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');

    const response = await bind('alice');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bound: true });
    const rows = await pool.query('SELECT browser_id, owner_id FROM legacy_import_bindings');
    expect(rows.rows).toEqual([{ browser_id: BROWSER, owner_id: 'user:alice' }]);
  });
});
