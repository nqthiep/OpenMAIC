import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;
const COURSE = 'course-derivatives';
const PRIVATE_COURSE = 'course-private';

// Course content lives on disk in the real app. Here one course with two scenes.
vi.mock('@/lib/server/classroom-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/classroom-storage')>();
  return {
    ...actual,
    readClassroom: async (id: string) =>
      id === COURSE || id === PRIVATE_COURSE
        ? {
            id,
            stage: { id, name: 'Derivatives' },
            createdAt: '',
            scenes: [
              {
                id: 'scene-1',
                title: 'Limits',
                type: 'slide',
                content: { type: 'slide', canvas: { elements: [] } },
                actions: [{ type: 'speech', text: 'A derivative is a limit.' }],
              },
            ],
          }
        : null,
  };
});

const llm = vi.hoisted(() => ({ calls: [] as Array<{ prompt: string }> }));
vi.mock('@/lib/ai/llm', () => ({
  callLLM: async (params: { prompt: string }) => {
    llm.calls.push(params);
    return { text: 'The derivative of |x| at 0 does not exist.' };
  },
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: async () => ({ model: {}, thinkingConfig: undefined }),
}));
vi.mock('@/lib/server/usage-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/usage-storage')>()),
  llmTokensBetween: async () => 0,
}));

class PGlitePool {
  constructor(private readonly database: PGlite) {}
  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

let db: PGlite | undefined;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await ensureAccountSchema(new PGlitePool(db));
  await ensureLearningSchema(new PGlitePool(db));
}, ROUTE_TIMEOUT_MS);

beforeEach(async () => {
  // The AI answer passes requireSpender, which answers 503 until the settings are loaded.
  useProviders();
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://community-route-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  llm.calls.length = 0;
  await db!.exec(
    'TRUNCATE community_bans, community_reports, answer_votes, course_answers, course_questions, course_previews, quota_bonus, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
  await db!.query(`INSERT INTO course_previews (course_id, marked_by) VALUES ($1, 'root')`, [
    COURSE,
  ]);
});

afterAll(async () => {
  clearProviders();
  vi.unstubAllEnvs();
  await db?.close();
  db = undefined;
});

async function loadRoutes() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, questions, question, ai, answer, reports, bans, courses] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/community/questions/route'),
    import('@/app/api/community/questions/[id]/route'),
    import('@/app/api/community/questions/[id]/ai/route'),
    import('@/app/api/community/answers/[id]/route'),
    import('@/app/api/community/reports/route'),
    import('@/app/api/community/bans/route'),
    import('@/app/api/community/courses/route'),
  ]);
  return {
    register: register.POST,
    list: questions.GET,
    ask: questions.POST,
    read: question.GET,
    answer: question.POST,
    update: question.PATCH,
    ai: ai.POST,
    vote: answer.POST,
    hideAnswer: answer.PATCH,
    reports: reports.GET,
    report: reports.POST,
    resolve: reports.PATCH,
    ban: bans.POST,
    scopes: courses.GET,
  };
}

