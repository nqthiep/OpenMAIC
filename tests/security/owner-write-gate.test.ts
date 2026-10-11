/**
 * Publication by another owner answers as a missing course does (Ngọc:SEC-01):
 * the same status, body and headers, so an id's existence stays hidden. Checked
 * through the publish, unpublish and generation-complete routes on PGlite. The
 * caller's owner comes from a header, and the course role is granted to it (the
 * identity seam is not under test).
 */
import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { createOwnerBoundDocumentStore } from '@/lib/persistence/owner-bound-document-store';
import type { OwnerPrincipal } from '@/lib/server/identity/types';

// An in-memory PostgreSQL starts slowly under a loaded test run.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

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

const OWNER = 'user:owner';
const OTHER = 'user:other';
const STAGE = 'stage-publish-owned';
const MISSING = 'stage-publish-missing';

type Action = (req: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function postAs(owner: string, id: string, action: string, handler: Action): Promise<Response> {
  return handler(
    new NextRequest(`http://localhost/api/stages/${id}/${action}`, {
      method: 'POST',
      headers: { 'x-test-owner': owner },
    }),
    { params: Promise.resolve({ id }) },
  );
}

function courseDocument(stageId: string) {
  const now = 1_800_000_000_000;
  return {
    stage: { id: stageId, name: 'Course', createdAt: now, updatedAt: now },
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

describe('publication by another owner, as for a missing course', () => {
  let pool: PGlitePool;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', `postgres://owner-write-gate-${randomUUID()}`);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    const db = new PGlite();
    await db.waitReady;
    pool = new PGlitePool(db);
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(process.env.DATABASE_URL!, () => pool as never);
    await createOwnerBoundDocumentStore({
      pool,
      ownerId: OWNER,
      validateScene: validateAppScene,
      validateStage: validateAppStage,
    }).saveDocument(courseDocument(STAGE));
  });

  afterEach(async () => {
    await pool.end();
    vi.unstubAllEnvs();
  });

  const isPublic = async () =>
    (await pool.query('SELECT is_public FROM stage_meta WHERE stage_id = $1', [STAGE])).rows;

  it('answers a foreign draft as a missing course, for publish, unpublish and generation-complete', async () => {
    const { POST: publish } = await import('@/app/api/stages/[id]/publish/route');
    const { POST: unpublish } = await import('@/app/api/stages/[id]/unpublish/route');
    const { POST: generationComplete } =
      await import('@/app/api/stages/[id]/generation-complete/route');

    for (const [action, handler] of [
      ['publish', publish],
      ['unpublish', unpublish],
      ['generation-complete', generationComplete],
    ] as const) {
      const foreign = await postAs(OTHER, STAGE, action, handler);
      const missing = await postAs(OTHER, MISSING, action, handler);
      expect(foreign.status).toBe(404);
      expect(await foreign.text()).toBe(await missing.text());
      expect(Object.fromEntries(foreign.headers)).toEqual(Object.fromEntries(missing.headers));
    }
    await expect(isPublic()).resolves.toEqual([{ is_public: false }]);
  });

  it('answers another owner of a published course as a missing course, and keeps the owner’s rights', async () => {
    const { POST: publish } = await import('@/app/api/stages/[id]/publish/route');
    const { POST: unpublish } = await import('@/app/api/stages/[id]/unpublish/route');
    const { POST: generationComplete } =
      await import('@/app/api/stages/[id]/generation-complete/route');

    expect((await postAs(OWNER, STAGE, 'publish', publish)).status).toBe(200);
    const foreign = await postAs(OTHER, STAGE, 'unpublish', unpublish);
    const missing = await postAs(OTHER, MISSING, 'unpublish', unpublish);
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
    await expect(isPublic()).resolves.toEqual([{ is_public: true }]);

    expect((await postAs(OWNER, STAGE, 'generation-complete', generationComplete)).status).toBe(
      200,
    );
    expect((await postAs(OWNER, STAGE, 'unpublish', unpublish)).status).toBe(200);
    await expect(isPublic()).resolves.toEqual([{ is_public: false }]);
  });
});
