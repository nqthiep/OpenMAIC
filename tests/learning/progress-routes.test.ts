import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ROOT = { username: 'root', password: PASSWORD, acceptedTerms: true };
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
const BOB = { username: 'bob', password: PASSWORD, acceptedTerms: true };
const DATABASE_URL = 'postgres://learning-progress-test';
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
    'TRUNCATE course_progress, course_previews, course_shares, class_courses, class_members, classes, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
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
  const [register, grant, previews, adminClasses, attach, join, progress, classProgress] =
    await Promise.all([
      import('@/app/api/auth/register/route'),
      import('@/app/api/admin/memberships/[id]/route'),
      import('@/app/api/admin/previews/route'),
      import('@/app/api/admin/classes/route'),
      import('@/app/api/admin/classes/[id]/courses/route'),
      import('@/app/api/classes/join/route'),
      import('@/app/api/progress/route'),
      import('@/app/api/admin/classes/[id]/progress/route'),
    ]);
  return {
    register: register.POST,
    memberGrant: grant.POST,
    previewSet: previews.POST,
    createClass: adminClasses.POST,
    attachCourse: attach.POST,
    joinClass: join.POST,
    putProgress: progress.PUT,
    getProgress: progress.GET,
    classProgress: classProgress.GET,
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

async function signUp(routes: Routes, account: { username: string; password: string }) {
  const response = await routes.register(jsonRequest('/api/auth/register', 'POST', account));
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return setCookie!.split(';')[0]!;
}

async function idOf(username: string): Promise<string> {
  const result = await db!.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [
    username,
  ]);
  return result.rows[0]!.id;
}

