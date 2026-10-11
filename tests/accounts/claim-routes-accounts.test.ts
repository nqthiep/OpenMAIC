import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { createOwnerBoundDocumentStore } from '@/lib/persistence/owner-bound-document-store';
import type { OwnerAuthMethod } from '@/lib/server/identity/types';

/**
 * The two manual claims beside accounts: `POST /api/identity/claim` and the
 * runtime learner merge. With accounts on (`OPENMAIC_ACCOUNTS=true`) neither
 * claims the browser's anonymous work: both answer 403 before they touch the
 * database, and a merge spelled another way the storage router also routes is
 * refused as well. With accounts off the same requests claim as before.
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

const ANON_UUID = '5d1c9a8e-2b3f-4c4d-9e5f-6a7b8c9d0e1f';
const ANON = `anon:${ANON_UUID}`;
const ALICE = 'user:alice';
const ANON_COOKIE = `anonymous_id=${ANON_UUID}`;
const SAME_ORIGIN_JSON = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const REFUSAL = 'Chức năng này không khả dụng khi bật tài khoản.';

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

function signedInAsAlice(): Record<string, string> {
  return { 'x-test-session': 'alice', cookie: ANON_COOKIE, ...SAME_ORIGIN_JSON };
}

function courseDocument(id: string) {
  const now = 1_800_000_000_000;
  return {
    stage: { id, name: id, createdAt: now, updatedAt: now },
    scenes: [],
    outline: {
      outlines: [],
      requirement: id,
      generationComplete: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe('the manual claims beside accounts', () => {
  let pool: PGlitePool;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', `postgres://claim-routes-accounts-${randomUUID()}`);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    vi.stubEnv('ACCESS_CODE', '');
    vi.stubEnv('OWNER_CLAIM_TRIGGER', '');
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
    vi.stubEnv('LOG_LEVEL', 'info');
    const db = new PGlite();
    await db.waitReady;
    pool = new PGlitePool(db);
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(process.env.DATABASE_URL!, () => pool as never);
    const { configureOwnerAuthentication } = await import('@/lib/server/identity');
    configureOwnerAuthentication({ methods: [sessionMethod] });
    // Work done before signing in.
    await createOwnerBoundDocumentStore({
      pool,
      ownerId: ANON,
      validateScene: validateAppScene,
      validateStage: validateAppStage,
    }).saveDocument(courseDocument('anon-course'));
  });

  afterEach(async () => {
    const { resetOwnerAuthenticationForTests } = await import('@/lib/server/identity/registry');
    resetOwnerAuthenticationForTests();
    await pool.end();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function claim(): Promise<Response> {
    const { POST } = await import('@/app/api/identity/claim/route');
    return POST(
      new Request('http://localhost/api/identity/claim', {
        method: 'POST',
        headers: signedInAsAlice(),
        body: '{}',
      }),
    );
  }

  async function merge(path = '/api/persistence/runtime/learners/merge'): Promise<Response> {
    const { handlePersistenceRequest } = await import('@/app/api/persistence/[...path]/route');
    return handlePersistenceRequest(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: signedInAsAlice(),
        body: JSON.stringify({ fromLearnerKey: ANON, toLearnerKey: ALICE }),
      }),
      { poolFactory: () => pool as never },
    );
  }

  async function ownerOf(stageId: string): Promise<string | undefined> {
    const result = await pool.query('SELECT owner_id FROM stage_meta WHERE stage_id = $1', [
      stageId,
    ]);
    return (result.rows[0] as { owner_id?: string } | undefined)?.owner_id;
  }

  it('answers the claim route 403 and claims nothing, with a warning in the server log', async () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queries = vi.spyOn(pool, 'query');

    const response = await claim();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'CLAIM_DISABLED', message: REFUSAL },
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(queries).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('owner claim refused'));
  });

  it('answers the learner merge 403 and moves nothing, under the canonical path and another spelling', async () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const canonical = await merge();
    expect(canonical.status).toBe(403);
    await expect(canonical.json()).resolves.toMatchObject({
      error: { code: 'CLAIM_DISABLED', message: REFUSAL },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('owner claim refused'));
    expect(await ownerOf('anon-course')).toBe(ANON);

    // The storage router decodes each path segment, so this spelling reaches the same merge.
    const spelled = await merge('/api/persistence/runtime/learners/%6Derge');
    expect(spelled.status).toBe(403);
    expect(await ownerOf('anon-course')).toBe(ANON);
  });

  it('claims as before with accounts off: the claim route moves the anonymous work', async () => {
    const response = await claim();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'claimed' });
    expect(await ownerOf('anon-course')).toBe(ALICE);
  });

  it('merges as before with accounts off: the learner merge claims the anonymous work', async () => {
    const response = await merge();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ moved: 0 });
    expect(await ownerOf('anon-course')).toBe(ALICE);
  });
});
