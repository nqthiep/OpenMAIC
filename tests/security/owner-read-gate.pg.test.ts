/**
 * Course reads by id on PostgreSQL (Ngọc:SEC-01).
 *
 * A draft answers its owner only; another owner reads a course once it is
 * published and not deleted. Checked through the owner-bound store, the stage
 * routes, and the persistence document route the browser reads through. The
 * caller's owner comes from a header (the identity seam is not under test).
 *
 * Runs when PG_CONTRACT_URL is set, and only against a database whose name ends
 * in _test or _contract. Every table lives in a schema this file creates and
 * drops.
 */
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { createOwnerBoundDocumentStore } from '@/lib/persistence/owner-bound-document-store';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { GET as persistenceGet } from '@/app/api/persistence/[...path]/route';
import * as learnStartRoute from '@/app/api/learn/start/route';
import * as publishRoute from '@/app/api/stages/[id]/publish/route';
import * as unpublishRoute from '@/app/api/stages/[id]/unpublish/route';
import * as stageRoute from '@/app/api/stages/[id]/route';
import * as scenesRoute from '@/app/api/stages/[id]/scenes/route';
import type { OwnerPrincipal } from '@/lib/server/identity/types';

vi.mock('@/lib/server/identity/with-owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/identity/with-owner')>();
  return {
    ...actual,
    withRequestOwner: async (
      req: Request,
      handler: (principal: OwnerPrincipal, headers: Headers) => Promise<Response>,
    ) => {
      const ownerId = req.headers.get('x-test-owner') ?? 'user:nobody';
      const principal: OwnerPrincipal = {
        ownerId,
        kind: 'user',
        roles: new Set(['course:publish']),
        assurance: 'verified',
      };
      return handler(principal, new Headers());
    },
  };
});

const contractUrl = process.env.PG_CONTRACT_URL;
const TEST_SCHEMA = 'openmaic_owner_read_test';
const AUTHOR = 'user:author';
const OTHER = 'user:other';
const LEARNER = 'user:learner';

function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!/_(test|contract)$/.test(name)) {
    throw new Error('PG_CONTRACT_URL must name a database whose name ends in _test or _contract');
  }
}