async function json(response: Response) {
  return {
    status: response.status,
    body: (await response.clone().json()) as Record<string, unknown>,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

interface Row {
  courseId: string;
  sceneId: string;
  sceneIndex: number;
  sceneCount: number;
  quizScore: number | null;
  doneAt: string | null;
}

/** Root, a member (bob) who joined a class that has one course attached, and a stranger (alice). */
async function setUp() {
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
  const { id: classId, joinCode } = created.body as { id: string; joinCode: string };
  await routes.joinClass(jsonRequest('/x', 'POST', { code: joinCode }, bob));
  courses.set('course-class', { ownerId: `acct:${await idOf('root')}`, title: 'Class lesson' });
  await routes.attachCourse(
    jsonRequest('/x', 'POST', { courseId: 'course-class' }, root),
    params(classId),
  );
  return { routes, root, alice, bob, classId };
}

const put = (
  routes: Routes,
  cookie: string | undefined,
  body: Record<string, unknown>,
): Promise<Response> => routes.putProgress(jsonRequest('/api/progress', 'PUT', body, cookie));

const reading = (sceneIndex: number, extra: Record<string, unknown> = {}) => ({
  courseId: 'course-class',
  sceneId: `scene-${sceneIndex}`,
  sceneIndex,
  sceneCount: 3,
  ...extra,
});

describe('progress routes', () => {
  it('records where a member stopped; the last scene marks the course done and the mark stays', async () => {
    const { routes, bob } = await setUp();

    expect((await put(routes, bob, reading(2))).status).toBe(200);
    const midway = await json(
      await routes.getProgress(getRequest('/api/progress?courseIds=course-class', bob)),
    );
    expect(midway.body.progress).toEqual([
      expect.objectContaining({
        courseId: 'course-class',
        sceneId: 'scene-2',
        sceneIndex: 2,
        sceneCount: 3,
        quizScore: null,
        doneAt: null,
      }),
    ]);

    await put(routes, bob, reading(3, { quizScore: 80 }));
    // Going back keeps the done mark; a later write without a score keeps the score.
    await put(routes, bob, reading(1));
    const after = await json(await routes.getProgress(getRequest('/api/progress', bob)));
    const [row] = after.body.progress as Row[];
    expect(row).toMatchObject({ sceneIndex: 1, quizScore: 80 });
    expect(row!.doneAt).not.toBeNull();
    expect(after.body.progress).toHaveLength(1);
  });

  it('a guest is asked to sign in, and a course the caller cannot read is 404', async () => {
    const { routes, alice, bob } = await setUp();
    courses.set('course-private', { ownerId: `acct:${await idOf('alice')}`, title: 'Mine' });

    expect(await json(await put(routes, undefined, reading(1)))).toMatchObject({
      status: 401,
      body: { errorCode: 'UNAUTHENTICATED' },
    });
    expect((await json(await routes.getProgress(getRequest('/api/progress')))).status).toBe(401);

    // Bob is no member of alice's private course; alice is no member of the class, so she has
    // no right to its course either.
    expect((await put(routes, bob, { ...reading(1), courseId: 'course-private' })).status).toBe(
      404,
    );
    expect((await put(routes, alice, reading(1))).status).toBe(404);
    const rows = await db!.query('SELECT 1 FROM course_progress');
    expect(rows.rows).toHaveLength(0);
  });

  it('a free preview can be recorded by a signed-in account without a membership', async () => {
    const { routes, root, alice } = await setUp();
    courses.set('course-preview', { ownerId: `acct:${await idOf('root')}`, title: 'Preview' });
    await routes.previewSet(
      jsonRequest('/x', 'POST', { courseId: 'course-preview', on: true }, root),
    );

    expect((await put(routes, alice, { ...reading(2), courseId: 'course-preview' })).status).toBe(
      200,
    );
  });

  it('refuses a malformed report', async () => {
    const { routes, bob } = await setUp();
    for (const bad of [
      { ...reading(4) }, // position past the scene count
      { ...reading(0) },
      { ...reading(1), sceneCount: 1.5 },
      { ...reading(1, { quizScore: 101 }) },
      { ...reading(1), sceneId: '' },
      { ...reading(1), courseId: '../etc' },
    ]) {
      expect((await put(routes, bob, bad)).status).toBe(400);
    }
    expect(
      (await json(await routes.getProgress(getRequest('/api/progress?courseIds=../x', bob))))
        .status,
    ).toBe(400);
  });

  it('a learner reads only their own rows', async () => {
    const { routes, root, alice, bob } = await setUp();
    courses.set('course-preview', { ownerId: `acct:${await idOf('root')}`, title: 'Preview' });
    await routes.previewSet(
      jsonRequest('/x', 'POST', { courseId: 'course-preview', on: true }, root),
    );
    await put(routes, bob, reading(2));
    await put(routes, alice, { ...reading(1), courseId: 'course-preview' });

    const mine = await json(await routes.getProgress(getRequest('/api/progress', alice)));
    expect((mine.body.progress as Row[]).map((row) => row.courseId)).toEqual(['course-preview']);
    const named = await json(
      await routes.getProgress(getRequest('/api/progress?courseIds=course-class', alice)),
    );
    expect(named.body.progress).toEqual([]);
  });

  it('staff see the members of a class in the courses attached to it; a learner does not', async () => {
    const { routes, root, bob, classId } = await setUp();
    // A course bob reads but that is not in the class stays out of the class view.
    courses.set('course-preview', { ownerId: `acct:${await idOf('root')}`, title: 'Preview' });
    await routes.previewSet(
      jsonRequest('/x', 'POST', { courseId: 'course-preview', on: true }, root),
    );
    await put(routes, bob, reading(3, { quizScore: 60 }));
    await put(routes, bob, { ...reading(1), courseId: 'course-preview' });

    const seen = await json(await routes.classProgress(getRequest('/x', root), params(classId)));
    expect(seen.body.progress).toEqual([
      expect.objectContaining({
        accountId: await idOf('bob'),
        courseId: 'course-class',
        sceneIndex: 3,
        quizScore: 60,
      }),
    ]);

    const refused = await json(await routes.classProgress(getRequest('/x', bob), params(classId)));
    expect(refused).toMatchObject({ status: 403, body: { errorCode: 'FORBIDDEN' } });
  });
});
