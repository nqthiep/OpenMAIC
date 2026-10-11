/**
 * The course library lists only what the read gate serves (Ngọc:SEC-01).
 *
 * A host library provider may name any course id. The listing keeps a course
 * only when the caller owns it, or when it is published and not deleted: the
 * rule `GET /api/stages/{id}` applies. PGlite runs the listing's own SQL.
 */
import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { summarizeLibraryStages } from '@/lib/persistence/library';
import { createOwnerBoundDocumentStore } from '@/lib/persistence/owner-bound-document-store';

// An in-memory PostgreSQL starts slowly under a loaded test run.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

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

const ALICE_COOKIE = '11111111-1111-4111-8111-111111111111';
const BOB_COOKIE = '22222222-2222-4222-8222-222222222222';
const ALICE = `anon:${ALICE_COOKIE}`;
const BOB = `anon:${BOB_COOKIE}`;
const IDS = ['lib-alice-draft', 'lib-alice-public', 'lib-alice-deleted', 'lib-bob-draft'];

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

describe('the course library lists what the read gate serves', () => {
  let pool: PGlitePool;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', `postgres://library-gate-${randomUUID()}`);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    vi.stubEnv('OPENMAIC_AGENT_RUNTIME_ENABLED', 'true');
    const db = new PGlite();
    await db.waitReady;
    pool = new PGlitePool(db);
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(process.env.DATABASE_URL!, () => pool as never);

    const store = (ownerId: string) =>
      createOwnerBoundDocumentStore({
        pool,
        ownerId,
        validateScene: validateAppScene,
        validateStage: validateAppStage,
      });
    await store(ALICE).saveDocument(courseDocument('lib-alice-draft'));
    await store(ALICE).saveDocument(courseDocument('lib-alice-public'));
    await store(ALICE).saveDocument(courseDocument('lib-alice-deleted'));
    await store(BOB).saveDocument(courseDocument('lib-bob-draft'));
    await pool.query(
      `UPDATE stage_meta SET is_public = true WHERE stage_id IN ('lib-alice-public', 'lib-alice-deleted')`,
    );
    await store(ALICE).deleteDocument('lib-alice-deleted');
  });

  afterEach(async () => {
    const { resetPersistenceHooksForTests } =
      await import('@/lib/server/persistence-hooks/registry');
    resetPersistenceHooksForTests();
    await pool.end();
    vi.unstubAllEnvs();
  });

  it('lists a course to another owner only while it is published and not deleted', async () => {
    const listedFor = async (ownerId: string) =>
      (await summarizeLibraryStages(pool as never, ownerId, IDS)).map((summary) => summary.id);

    expect(await listedFor(BOB)).toEqual(['lib-alice-public', 'lib-bob-draft']);
    expect(await listedFor(ALICE)).toEqual(['lib-alice-draft', 'lib-alice-public']);
  });

  it('keeps a host library provider from listing another owner’s draft on GET /api/stages', async () => {
    const { resetPersistenceHooksForTests } =
      await import('@/lib/server/persistence-hooks/registry');
    const { configurePersistenceHooks } = await import('@/lib/server/persistence-hooks');
    resetPersistenceHooksForTests();
    configurePersistenceHooks({
      name: 'test-host',
      library: { name: 'everything', list: async () => IDS },
    });

    const { GET } = await import('@/app/api/stages/route');
    const response = await GET(
      new NextRequest('http://localhost/api/stages', {
        headers: { cookie: `anonymous_id=${BOB_COOKIE}` },
      }),
    );
    const body = (await response.json()) as { stages: { id: string }[] };
    expect(body.stages.map((stage) => stage.id)).toEqual(['lib-alice-public', 'lib-bob-draft']);
  });
});