function call(owner: string, method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      'x-test-owner': owner,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const getStage = (owner: string, id: string) =>
  stageRoute.GET(call(owner, 'GET', `/api/stages/${id}`), withId(id));
const putStage = (owner: string, id: string, body: unknown) =>
  stageRoute.PUT(call(owner, 'PUT', `/api/stages/${id}`, body), withId(id));
const deleteStage = (owner: string, id: string) =>
  stageRoute.DELETE(call(owner, 'DELETE', `/api/stages/${id}`), withId(id));
const getScenes = (owner: string, id: string) =>
  scenesRoute.GET(call(owner, 'GET', `/api/stages/${id}/scenes?ids=scene-1`), withId(id));
const publish = (owner: string, id: string) =>
  publishRoute.POST(call(owner, 'POST', `/api/stages/${id}/publish`), withId(id));
const unpublish = (owner: string, id: string) =>
  unpublishRoute.POST(call(owner, 'POST', `/api/stages/${id}/unpublish`), withId(id));
const getDocument = (owner: string, id: string) =>
  persistenceGet(call(owner, 'GET', `/api/persistence/documents/${id}`));

describe.skipIf(!contractUrl)('course reads by id on PostgreSQL', () => {
  let admin: Pool;
  let pool: Pool;
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    ASSET_S3_BUCKET: process.env.ASSET_S3_BUCKET,
  };

  beforeAll(async () => {
    assertTestDatabase(contractUrl!);
    admin = new Pool({ connectionString: contractUrl });
    await admin.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    pool = new Pool({ connectionString: contractUrl, options: `-c search_path=${TEST_SCHEMA}` });
    const databaseUrl = `${contractUrl}${contractUrl!.includes('?') ? '&' : '?'}application_name=owner-read-test`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.ASSET_S3_BUCKET = '';
    await getServerPersistenceProvider(databaseUrl, () => pool);
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await admin.end();
  });

  function store(owner: string) {
    return createOwnerBoundDocumentStore({
      pool,
      ownerId: owner,
      validateScene: validateAppScene,
      validateStage: validateAppStage,
    });
  }

  function document(id: string, name: string) {
    return { stage: { id, name, createdAt: 1, updatedAt: 1 }, scenes: [] };
  }

  async function seed(id: string, owner: string) {
    await store(owner).saveDocument(document(id, 'Lớp học'));
  }

  it('lets the owner read a draft through the store and the stage route', async () => {
    await seed('stage-pg-draft', AUTHOR);

    expect((await getStage(AUTHOR, 'stage-pg-draft')).status).toBe(200);
    expect((await store(AUTHOR).loadDocument('stage-pg-draft'))?.stage.name).toBe('Lớp học');
  });

  it('gives another owner no draft, the same 404 as for a missing course', async () => {
    await seed('stage-pg-hidden', AUTHOR);

    const foreign = await getStage(OTHER, 'stage-pg-hidden');
    const missing = await getStage(OTHER, 'stage-pg-missing');
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
    expect((await getScenes(OTHER, 'stage-pg-hidden')).status).toBe(404);
    expect(await store(OTHER).loadDocument('stage-pg-hidden')).toBeNull();
    expect(await store(OTHER).readFreshnessManifest('stage-pg-hidden')).toBeNull();
    expect((await getDocument(OTHER, 'stage-pg-hidden')).status).toBe(404);
  });

  it('opens a published course to other owners, and closes it when unpublished', async () => {
    await seed('stage-pg-shared', AUTHOR);

    expect((await publish(AUTHOR, 'stage-pg-shared')).status).toBe(200);
    expect((await getStage(OTHER, 'stage-pg-shared')).status).toBe(200);
    expect((await getScenes(OTHER, 'stage-pg-shared')).status).toBe(200);
    expect(await store(OTHER).readFreshnessManifest('stage-pg-shared')).not.toBeNull();
    expect((await getDocument(OTHER, 'stage-pg-shared')).status).toBe(200);

    expect((await unpublish(AUTHOR, 'stage-pg-shared')).status).toBe(200);
    expect((await getStage(OTHER, 'stage-pg-shared')).status).toBe(404);
    expect((await getDocument(OTHER, 'stage-pg-shared')).status).toBe(404);
  });

  it('keeps a deleted course closed to other owners, even after it was published', async () => {
    await seed('stage-pg-gone', AUTHOR);
    await publish(AUTHOR, 'stage-pg-gone');

    expect((await deleteStage(AUTHOR, 'stage-pg-gone')).status).toBe(200);
    expect((await getStage(OTHER, 'stage-pg-gone')).status).toBe(404);
    expect((await getStage(AUTHOR, 'stage-pg-gone')).status).toBe(404);
  });

  it('answers a DELETE by another owner as absent, and deletes nothing', async () => {
    await seed('stage-pg-keep', AUTHOR);

    const foreign = await deleteStage(OTHER, 'stage-pg-keep');
    const missing = await deleteStage(OTHER, 'stage-pg-missing');
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
    expect((await getStage(AUTHOR, 'stage-pg-keep')).status).toBe(200);
  });

  it('refuses a PUT whose body names another course, and writes nothing', async () => {
    await seed('stage-pg-put', AUTHOR);

    const refused = await putStage(AUTHOR, 'stage-pg-put', document('stage-pg-other', 'Đổi tên'));
    expect(refused.status).toBe(400);
    expect((await store(AUTHOR).loadDocument('stage-pg-put'))?.stage.name).toBe('Lớp học');

    const saved = await putStage(AUTHOR, 'stage-pg-put', document('stage-pg-put', 'Đổi tên'));
    expect(saved.status).toBe(200);
    expect((await store(AUTHOR).loadDocument('stage-pg-put'))?.stage.name).toBe('Đổi tên');
  });

  it('keeps writes to a published course with its owner', async () => {
    await seed('stage-pg-owned', AUTHOR);
    await publish(AUTHOR, 'stage-pg-owned');

    const write = await putStage(OTHER, 'stage-pg-owned', document('stage-pg-owned', 'Chiếm'));
    expect(write.status).toBe(404);
    expect((await store(AUTHOR).loadDocument('stage-pg-owned'))?.stage.name).toBe('Lớp học');
  });

  it('lets the /learn student read the course the learn door made for them', async () => {
    const created = await learnStartRoute.POST(
      call(LEARNER, 'POST', '/api/learn/start', {
        walkthroughId: 'binary-search',
        locale: 'vi-VN',
        mode: 'lesson',
      }),
    );
    expect(created.status).toBe(201);
    const { stageId } = (await created.json()) as { stageId: string };

    expect((await getStage(LEARNER, stageId)).status).toBe(200);
    expect((await getStage(OTHER, stageId)).status).toBe(404);
  });

  it('logs a publish with the course id and no owner id', async () => {
    await seed('stage-pg-log', AUTHOR);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      expect((await publish(AUTHOR, 'stage-pg-log')).status).toBe(200);
      expect(info).toHaveBeenCalledWith('Stage published', { stageId: 'stage-pg-log' });
    } finally {
      info.mockRestore();
    }
  });
});
