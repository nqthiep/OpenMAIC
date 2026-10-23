import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ROOT = { username: 'root', password: PASSWORD, acceptedTerms: true };
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
const BOB = { username: 'bob', password: PASSWORD, acceptedTerms: true };
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;

// Course facts live on disk in the real app. Here they are a map: course id -> owner and title.
const courses = new Map<string, { ownerId: string; title: string }>();

vi.mock('@/lib/server/classroom-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/classroom-storage')>();
  return {
    ...actual,
    readClassroomAccess: async (id: string) => {
      const course = courses.get(id);
      return course ? { ownerId: course.ownerId } : undefined;
    },
    readClassroom: async (id: string) => {
      const course = courses.get(id);
      return course ? { id, stage: { id, name: course.title }, scenes: [], createdAt: '' } : null;
    },
  };
});

let db: PGlite | undefined;

class PGlitePool {
  constructor(private readonly database: PGlite) {}

  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await ensureAccountSchema(new PGlitePool(db));
  await ensureLearningSchema(new PGlitePool(db));
}, ROUTE_TIMEOUT_MS);

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://course-tags-route-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  courses.clear();
  await db!.exec(
    'TRUNCATE course_tags, badges, quota_bonus, course_reads, class_courses, class_members, classes, course_previews, course_shares, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.close();
  db = undefined;
});

async function loadRoutes() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, share, shareList, shareDecide, previews, grant, catalog, tags, audit] =
    await Promise.all([
      import('@/app/api/auth/register/route'),
      import('@/app/api/courses/[id]/share/route'),
      import('@/app/api/admin/shares/route'),
      import('@/app/api/admin/shares/[id]/route'),
      import('@/app/api/admin/previews/route'),
      import('@/app/api/admin/memberships/[id]/route'),
      import('@/app/api/catalog/route'),
      import('@/app/api/admin/courses/[id]/tags/route'),
      import('@/app/api/admin/audit/route'),
    ]);
  return {
    register: register.POST,
    sharePost: share.POST,
    shareList: shareList.GET,
    shareDecide: shareDecide.POST,
    previewList: previews.GET,
    previewSet: previews.POST,
    memberGrant: grant.POST,
    catalog: catalog.GET,
    setTags: tags.PUT,
    audit: audit.GET,
  };
}

type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(path: string, method: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method, headers, body: JSON.stringify(body) });
}

function getRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined);
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return setCookie!.split(';')[0]!;
}

async function signUp(routes: Routes, account: { username: string; password: string }) {
  return cookieFrom(await routes.register(jsonRequest('/api/auth/register', 'POST', account)));
}

async function idOf(username: string): Promise<string> {
  const result = await db!.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [
    username,
  ]);
  return result.rows[0]!.id;
}

