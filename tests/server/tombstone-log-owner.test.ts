import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { PgDocumentStore } from '@openmaic/storage/document/pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { createOwnerBoundDocumentStore } from '@/lib/persistence/owner-bound-document-store';

// An in-memory PostgreSQL starts slowly under a loaded test run.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

/** PGlite behind the `pg` Pool surface the document store uses. One connection, so a client is the database. */
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

const OWNER = `anon:${randomUUID()}`;

function courseDocument(stageId: string) {
  const now = 1_800_000_000_000;
  return {
    stage: { id: stageId, name: `Course ${stageId}`, createdAt: now, updatedAt: now },
    scenes: [],
    outline: {
      outlines: [],
      requirement: stageId,
      generationComplete: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe('the warning for a deleted course whose assets were not withdrawn', () => {
  let pool: PGlitePool;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', `postgres://tombstone-log-${randomUUID()}`);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    vi.stubEnv('OPENMAIC_AGENT_RUNTIME_ENABLED', 'true');
    const db = new PGlite();
    await db.waitReady;
    pool = new PGlitePool(db);
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(process.env.DATABASE_URL!, () => pool as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await pool.end();
    vi.unstubAllEnvs();
  });

  it('names the stage and leaves the owner id out of the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The branch is unreachable while the schema holds (the stage's document row is always there),
    // so the withdrawal is made to report that nothing was released.
    vi.spyOn(PgDocumentStore.prototype, 'withdrawAssetReferences').mockResolvedValue(false);
    const store = createOwnerBoundDocumentStore({
      pool: pool as never,
      ownerId: OWNER,
      validateScene: validateAppScene,
      validateStage: validateAppStage,
    });
    await store.saveDocument(courseDocument('tombstone-course'));

    await store.deleteDocument('tombstone-course');

    const logged = warn.mock.calls.map((call) => call.map(String).join(' '));
    expect(logged).toContainEqual(expect.stringContaining('Tombstoned stage tombstone-course'));
    expect(logged.join('\n')).not.toContain(OWNER);
  });
});
