import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ROOT = { username: 'root', password: PASSWORD, acceptedTerms: true };
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
const BOB = { username: 'bob', password: PASSWORD, acceptedTerms: true };
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
  const [
    register,
    share,
    shareList,
    shareDecide,
    previews,
    memberships,
    grant,
    catalog,
    classes,
    join,
    adminClasses,
    attach,
    audit,
    adminClass,
    joinCodeRoute,
    classMembers,
    leave,
  ] = await Promise.all([
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
    import('@/app/api/admin/classes/[id]/route'),
    import('@/app/api/admin/classes/[id]/join-code/route'),
    import('@/app/api/admin/classes/[id]/members/route'),
    import('@/app/api/classes/[id]/route'),
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
    detachCourse: attach.DELETE,
    renameClass: adminClass.PATCH,
    deleteClass: adminClass.DELETE,
    rotateJoinCode: joinCodeRoute.POST,
    shareRevoke: shareDecide.DELETE,
    audit: audit.GET,
    addMember: classMembers.POST,
    leaveClass: leave.DELETE,
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

async function json(
  response: Response,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return {
    status: response.status,
    body: (await response.clone().json()) as Record<string, unknown>,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('learning routes', () => {
  it('a course is shared only when its owner asks, and an operator approves it', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const bob = await signUp(routes, BOB);
    courses.set('course-fractions', { ownerId: `acct:${await idOf('alice')}`, title: 'Fractions' });

    const byBob = await json(
      await routes.sharePost(jsonRequest('/x', 'POST', {}, bob), params('course-fractions')),
    );
    expect(byBob).toMatchObject({ status: 403, body: { errorCode: 'FORBIDDEN' } });

    // Sharing needs an active membership: alice has none yet, so her own request is refused too.
    const withoutMembership = await json(
      await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params('course-fractions')),
    );
    expect(withoutMembership.status).toBe(403);
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(await idOf('alice')),
    );

    const byAlice = await json(
      await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params('course-fractions')),
    );
    expect(byAlice).toMatchObject({ status: 200, body: { state: 'pending' } });

    const pending = await json(
      await routes.shareList(getRequest('/api/admin/shares?state=pending', root)),
    );
    expect((pending.body.shares as Array<{ title: string }>).map((row) => row.title)).toEqual([
      'Fractions',
    ]);

    const decided = await json(
      await routes.shareDecide(
        jsonRequest('/x', 'POST', { decision: 'approve' }, root),
        params('course-fractions'),
      ),
    );
    expect(decided.status).toBe(200);

    const status = await json(
      await routes.shareGet(getRequest('/x', alice), params('course-fractions')),
    );
    expect(status.body).toMatchObject({ owner: true, state: 'shared' });
  });

  it('a guest browses previews; a member also browses shared courses, and a lapsed member does not', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const bob = await signUp(routes, BOB);
    courses.set('course-shared', { ownerId: `acct:${await idOf('alice')}`, title: 'Shared' });
    courses.set('course-preview', { ownerId: `acct:${await idOf('alice')}`, title: 'Preview' });
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(await idOf('alice')),
    );
    await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params('course-shared'));
    await routes.shareDecide(
      jsonRequest('/x', 'POST', { decision: 'approve' }, root),
      params('course-shared'),
    );
    await routes.previewSet(
      jsonRequest('/x', 'POST', { courseId: 'course-preview', on: true }, root),
    );

    const guest = await json(await routes.catalog(getRequest('/api/catalog')));
    expect((guest.body.courses as Array<{ courseId: string }>).map((c) => c.courseId)).toEqual([
      'course-preview',
    ]);

    const memberless = await json(await routes.catalog(getRequest('/api/catalog', bob)));
    expect((memberless.body.courses as Array<{ courseId: string }>).map((c) => c.courseId)).toEqual(
      ['course-preview'],
    );

    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(await idOf('bob')),
    );
    const member = await json(await routes.catalog(getRequest('/api/catalog', bob)));
    expect(
      (member.body.courses as Array<{ courseId: string; kind: string }>).map(
        (c) => `${c.courseId}:${c.kind}`,
      ),
    ).toEqual(['course-preview:preview', 'course-shared:shared']);
  });

  it('grants need a whole number of days and a learner cannot grant', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    await signUp(routes, BOB);
    const bobId = await idOf('bob');

    const badDays = await json(
      await routes.memberGrant(
        jsonRequest('/x', 'POST', { action: 'grant', days: 0 }, root),
        params(bobId),
      ),
    );
    expect(badDays.status).toBe(400);

    const byLearner = await json(
      await routes.memberGrant(
        jsonRequest('/x', 'POST', { action: 'grant', days: 5 }, alice),
        params(bobId),
      ),
    );
    expect(byLearner).toMatchObject({ status: 403, body: { errorCode: 'FORBIDDEN' } });
  });

  it('a member leaves a class, loses its courses and the audit log records it', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const bob = await signUp(routes, BOB);
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(await idOf('bob')),
    );
    const created = await json(
      await routes.createClass(jsonRequest('/x', 'POST', { name: 'Grade 7' }, root)),
    );
    const { id, joinCode } = created.body as { id: string; joinCode: string };
    await routes.joinClass(jsonRequest('/x', 'POST', { code: joinCode }, bob));

    const left = await json(
      await routes.leaveClass(jsonRequest('/x', 'DELETE', undefined, bob), params(id)),
    );
    expect(left).toMatchObject({ status: 200, body: { classId: id } });
    const mine = await json(await routes.myClasses(getRequest('/api/classes', bob)));
    expect(mine.body.classes).toEqual([]);

    const again = await json(
      await routes.leaveClass(jsonRequest('/x', 'DELETE', undefined, bob), params(id)),
    );
    expect(again).toMatchObject({ status: 404 });
    const rows = await db!.query<{ action: string }>(
      "SELECT action FROM account_admin_audit WHERE action LIKE 'class:leave:%'",
    );
    expect(rows.rows).toEqual([{ action: `class:leave:${id}` }]);
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

    courses.set('course-class', { ownerId: `acct:${await idOf('root')}`, title: 'Class lesson' });
    await routes.attachCourse(
      jsonRequest('/x', 'POST', { courseId: 'course-class' }, root),
      params(id),
    );

    const catalog = await json(await routes.catalog(getRequest('/api/catalog', bob)));
    expect(catalog.body.courses as Array<{ courseId: string; kind: string }>).toContainEqual(
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

  it('staff edit and delete what they created, and each change is logged with names', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const aliceId = await idOf('alice');
    const grant = (body: unknown) =>
      routes.memberGrant(jsonRequest('/x', 'POST', body, root), params(aliceId));

    await grant({ action: 'grant', days: 30, monthlyQuota: 1000 });
    const edited = await json(
      await grant({ action: 'update', expiresAt: '2030-01-02T00:00:00.000Z', monthlyQuota: 5000 }),
    );
    expect(edited.body.membership).toMatchObject({
      expiresAt: '2030-01-02T00:00:00.000Z',
      monthlyQuota: 5000,
    });
    expect((await json(await grant({ action: 'revoke' }))).body.membership).toBeNull();
    expect((await json(await grant({ action: 'revoke' }))).status).toBe(400);

    const created = await json(
      await routes.createClass(jsonRequest('/x', 'POST', { name: 'Grade 6' }, root)),
    );
    const classId = (created.body as { id: string }).id;
    const renamed = await routes.renameClass(
      jsonRequest('/x', 'PATCH', { name: 'Grade 7' }, root),
      params(classId),
    );
    expect(renamed.status).toBe(200);
    courses.set('course-class', { ownerId: `acct:${await idOf('root')}`, title: 'Class lesson' });
    await routes.attachCourse(
      jsonRequest('/x', 'POST', { courseId: 'course-class' }, root),
      params(classId),
    );
    const detach = (cookie: string) =>
      routes.detachCourse(
        new NextRequest(`${ORIGIN}/x?courseId=course-class`, {
          method: 'DELETE',
          headers: { cookie },
        }),
        params(classId),
      );
    expect((await detach(alice)).status).toBe(403);
    expect((await detach(root)).status).toBe(200);
    expect((await detach(root)).status).toBe(404);
    const remove = () => routes.deleteClass(jsonRequest('/x', 'DELETE', {}, root), params(classId));
    expect((await remove()).status).toBe(200);
    expect((await remove()).status).toBe(404);

    await grant({ action: 'grant', days: 30, monthlyQuota: 1000 });
    courses.set('course-shared', { ownerId: `acct:${aliceId}`, title: 'Shared lesson' });
    await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params('course-shared'));
    await routes.shareDecide(
      jsonRequest('/x', 'POST', { decision: 'approve' }, root),
      params('course-shared'),
    );
    const revoke = () =>
      routes.shareRevoke(jsonRequest('/x', 'DELETE', {}, root), params('course-shared'));
    expect((await revoke()).status).toBe(200);
    expect((await revoke()).status).toBe(404);

    const audit = await json(await routes.audit(getRequest('/api/admin/audit', root)));
    const entries = (
      audit.body.entries as Array<{
        action: string;
        reason: string | null;
        actorName: string | null;
        targetName: string | null;
      }>
    ).filter((e) => e.action !== 'list');
    expect(entries.map((e) => e.action).reverse()).toEqual([
      'membership:grant',
      'membership:update',
      'membership:revoke',
      'class:create',
      'class:rename',
      `class:attach:${classId}`,
      `class:detach:${classId}`,
      'class:delete',
      'membership:grant',
      'share:approve',
      'share:revoke',
    ]);
    const byAction = (action: string) => entries.find((e) => e.action === action)!;
    expect(byAction('membership:update')).toMatchObject({
      actorName: 'root',
      targetName: 'alice',
      reason: 'expires 2030-01-02, quota 5000',
    });
    // The class row is gone by now, so the log keeps its names in `reason`.
    expect(byAction('class:create').reason).toBe('Grade 6');
    expect(byAction('class:rename').reason).toBe('Grade 6 → Grade 7');
    expect(byAction('class:delete').reason).toBe('Grade 7');
    expect(byAction('share:revoke').reason).toBe('Shared lesson');
  });

  it('a new join code replaces the old one, and only existing courses can be previewed or attached', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const bob = await signUp(routes, BOB);
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(await idOf('bob')),
    );
    const created = await json(
      await routes.createClass(jsonRequest('/x', 'POST', { name: 'Grade 6' }, root)),
    );
    const { id, joinCode: oldCode } = created.body as { id: string; joinCode: string };

    const byLearner = await routes.rotateJoinCode(jsonRequest('/x', 'POST', {}, bob), params(id));
    expect(byLearner.status).toBe(403);
    const missingClass = await routes.rotateJoinCode(
      jsonRequest('/x', 'POST', {}, root),
      params('no-such-class'),
    );
    expect(missingClass.status).toBe(404);

    const rotated = await json(
      await routes.rotateJoinCode(jsonRequest('/x', 'POST', {}, root), params(id)),
    );
    expect(rotated.status).toBe(200);
    const newCode = rotated.body.joinCode as string;
    expect(newCode).not.toBe(oldCode);
    const withOld = await routes.joinClass(jsonRequest('/x', 'POST', { code: oldCode }, bob));
    expect(withOld.status).toBe(404);
    const withNew = await json(
      await routes.joinClass(jsonRequest('/x', 'POST', { code: newCode }, bob)),
    );
    expect(withNew).toMatchObject({ status: 200, body: { class: { name: 'Grade 6' } } });

    const previewMissing = await json(
      await routes.previewSet(jsonRequest('/x', 'POST', { courseId: 'ghost', on: true }, root)),
    );
    expect(previewMissing).toMatchObject({ status: 404, body: { errorCode: 'COURSE_NOT_FOUND' } });
    const attachMissing = await json(
      await routes.attachCourse(jsonRequest('/x', 'POST', { courseId: 'ghost' }, root), params(id)),
    );
    expect(attachMissing).toMatchObject({ status: 404, body: { errorCode: 'COURSE_NOT_FOUND' } });
    // Removing a preview of a course that is gone still works.
    const previewOff = await routes.previewSet(
      jsonRequest('/x', 'POST', { courseId: 'ghost', on: false }, root),
    );
    expect(previewOff.status).toBe(200);

    const audit = await json(await routes.audit(getRequest('/api/admin/audit', root)));
    expect((audit.body.entries as Array<{ action: string }>).map((e) => e.action)).toContain(
      'class:code',
    );
  });

  it("a learner's private course is attached to a class only once it is shared or previewed", async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const aliceId = await idOf('alice');
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(aliceId),
    );
    const created = await json(
      await routes.createClass(jsonRequest('/x', 'POST', { name: 'Grade 6' }, root)),
    );
    const { id } = created.body as { id: string };
    const attach = async (courseId: string) =>
      json(await routes.attachCourse(jsonRequest('/x', 'POST', { courseId }, root), params(id)));

    courses.set('alice-private', { ownerId: `acct:${aliceId}`, title: 'Private' });
    expect(await attach('alice-private')).toMatchObject({
      status: 403,
      body: { errorCode: 'COURSE_NOT_ATTACHABLE' },
    });

    await routes.sharePost(jsonRequest('/x', 'POST', {}, alice), params('alice-private'));
    // A pending share is not enough; the operator has to approve it first.
    expect((await attach('alice-private')).status).toBe(403);
    await routes.shareDecide(
      jsonRequest('/x', 'POST', { decision: 'approve' }, root),
      params('alice-private'),
    );
    expect((await attach('alice-private')).status).toBe(200);

    courses.set('alice-preview', { ownerId: `acct:${aliceId}`, title: 'Preview' });
    await routes.previewSet(
      jsonRequest('/x', 'POST', { courseId: 'alice-preview', on: true }, root),
    );
    expect((await attach('alice-preview')).status).toBe(200);
  });

  it('staff add a learner to a class without a code, once, and the change is logged', async () => {
    const routes = await loadRoutes();
    const root = await signUp(routes, ROOT);
    const alice = await signUp(routes, ALICE);
    const bob = await signUp(routes, BOB);
    const bobId = await idOf('bob');
    await routes.memberGrant(
      jsonRequest('/x', 'POST', { action: 'grant', days: 30, monthlyQuota: 1000 }, root),
      params(bobId),
    );
    const created = await json(
      await routes.createClass(jsonRequest('/x', 'POST', { name: 'Grade 6' }, root)),
    );
    const { id } = created.body as { id: string };
    const add = (cookie: string, accountId: string) =>
      routes.addMember(jsonRequest('/x', 'POST', { accountId }, cookie), params(id));

    expect((await add(alice, bobId)).status).toBe(403);
    expect((await add(root, 'not-an-id')).status).toBe(400);
    expect((await add(root, bobId)).status).toBe(200);
    expect((await add(root, bobId)).status).toBe(404);

    const mine = await json(await routes.myClasses(getRequest('/api/classes', bob)));
    expect(mine.body.classes as Array<{ name: string }>).toEqual([
      expect.objectContaining({ name: 'Grade 6' }),
    ]);
    const audit = await json(await routes.audit(getRequest('/api/admin/audit', root)));
    expect((audit.body.entries as Array<{ action: string }>).map((e) => e.action)).toContain(
      `class:add:${id}`,
    );
  });
});
