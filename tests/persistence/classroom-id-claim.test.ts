import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A course generated on the server exists first as `data/classrooms/<id>.json` with its owner in
 * `<id>.access.json`; its server document appears the first time someone opens it, because the
 * classroom fallback saves what it fetched under the same id (a document `create`). That first
 * save claims `stage_meta` for whoever makes it, so it must only be the classroom's own owner.
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

const TIMEOUT = 60_000;
const COURSE = 'course-alice-owned-0001';
const ORPHAN = 'course-without-owner-0001';

let pool: PGlitePool;
let workDir = '';

function scene(stageId: string, order: number) {
  return {
    id: `${stageId}-scene-${order}`,
    stageId,
    title: `Slide ${order}`,
    order,
    type: 'interactive',
    content: { type: 'interactive', html: `<p>Slide ${order}</p>` },
  };
}

function classroom(stageId: string, name: string) {
  const now = 1_800_000_000_000;
  return {
    stage: { id: stageId, name, createdAt: now, updatedAt: now },
    scenes: [scene(stageId, 1), scene(stageId, 2)],
  };
}

/** The body the classroom fallback saves: the fetched classroom as a document. */
function fallbackDocument(stageId: string, name: string) {
  const now = 1_800_000_000_000;
  return {
    ...classroom(stageId, name),
    outline: {
      outlines: [],
      requirement: '',
      generationComplete: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function member(username: string) {
  const { registerAccount, accountOwnerId } = await import('@/lib/server/accounts/service');
  const { DEFAULT_LOGIN_THROTTLE, LoginThrottle } =
    await import('@/lib/server/accounts/login-throttle');
  const { sessionCookieHeader } = await import('@/lib/server/accounts/session');
  const session = await registerAccount(
    {
      db: pool as never,
      throttle: new LoginThrottle(DEFAULT_LOGIN_THROTTLE),
      registrationOpen: true,
    },
    { username, password: 'correct-horse-battery' },
  );
  await pool.query(
    `INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by)
     VALUES ($1, 'active', now() + interval '30 days', 1000000, 'test')`,
    [session.accountId],
  );
  return {
    cookie: sessionCookieHeader(session.token).split(';')[0]!,
    ownerId: accountOwnerId(session.accountId),
  };
}

async function persistence(
  pathName: string,
  cookie: string,
  init: { method?: string; body?: unknown } = {},
) {
  const { handlePersistenceRequest } = await import('@/app/api/persistence/[...path]/route');
  const headers: Record<string, string> = { cookie };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return handlePersistenceRequest(
    new Request(`http://localhost/api/persistence${pathName}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    { poolFactory: () => pool as never },
  );
}

async function stageMeta(stageId: string, cookie: string) {
  const { GET } = await import('@/app/api/stage-meta/[stageId]/route');
  return GET(
    new NextRequest(`http://localhost/api/stage-meta/${stageId}`, { headers: { cookie } }),
    {
      params: Promise.resolve({ stageId }),
    },
  );
}

describe('first save of a classroom id', () => {
  beforeEach(async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'classroom-claim-'));
    // Classroom files live under `<cwd>/data/classrooms`; keep them in a scratch folder.
    vi.spyOn(process, 'cwd').mockReturnValue(workDir);
    vi.resetModules();
    vi.unstubAllEnvs();
    await (await import('../helpers/account-owner-auth')).useAccountOwnerAuthentication();
    const connectionString = `postgres://classroom-claim-${randomUUID()}`;
    vi.stubEnv('DATABASE_URL', connectionString);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    pool = new PGlitePool(new PGlite());
    await pool.db.waitReady;
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    await getServerPersistenceProvider(connectionString, () => pool as never);
  }, TIMEOUT);

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await pool.end();
    await rm(workDir, { recursive: true, force: true });
  });

  it(
    'leaves a shared course with scenes to its recorded owner when a reader opens it first',
    async () => {
      const alice = await member('alice-author');
      const bob = await member('bob-reader');
      const { persistClassroom } = await import('@/lib/server/classroom-storage');
      await persistClassroom({ id: COURSE, ...classroom(COURSE, 'Fractions') } as never, '', {
        ownerId: alice.ownerId,
      });
      await pool.query(
        `INSERT INTO course_shares (course_id, owner_id, title, state) VALUES ($1, $2, 'Fractions', 'shared')`,
        [COURSE, alice.ownerId],
      );

      // Bob opens the course first: his classroom fallback saves it under the same id.
      const claim = await persistence(`/documents/${COURSE}`, bob.cookie, {
        method: 'PUT',
        body: fallbackDocument(COURSE, 'Fractions'),
      });
      expect(claim.status).toBe(403);
      // Before any document exists the sidecar answers from the classroom file, so Bob's page is
      // read-only instead of editable with every save refused.
      await expect((await stageMeta(COURSE, bob.cookie)).json()).resolves.toMatchObject({
        isOwner: false,
      });
      await expect((await stageMeta(COURSE, alice.cookie)).json()).resolves.toMatchObject({
        isOwner: true,
      });

      // Alice's own first open creates the document under her, and readers see hers.
      const own = await persistence(`/documents/${COURSE}`, alice.cookie, {
        method: 'PUT',
        body: fallbackDocument(COURSE, 'Fractions'),
      });
      expect(own.status).toBe(204);
      await expect((await stageMeta(COURSE, alice.cookie)).json()).resolves.toMatchObject({
        isOwner: true,
      });
      await expect((await stageMeta(COURSE, bob.cookie)).json()).resolves.toMatchObject({
        isOwner: false,
      });
      const rename = await persistence(`/documents/${COURSE}/stage`, bob.cookie, {
        method: 'PUT',
        body: { ...classroom(COURSE, 'Defaced').stage },
      });
      expect(rename.status).toBe(403);

      // An id with no classroom file is still the creator's.
      const fresh = await persistence('/documents/bob-own-course-0001', bob.cookie, {
        method: 'PUT',
        body: fallbackDocument('bob-own-course-0001', 'Mine'),
      });
      expect(fresh.status).toBe(204);
    },
    TIMEOUT,
  );

  it(
    'lets nobody claim a classroom file that has no recorded owner',
    async () => {
      const bob = await member('bob-orphan');
      const { persistClassroom } = await import('@/lib/server/classroom-storage');
      await persistClassroom({ id: ORPHAN, ...classroom(ORPHAN, 'Preview') } as never, '');
      await pool.query(`INSERT INTO course_previews (course_id, marked_by) VALUES ($1, 'staff')`, [
        ORPHAN,
      ]);

      const claim = await persistence(`/documents/${ORPHAN}`, bob.cookie, {
        method: 'PUT',
        body: fallbackDocument(ORPHAN, 'Preview'),
      });
      expect(claim.status).toBe(403);
      await expect((await stageMeta(ORPHAN, bob.cookie)).json()).resolves.toMatchObject({
        isOwner: false,
      });
    },
    TIMEOUT,
  );

  it(
    'answers from the classroom file only for a reader, and never after the document was deleted',
    async () => {
      const alice = await member('alice-private');
      const bob = await member('bob-stranger');
      const { persistClassroom } = await import('@/lib/server/classroom-storage');
      // Not shared, not previewed: Bob may not read it, so the id stays an unknown one for him.
      await persistClassroom({ id: COURSE, ...classroom(COURSE, 'Private') } as never, '', {
        ownerId: alice.ownerId,
      });
      expect((await stageMeta(COURSE, bob.cookie)).status).toBe(404);

      // Once the document exists and is tombstoned, the file does not bring the course back.
      const own = await persistence(`/documents/${COURSE}`, alice.cookie, {
        method: 'PUT',
        body: fallbackDocument(COURSE, 'Private'),
      });
      expect(own.status).toBe(204);
      const gone = await persistence(`/documents/${COURSE}`, alice.cookie, { method: 'DELETE' });
      expect(gone.status).toBe(204);
      expect((await stageMeta(COURSE, alice.cookie)).status).toBe(404);
    },
    TIMEOUT,
  );
});