async function json(
  response: Response,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return {
    status: response.status,
    body: (await response.clone().json()) as Record<string, unknown>,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

type CatalogCourse = { courseId: string; tags?: string[] };

/** Alice has a membership, shares `shared-1` (approved) and `pending-1` (waiting), and root marks `prev-1`. */
async function arrange() {
  const routes = await loadRoutes();
  const root = await signUp(routes, ROOT);
  const alice = await signUp(routes, ALICE);
  const bob = await signUp(routes, BOB);
  const owner = `acct:${await idOf('alice')}`;
  for (const id of ['shared-1', 'pending-1', 'prev-1'])
    courses.set(id, { ownerId: owner, title: id });
  await routes.memberGrant(
    jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
    params(await idOf('alice')),
  );
  for (const id of ['shared-1', 'pending-1']) {
    await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params(id));
  }
  await routes.shareDecide(
    jsonRequest('/x', 'POST', { decision: 'approve' }, root),
    params('shared-1'),
  );
  await routes.previewSet(jsonRequest('/x', 'POST', { courseId: 'prev-1', on: true }, root));
  await routes.memberGrant(
    jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
    params(await idOf('bob')),
  );
  return { routes, root, alice, bob };
}

describe('course tags', () => {
  it('only staff set tags, and only for a shared or preview course', async () => {
    const { routes, root, alice } = await arrange();
    const tags = { tags: ['subject:math', 'grade:12'] };

    const byLearner = await json(
      await routes.setTags(jsonRequest('/x', 'PUT', tags, alice), params('shared-1')),
    );
    expect(byLearner.status).toBe(403);
    const anonymous = await json(
      await routes.setTags(jsonRequest('/x', 'PUT', tags), params('shared-1')),
    );
    expect([401, 403]).toContain(anonymous.status);

    courses.set('private-1', { ownerId: 'acct:x', title: 'private' });
    const unlisted = await json(
      await routes.setTags(jsonRequest('/x', 'PUT', tags, root), params('private-1')),
    );
    expect(unlisted.status).toBe(404);

    const ok = await json(
      await routes.setTags(jsonRequest('/x', 'PUT', tags, root), params('shared-1')),
    );
    expect(ok).toMatchObject({ status: 200, body: { tags: ['subject:math', 'grade:12'] } });
  });

  it('refuses a bad tag list', async () => {
    const { routes, root } = await arrange();
    const put = async (body: unknown) =>
      (await json(await routes.setTags(jsonRequest('/x', 'PUT', body, root), params('shared-1'))))
        .status;

    expect(await put({})).toBe(400);
    expect(await put({ tags: 'subject:math' })).toBe(400);
    expect(await put({ tags: ['subject:art'] })).toBe(400);
    expect(await put({ tags: ['subject:math', 'subject:physics'] })).toBe(400);
    expect(await put({ tags: ['subject:math', 'topic:physics.waves'] })).toBe(400);
    expect(await put({ tags: ['topic:math.limits'] })).toBe(400);
    expect(await put({ tags: [1] })).toBe(400);
  });

  it('shows the tags to staff in both lists and to learners in the catalog, and clears them', async () => {
    const { routes, root, bob } = await arrange();
    const tag = async (id: string, tags: string[]) =>
      routes.setTags(jsonRequest('/x', 'PUT', { tags }, root), params(id));
    await tag('shared-1', ['topic:math.derivative', 'grade:12', 'subject:math']);
    await tag('prev-1', ['subject:english']);
    // A pending request can be tagged before it is approved; the catalog does not list it yet.
    await tag('pending-1', ['subject:physics']);

    const pending = await json(
      await routes.shareList(getRequest('/api/admin/shares?state=pending', root)),
    );
    expect(pending.body.shares).toEqual([
      expect.objectContaining({ courseId: 'pending-1', tags: ['subject:physics'] }),
    ]);
    const previews = await json(await routes.previewList(getRequest('/api/admin/previews', root)));
    expect(previews.body.previews).toEqual([
      expect.objectContaining({ courseId: 'prev-1', tags: ['subject:english'] }),
    ]);

    const byId = async (cookie?: string) =>
      Object.fromEntries(
        (
          (await json(await routes.catalog(getRequest('/api/catalog', cookie)))).body
            .courses as CatalogCourse[]
        ).map((c) => [c.courseId, c.tags]),
      );
    expect(await byId(bob)).toEqual({
      'prev-1': ['subject:english'],
      'shared-1': ['subject:math', 'grade:12', 'topic:math.derivative'],
    });
    // A guest sees the preview's tags too.
    expect(await byId()).toEqual({ 'prev-1': ['subject:english'] });

    await tag('shared-1', []);
    expect((await byId(bob))['shared-1']).toBeUndefined();
  });

  it('writes one audit row per real change and none for the same tags again', async () => {
    const { routes, root } = await arrange();
    const put = (tags: string[]) =>
      routes.setTags(jsonRequest('/x', 'PUT', { tags }, root), params('shared-1'));
    await put(['subject:math']);
    await put(['subject:math']);
    await put(['subject:math', 'grade:11']);

    const audit = await json(await routes.audit(getRequest('/api/admin/audit', root)));
    const rows = (audit.body.entries as Array<{ action: string; reason: string | null }>).filter(
      (entry) => entry.action === 'course:tags',
    );
    expect(rows.map((row) => row.reason)).toEqual(['subject:math, grade:11', 'subject:math']);
  });
});