type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(method: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/community`, { method, headers, body: JSON.stringify(body) });
}

function getRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined);
}

async function signUp(routes: Routes, username: string, member = false): Promise<string> {
  const response = await routes.register(
    jsonRequest('POST', { username, password: PASSWORD, acceptedTerms: true }),
  );
  if (member) {
    await db!.query(
      `INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by)
       SELECT id, 'active', now() + interval '30 days', 1000000, 'root' FROM accounts WHERE username = $1`,
      [username],
    );
  }
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return setCookie!.split(';')[0]!;
}

interface Body {
  id: string;
  errorCode: string;
  questions: Array<Record<string, unknown>>;
  hasMore: boolean;
  courses: Array<Record<string, unknown>>;
  answers: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  canPost: boolean;
  open: boolean;
  created: boolean;
  reward: number;
  votes: number;
  voted: boolean;
}

async function json(response: Response) {
  return { status: response.status, body: (await response.clone().json()) as Body };
}

const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

async function bonusOf(username: string): Promise<number> {
  const result = await db!.query<{ tokens: string }>(
    `SELECT b.tokens FROM quota_bonus b JOIN accounts a ON b.owner_id = 'acct:' || a.id WHERE a.username = $1`,
    [username],
  );
  return Number(result.rows[0]?.tokens ?? 0);
}

describe('community routes', () => {
  it(
    'members ask on an open course, the AI answers once, peers answer and vote, the best answer pays once',
    async () => {
      const routes = await loadRoutes();
      await signUp(routes, 'root');
      const alice = await signUp(routes, 'alice', true);
      const bob = await signUp(routes, 'bob', true);
      const carol = await signUp(routes, 'carol');

      // Reading is for every signed-in account; posting needs a membership.
      expect((await routes.list(getRequest('/api/community/questions'))).status).toBe(401);
      const carolList = await json(
        await routes.list(getRequest(`/api/community/questions?courseId=${COURSE}`, carol)),
      );
      expect(carolList.body).toMatchObject({ canPost: false, open: true, questions: [] });
      const carolAsk = await json(
        await routes.ask(jsonRequest('POST', { courseId: COURSE, title: 'Why?' }, carol)),
      );
      expect(carolAsk).toMatchObject({ status: 403, body: { errorCode: 'MEMBERSHIP_REQUIRED' } });

      // Only previews and shared courses are open to questions, and the scene must exist.
      const closed = await routes.ask(
        jsonRequest('POST', { courseId: PRIVATE_COURSE, title: 'Why?' }, alice),
      );
      expect(closed.status).toBe(403);
      const badScene = await routes.ask(
        jsonRequest('POST', { courseId: COURSE, sceneId: 'nope', title: 'Why?' }, alice),
      );
      expect(badScene.status).toBe(400);

      const asked = await json(
        await routes.ask(
          jsonRequest(
            'POST',
            {
              courseId: COURSE,
              sceneId: 'scene-1',
              title: 'Is |x| differentiable at 0?',
              body: '',
            },
            alice,
          ),
        ),
      );
      expect(asked.status).toBe(201);
      const id = asked.body.id;

      // The AI answer: asked for by the asker, written once, with the scene as context.
      expect((await routes.ai(jsonRequest('POST', {}, bob), params(id))).status).toBe(403);
      const first = await json(await routes.ai(jsonRequest('POST', {}, alice), params(id)));
      expect(first.body.created).toBe(true);
      expect(llm.calls[0]!.prompt).toContain('A derivative is a limit.');
      expect(llm.calls[0]!.prompt).toContain('Scene: Limits');
      const again = await json(await routes.ai(jsonRequest('POST', {}, alice), params(id)));
      expect(again.body.created).toBe(false);
      expect(llm.calls).toHaveLength(1);

      await routes.answer(
        jsonRequest('POST', { body: 'Left and right slopes differ.' }, bob),
        params(id),
      );
      const detail = await json(await routes.read(getRequest('/x', alice), params(id)));
      expect(detail.body.answers).toMatchObject([
        { fromAi: true, authorName: null },
        { fromAi: false, authorName: 'bob', votes: 0 },
      ]);
      const aiAnswerId = detail.body.answers[0]!.id as number;
      const bobAnswerId = detail.body.answers[1]!.id as number;

      // Votes: a member votes and takes it back; nobody votes for their own answer.
      expect((await routes.vote(jsonRequest('POST', {}, bob), params(bobAnswerId))).status).toBe(
        403,
      );
      const voted = await json(
        await routes.vote(jsonRequest('POST', {}, alice), params(bobAnswerId)),
      );
      expect(voted.body).toMatchObject({ votes: 1, voted: true });
      const unvoted = await json(
        await routes.vote(jsonRequest('POST', {}, alice), params(bobAnswerId)),
      );
      expect(unvoted.body).toMatchObject({ votes: 0, voted: false });

      // Best answer: only the asker picks; the first pick of a member's answer pays once.
      const byBob = await routes.update(
        jsonRequest('PATCH', { bestAnswerId: bobAnswerId }, bob),
        params(id),
      );
      expect(byBob.status).toBe(403);
      const paid = await json(
        await routes.update(jsonRequest('PATCH', { bestAnswerId: bobAnswerId }, alice), params(id)),
      );
      expect(paid.body.reward).toBe(5000);
      expect(await bonusOf('bob')).toBe(5000);
      await routes.update(jsonRequest('PATCH', { bestAnswerId: aiAnswerId }, alice), params(id));
      const repaid = await json(
        await routes.update(jsonRequest('PATCH', { bestAnswerId: bobAnswerId }, alice), params(id)),
      );
      expect(repaid.body.reward).toBe(0);
      expect(await bonusOf('bob')).toBe(5000);

      const unsolved = await json(
        await routes.list(getRequest('/api/community/questions?unsolved=1', carol)),
      );
      expect(unsolved.body.questions).toEqual([]);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'reports reach staff, who hide, lock and block posting',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      const alice = await signUp(routes, 'alice', true);
      const bob = await signUp(routes, 'bob', true);

      const { body } = await json(
        await routes.ask(jsonRequest('POST', { courseId: COURSE, title: 'Spam spam' }, bob)),
      );
      const id = body.id;

      expect(
        (
          await routes.report(
            jsonRequest('POST', { kind: 'question', targetId: id, reason: '' }, alice),
          )
        ).status,
      ).toBe(400);
      await routes.report(
        jsonRequest('POST', { kind: 'question', targetId: id, reason: 'Spam' }, alice),
      );
      // A second report from the same account counts once.
      await routes.report(
        jsonRequest('POST', { kind: 'question', targetId: id, reason: 'Spam' }, alice),
      );
      expect((await routes.reports(getRequest('/x', alice))).status).toBe(403);
      const queue = await json(await routes.reports(getRequest('/x', root)));
      expect(queue.body.reports).toMatchObject([
        { kind: 'question', targetId: id, reports: 1, authorName: 'bob', reasons: ['Spam'] },
      ]);

      // Locked: no more answers. Hidden: gone for everyone but staff.
      await routes.update(jsonRequest('PATCH', { locked: true }, root), params(id));
      expect(
        (await routes.answer(jsonRequest('POST', { body: 'hi' }, alice), params(id))).status,
      ).toBe(403);
      expect(
        (await routes.update(jsonRequest('PATCH', { hidden: true }, alice), params(id))).status,
      ).toBe(403);
      await routes.update(jsonRequest('PATCH', { hidden: true }, root), params(id));
      expect((await routes.read(getRequest('/x', alice), params(id))).status).toBe(404);
      expect((await routes.read(getRequest('/x', root), params(id))).status).toBe(200);
      await routes.resolve(jsonRequest('PATCH', { kind: 'question', targetId: id }, root));
      expect((await json(await routes.reports(getRequest('/x', root)))).body.reports).toEqual([]);

      // Blocked from posting, with an audit record.
      await routes.ban(
        jsonRequest('POST', { username: 'bob', banned: true, reason: 'spam' }, root),
      );
      const blocked = await json(
        await routes.ask(jsonRequest('POST', { courseId: COURSE, title: 'Again' }, bob)),
      );
      expect(blocked).toMatchObject({ status: 403, body: { errorCode: 'COMMUNITY_BLOCKED' } });
      const audit = await db!.query<{ action: string }>(`SELECT action FROM account_admin_audit`);
      expect(audit.rows.map((r) => r.action)).toContain('community:ban');
      await routes.ban(jsonRequest('POST', { username: 'bob', banned: false }, root));
      expect(
        (await routes.ask(jsonRequest('POST', { courseId: COURSE, title: 'Again' }, bob))).status,
      ).toBe(201);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'the feed pages, sorts and narrows by scene, and the scopes count open questions per course',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      await signUp(routes, 'alice', true);
      const carol = await signUp(routes, 'carol');
      const alice = (
        await db!.query<{ id: string }>(`SELECT id FROM accounts WHERE username = 'alice'`)
      ).rows[0]!.id;

      const seed = async (
        id: string,
        course: string,
        scene: string | null,
        title: string,
        created: string,
        activity: string,
        extra: { hidden?: boolean; best?: number } = {},
      ) => {
        await db!.query(
          `INSERT INTO course_questions
             (id, course_id, course_title, scene_id, scene_title, author_id, title, body,
              best_answer_id, hidden, created_at, last_activity_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8, $9, $10::timestamptz, $11::timestamptz)`,
          [
            id,
            course,
            course === COURSE ? 'Derivatives' : 'Integrals',
            scene,
            scene === null ? null : `Scene ${scene}`,
            alice,
            title,
            extra.best ?? null,
            extra.hidden === true,
            created,
            activity,
          ],
        );
      };
      const answer = (question: string, fromAi: boolean, votes: number) =>
        db!.query(
          `INSERT INTO course_answers (question_id, author_id, from_ai, body, votes)
           VALUES ($1, $2, $3, 'x', $4)`,
          [question, fromAi ? null : alice, fromAi, votes],
        );
      await seed('q1', COURSE, 'scene-1', 'Alpha', '2026-01-01T10:00:00Z', '2026-01-01T10:05:00Z');
      await seed('q2', COURSE, null, 'Beta', '2026-01-01T11:00:00Z', '2026-01-01T11:00:00Z');
      await seed(
        'q3',
        'course-integrals',
        'scene-x',
        'Gamma',
        '2026-01-01T12:00:00Z',
        '2026-01-01T09:00:00Z',
        { best: 999 },
      );
      await seed('q4', COURSE, null, 'Hidden', '2026-01-01T13:00:00Z', '2026-01-01T13:00:00Z', {
        hidden: true,
      });
      await answer('q1', true, 0);
      await answer('q1', false, 3);
      await answer('q2', true, 0);

      const titles = async (query: string, cookie = carol) => {
        const { body } = await json(
          await routes.list(getRequest(`/api/community/questions${query}`, cookie)),
        );
        return { titles: body.questions.map((q) => q.title), hasMore: body.hasMore, body };
      };

      // Newest activity first by default; a hidden question is for staff only.
      expect((await titles('')).titles).toEqual(['Beta', 'Alpha', 'Gamma']);
      expect((await titles('', root)).titles).toEqual(['Hidden', 'Beta', 'Alpha', 'Gamma']);
      expect((await titles('?sort=new')).titles).toEqual(['Gamma', 'Beta', 'Alpha']);
      expect((await titles('?sort=top')).titles).toEqual(['Alpha', 'Beta', 'Gamma']);
      // Without a member answer first: Beta (AI only) and Gamma (none) before Alpha.
      expect((await titles('?sort=waiting')).titles).toEqual(['Beta', 'Gamma', 'Alpha']);
      // An unknown sort or a bad number falls back to the defaults.
      expect((await titles('?sort=nope&limit=abc&offset=-1')).titles).toEqual([
        'Beta',
        'Alpha',
        'Gamma',
      ]);

      const counts = (await titles('')).body.questions.map((q) => [q.title, q.humanAnswers]);
      expect(counts).toEqual([
        ['Beta', 0],
        ['Alpha', 1],
        ['Gamma', 0],
      ]);

      // Pages of two: the first says more follows, the second is the rest.
      const first = await titles('?limit=2');
      expect(first).toMatchObject({ titles: ['Beta', 'Alpha'], hasMore: true });
      const second = await titles('?limit=2&offset=2');
      expect(second).toMatchObject({ titles: ['Gamma'], hasMore: false });

      expect((await titles(`?courseId=${COURSE}&sceneId=scene-1`)).titles).toEqual(['Alpha']);
      expect((await titles('?unsolved=1')).titles).toEqual(['Beta', 'Alpha']);

      // The picker: courses with open counts and their scenes, newest activity first.
      expect((await routes.scopes(getRequest('/api/community/courses'))).status).toBe(401);
      const scopes = await json(await routes.scopes(getRequest('/api/community/courses', carol)));
      expect(scopes.body.courses).toMatchObject([
        {
          courseId: COURSE,
          title: 'Derivatives',
          total: 2,
          unsolved: 2,
          scenes: [{ sceneId: 'scene-1', title: 'Scene scene-1', total: 1, unsolved: 1 }],
        },
        {
          courseId: 'course-integrals',
          title: 'Integrals',
          total: 1,
          unsolved: 0,
          scenes: [{ sceneId: 'scene-x', total: 1, unsolved: 0 }],
        },
      ]);
      const staffScopes = await json(
        await routes.scopes(getRequest('/api/community/courses', root)),
      );
      expect(staffScopes.body.courses[0]).toMatchObject({ courseId: COURSE, total: 3 });
    },
    ROUTE_TIMEOUT_MS,
  );
});
