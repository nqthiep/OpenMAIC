import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { createOwnerBoundDocumentStore } from '@/lib/persistence/owner-bound-document-store';
import { StageAccessError } from '@/lib/persistence/stage-meta';

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

function courseDocument(id: string, name = 'Agent course') {
  const now = 1_800_000_000_000;
  return {
    stage: { id, name, createdAt: now, updatedAt: now },
    scenes: [],
    outline: {
      outlines: [],
      requirement: name,
      generationComplete: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function ownerStore(pool: PGlitePool, ownerId: string) {
  return createOwnerBoundDocumentStore({
    pool,
    ownerId,
    validateScene: validateAppScene,
    validateStage: validateAppStage,
  });
}

/** A single row read back from stage_meta after a delete. */
interface StageMetaTombstoneRow {
  deleted_at: string | Date | null;
}

describe('reference-fidelity stage access', () => {
  let pool: PGlitePool;
  const ownerCookie = '11111111-1111-4111-8111-111111111111';
  const visitorCookie = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', `postgres://stage-access-${randomUUID()}`);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    vi.stubEnv('OPENMAIC_AGENT_RUNTIME_ENABLED', 'true');
    const db = new PGlite();
    await db.waitReady;
    pool = new PGlitePool(db);
  });

  afterEach(async () => {
    await pool.end();
    vi.unstubAllEnvs();
  });

  it('loads an agent-created stage through the browser path using the same owner cookie', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    const provider = await getServerPersistenceProvider(connectionString, () => pool as never);
    const stageId = 'stage-agent-browser-regression';
    await ownerStore(pool, `anon:${ownerCookie}`).saveDocument(courseDocument(stageId));

    const { handlePersistenceRequest } = await import('@/app/api/persistence/[...path]/route');
    const response = await handlePersistenceRequest(
      new Request(`http://localhost/api/persistence/documents/${stageId}`, {
        headers: { cookie: `anonymous_id=${ownerCookie}` },
      }),
      { poolFactory: () => pool as never },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ stage: { id: stageId } });
    expect(provider.pool).toBe(pool);
  });

  it('keeps a draft to its owner, refuses foreign writes, and filters the owner library', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(connectionString, () => pool as never);
    const stageId = 'stage-capability-policy';
    const owner = ownerStore(pool, `anon:${ownerCookie}`);
    const visitor = ownerStore(pool, `anon:${visitorCookie}`);
    await owner.saveDocument(courseDocument(stageId));

    // A draft is absent to another owner, by id and by route, exactly as a missing course is.
    await expect(visitor.loadDocument(stageId)).resolves.toBeNull();
    await expect(
      visitor.saveDocument(courseDocument(stageId, 'Foreign edit')),
    ).rejects.toBeInstanceOf(StageAccessError);
    const { handlePersistenceRequest } = await import('@/app/api/persistence/[...path]/route');
    const readAs = (cookie: string, id: string) =>
      handlePersistenceRequest(
        new Request(`http://localhost/api/persistence/documents/${id}`, {
          headers: { cookie: `anonymous_id=${cookie}` },
        }),
        { poolFactory: () => pool as never },
      );
    const visitorRead = await readAs(visitorCookie, stageId);
    const missingRead = await readAs(visitorCookie, 'stage-capability-missing');
    expect(visitorRead.status).toBe(404);
    expect(await visitorRead.text()).toBe(await missingRead.text());

    // A create of a taken id is refused as forbidden; a missing id would be created instead.
    const foreignCreate = await handlePersistenceRequest(
      new Request(`http://localhost/api/persistence/documents/${stageId}`, {
        method: 'PUT',
        headers: {
          cookie: `anonymous_id=${visitorCookie}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(courseDocument(stageId, 'Foreign edit')),
      }),
      { poolFactory: () => pool as never },
    );
    expect(foreignCreate.status).toBe(403);
    await expect(foreignCreate.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN_DOCUMENTS' },
    });

    // Another owner's draft answers a request as a missing course does: the same status, body
    // and headers (one request id for both).
    const sameAnswerAs = async (foreign: Promise<Response>, missing: Promise<Response>) => {
      const fromForeign = await foreign;
      const fromMissing = await missing;
      expect(fromForeign.status).toBe(fromMissing.status);
      expect(await fromForeign.text()).toBe(await fromMissing.text());
      expect(Object.fromEntries(fromForeign.headers)).toEqual(
        Object.fromEntries(fromMissing.headers),
      );
      return fromForeign.status;
    };
    const writeAs = (id: string) =>
      handlePersistenceRequest(
        new Request(`http://localhost/api/persistence/documents/${id}/stage`, {
          method: 'PUT',
          headers: {
            cookie: `anonymous_id=${visitorCookie}`,
            'content-type': 'application/json',
            'x-request-id': 'fidelity-write',
          },
          body: JSON.stringify(courseDocument(id, 'Foreign edit').stage),
        }),
        { poolFactory: () => pool as never },
      );
    const deleteAs = (id: string) =>
      handlePersistenceRequest(
        new Request(`http://localhost/api/persistence/documents/${id}`, {
          method: 'DELETE',
          headers: { cookie: `anonymous_id=${visitorCookie}`, 'x-request-id': 'fidelity-delete' },
        }),
        { poolFactory: () => pool as never },
      );
    // A write and a delete answer 404 as a missing course does.
    expect(await sameAnswerAs(writeAs(stageId), writeAs('stage-capability-missing'))).toBe(404);
    expect(await sameAnswerAs(deleteAs(stageId), deleteAs('stage-capability-missing'))).toBe(404);
    await expect(owner.loadDocument(stageId)).resolves.toMatchObject({ stage: { id: stageId } });

    const { GET: listStages } = await import('@/app/api/stages/route');
    const ownerList = await listStages(
      new NextRequest('http://localhost/api/stages', {
        headers: { cookie: `anonymous_id=${ownerCookie}` },
      }),
    );
    const visitorList = await listStages(
      new NextRequest('http://localhost/api/stages', {
        headers: { cookie: `anonymous_id=${visitorCookie}` },
      }),
    );
    await expect(ownerList.json()).resolves.toMatchObject({
      stages: [expect.objectContaining({ id: stageId })],
    });
    await expect(visitorList.json()).resolves.toEqual({ stages: [] });

    // Published, the course opens to the visitor by id.
    await pool.query('UPDATE stage_meta SET is_public = true WHERE stage_id = $1', [stageId]);
    await expect(visitor.loadDocument(stageId)).resolves.toMatchObject({ stage: { id: stageId } });
    expect((await readAs(visitorCookie, stageId)).status).toBe(200);
  });

  it('answers the status and stage-meta routes to another owner as a missing course, until published', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(connectionString, () => pool as never);
    const stageId = 'stage-status-policy';
    await ownerStore(pool, `anon:${ownerCookie}`).saveDocument(courseDocument(stageId));
    const { GET: status } = await import('@/app/api/stages/[id]/status/route');
    const { GET: stageMeta } = await import('@/app/api/stage-meta/[stageId]/route');
    const request = (cookie: string, path: string) =>
      new NextRequest(`http://localhost${path}`, { headers: { cookie: `anonymous_id=${cookie}` } });
    const statusOf = (cookie: string, id: string) =>
      status(request(cookie, `/api/stages/${id}/status`), { params: Promise.resolve({ id }) });
    const metaOf = (cookie: string, id: string) =>
      stageMeta(request(cookie, `/api/stage-meta/${id}`), {
        params: Promise.resolve({ stageId: id }),
      });

    for (const read of [statusOf, metaOf]) {
      const foreign = await read(visitorCookie, stageId);
      const missing = await read(visitorCookie, 'stage-status-missing');
      expect(foreign.status).toBe(404);
      expect(await foreign.text()).toBe(await missing.text());
    }
    await expect(statusOf(ownerCookie, stageId).then((res) => res.json())).resolves.toEqual({
      isPublic: false,
      publishedAt: null,
    });
    await expect(metaOf(ownerCookie, stageId).then((res) => res.json())).resolves.toMatchObject({
      isOwner: true,
      source: 'document',
    });

    await pool.query('UPDATE stage_meta SET is_public = true WHERE stage_id = $1', [stageId]);
    await expect(statusOf(visitorCookie, stageId).then((res) => res.json())).resolves.toEqual({
      isPublic: true,
      publishedAt: null,
    });
    const visitorMeta = await (await metaOf(visitorCookie, stageId)).json();
    expect(visitorMeta).toMatchObject({ isOwner: false, isPublic: true });
    expect(visitorMeta).not.toHaveProperty('source');
  });

  it('tombstones deletions and permanently retires the stage id', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(connectionString, () => pool as never);
    const stageId = 'stage-retired-id';
    const owner = ownerStore(pool, `anon:${ownerCookie}`);
    await owner.saveDocument(courseDocument(stageId));
    await owner.deleteDocument(stageId);

    await expect(owner.loadDocument(stageId)).resolves.toBeNull();
    await expect(
      owner.saveDocument(courseDocument(stageId, 'Resurrection')),
    ).rejects.toBeInstanceOf(StageAccessError);
    const rows = await pool.query(
      `SELECT meta.deleted_at
         FROM stage_meta AS meta
         JOIN document_stages AS stages ON stages.id = meta.stage_id
        WHERE meta.stage_id = $1`,
      [stageId],
    );
    expect((rows.rows[0] as StageMetaTombstoneRow | undefined)?.deleted_at).not.toBeNull();
  });
});
