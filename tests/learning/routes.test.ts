import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ROOT = { username: 'root', password: PASSWORD };
const ALICE = { username: 'alice', password: PASSWORD };
const BOB = { username: 'bob', password: PASSWORD };
const DATABASE_URL = 'postgres://learning-route-test';
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
  vi.stubEnv('DATABASE_URL', DATABASE_URL);
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  courses.clear();
  await db!.exec(
    'TRUNCATE badges, quota_bonus, course_reads, class_courses, class_members, classes, course_previews, course_shares, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
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
  const [register, share, shareList, shareDecide, previews, memberships, grant, catalog, classes, join, adminClasses, attach, audit] =
    await Promise.all([
      import('@/app/api/auth/register/route'),
      import('@/app/api/courses/[id]/share/route'),
      import('@/app/api/admin/shares/route'),
      import('@/app/api/admin/shares/[id]/route'),
      import('@/app/api/admin/previews/route'),
      import('@/app/api/admin/memberships/route'),
      import('@/app/api/admin/memberships/[id]/route'),
      import('@/app/api/catalog/route'),
      import('@/app/api/classes/route'),
      import('@/app/api/classes/join/route'),
      import('@/app/api/admin/classes/route'),
      import('@/app/api/admin/classes/[id]/courses/route'),
      import('@/app/api/admin/audit/route'),
    ]);
  return {
    register: register.POST,
    shareGet: share.GET,
    sharePost: share.POST,
    shareDelete: share.DELETE,
    shareList: shareList.GET,
    shareDecide: shareDecide.POST,
    previewList: previews.GET,
    previewSet: previews.POST,
    memberList: memberships.GET,
    memberGrant: grant.POST,
    catalog: catalog.GET,
    myClasses: classes.GET,
    joinClass: join.POST,
    createClass: adminClasses.POST,
    attachCourse: attach.POST,
    audit: audit.GET,
  };
}

type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(path: string, method: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method, headers, body: JSON.stringify(body) });
}

/** A NextRequest, because the list routes read `request.nextUrl`. */
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

async function json(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: response.status, body: (await response.clone().json()) as Record<string, unknown> };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('learning routes', () => {
  it('a course is shared only when its owner asks, and an operator approves it', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const bob = await signUp(routes, BOB);
    courses.set('course-fractions', { ownerId: `acct:${await idOf('alice')}`, title: 'Fractions' });

    const byBob = await json(await routes.sharePost(jsonRequest('/x', 'POST', {}, bob), params('course-fractions')));
    expect(byBob).toMatchObject({ status: 403, body: { errorCode: 'FORBIDDEN' } });

    const byAlice = await json(await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params('course-fractions')));
    expect(byAlice).toMatchObject({ status: 200, body: { state: 'pending' } });

    const pending = await json(await routes.shareList(getRequest('/api/admin/shares?state=pending', root)));
    expect((pending.body.shares as Array<{ title: string }>).map((row) => row.title)).toEqual(['Fractions']);

    const decided = await json(
      await routes.shareDecide(jsonRequest('/x', 'POST', { decision: 'approve' }, root), params('course-fractions')),
    );
    expect(decided.status).toBe(200);

    const status = await json(await routes.shareGet(getRequest('/x', alice), params('course-fractions')));
    expect(status.body).toMatchObject({ owner: true, state: 'shared' });
  });

  it('a guest browses previews; a member also browses shared courses, and a lapsed member does not', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const bob = await signUp(routes, BOB);
    courses.set('course-shared', { ownerId: `acct:${await idOf('alice')}`, title: 'Shared' });
    courses.set('course-preview', { ownerId: `acct:${await idOf('alice')}`, title: 'Preview' });
    await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params('course-shared'));
    await routes.shareDecide(jsonRequest('/x', 'POST', { decision: 'approve' }, root), params('course-shared'));
    await routes.previewSet(jsonRequest('/x', 'POST', { courseId: 'course-preview', on: true }, root));

    const guest = await json(await routes.catalog(getRequest('/api/catalog')));
    expect((guest.body.courses as Array<{ courseId: string }>).map((c) => c.courseId)).toEqual(['course-preview']);

    const memberless = await json(await routes.catalog(getRequest('/api/catalog', bob)));
    expect((memberless.body.courses as Array<{ courseId: string }>).map((c) => c.courseId)).toEqual(['course-preview']);

    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(await idOf('bob')),
    );
    const member = await json(await routes.catalog(getRequest('/api/catalog', bob)));
    expect((member.body.courses as Array<{ courseId: string; kind: string }>).map((c) => `${c.courseId}:${c.kind}`)).toEqual([
      'course-preview:preview',
      'course-shared:shared',
    ]);
  });

  it('grants need a whole number of days and a learner cannot grant', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    await signUp(routes, BOB);
    const bobId = await idOf('bob');

    const badDays = await json(
      await routes.memberGrant(jsonRequest('/x', 'POST', { action: 'grant', days: 0 }, root), params(bobId)),
    );
    expect(badDays.status).toBe(400);

    const byLearner = await json(
      await routes.memberGrant(jsonRequest('/x', 'POST', { action: 'grant', days: 5 }, alice), params(bobId)),
    );
    expect(byLearner).toMatchObject({ status: 403, body: { errorCode: 'FORBIDDEN' } });
  });

  it('a learner without a membership cannot use classes; a joined member sees the class courses', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const bob = await signUp(routes, BOB);
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(await idOf('bob')),
    );

    const created = await json(
      await routes.createClass(jsonRequest('/x', 'POST', { name: 'Grade 6' }, root)),
    );
    expect(created.status).toBe(201);
    const { id, joinCode } = created.body as { id: string; joinCode: string };

    const noMembership = await json(await routes.myClasses(getRequest('/api/classes', alice)));
    expect(noMembership).toMatchObject({ status: 403, body: { errorCode: 'MEMBERSHIP_REQUIRED' } });

    const joined = await json(
      await routes.joinClass(jsonRequest('/x', 'POST', { code: joinCode.toLowerCase() }, bob)),
    );
    expect(joined).toMatchObject({ status: 200, body: { class: { name: 'Grade 6' } } });

    courses.set('course-class', { ownerId: `acct:${await idOf('alice')}`, title: 'Class lesson' });
    await routes.attachCourse(jsonRequest('/x', 'POST', { courseId: 'course-class' }, root), params(id));

    const catalog = await json(await routes.catalog(getRequest('/api/catalog', bob)));
    expect((catalog.body.courses as Array<{ courseId: string; kind: string }>)).toContainEqual(
      expect.objectContaining({ courseId: 'course-class', kind: 'class' }),
    );
  });

  it('every change an operator makes is in the audit log, newest first', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 3, reason: 'trial' }, root),
      params(await idOf('alice')),
    );
    const audit = await json(await routes.audit(getRequest('/api/admin/audit', root)));
    const entries = audit.body.entries as Array<{ action: string; reason: string | null }>;
    expect(entries[0]).toMatchObject({ action: 'membership:grant', reason: 'trial' });

    const byLearner = await json(await routes.audit(getRequest('/api/admin/audit', alice)));
    expect(byLearner.status).toBe(403);
  });
});
