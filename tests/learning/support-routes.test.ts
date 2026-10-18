import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;

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
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://support-route-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  await db!.exec(
    'TRUNCATE support_messages, support_threads, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
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
  const [register, list, thread] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/support/route'),
    import('@/app/api/support/[id]/route'),
  ]);
  return {
    register: register.POST,
    list: list.GET,
    open: list.POST,
    read: thread.GET,
    reply: thread.POST,
    setState: thread.PATCH,
  };
}

type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(method: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/support`, { method, headers, body: JSON.stringify(body) });
}

function getRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined);
}

async function signUp(routes: Routes, username: string): Promise<string> {
  const response = await routes.register(jsonRequest('POST', { username, password: PASSWORD }));
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return setCookie!.split(';')[0]!;
}

async function json(response: Response) {
  return { status: response.status, body: (await response.clone().json()) as SupportBody };
}

interface SupportBody {
  id: string;
  threads: Array<Record<string, unknown>>;
  messages: unknown[];
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('support inbox routes', () => {
  it(
    'a learner asks, staff see it waiting, answer it, and the learner sees it unread',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      const alice = await signUp(routes, 'alice');
      const bob = await signUp(routes, 'bob');

      const opened = await json(
        await routes.open(
          jsonRequest('POST', { subject: 'Quota', body: 'My quota ran out.' }, alice),
        ),
      );
      expect(opened.status).toBe(201);
      const id = opened.body.id as string;

      const staffList = await json(await routes.list(getRequest('/api/support', root)));
      expect(staffList.body.threads).toMatchObject([
        { id, username: 'alice', subject: 'Quota', waiting: true, unread: false },
      ]);

      // Another learner sees neither the thread in their list nor the thread itself.
      const bobList = await json(await routes.list(getRequest('/api/support', bob)));
      expect(bobList.body.threads).toEqual([]);
      const bobRead = await routes.read(getRequest('/api/support/x', bob), params(id));
      expect(bobRead.status).toBe(404);
      const bobReply = await routes.reply(jsonRequest('POST', { body: 'hi' }, bob), params(id));
      expect(bobReply.status).toBe(404);

      await routes.reply(jsonRequest('POST', { body: 'Raised it.' }, root), params(id));
      const aliceList = await json(await routes.list(getRequest('/api/support', alice)));
      expect(aliceList.body.threads[0]).toMatchObject({ waiting: false, unread: true });

      const aliceRead = await json(
        await routes.read(getRequest('/api/support/x', alice), params(id)),
      );
      expect(aliceRead.body.messages).toMatchObject([
        { fromStaff: false, authorName: 'alice', body: 'My quota ran out.' },
        { fromStaff: true, authorName: 'root', body: 'Raised it.' },
      ]);
      const afterRead = await json(await routes.list(getRequest('/api/support', alice)));
      expect(afterRead.body.threads[0].unread).toBe(false);

      // Closing, then a learner reply reopens it and it waits for staff again.
      await routes.setState(jsonRequest('PATCH', { state: 'closed' }, alice), params(id));
      const closed = await json(await routes.list(getRequest('/api/support?state=open', root)));
      expect(closed.body.threads).toEqual([]);
      await routes.reply(jsonRequest('POST', { body: 'Thanks!' }, alice), params(id));
      const reopened = await json(await routes.list(getRequest('/api/support', root)));
      expect(reopened.body.threads[0]).toMatchObject({ state: 'open', waiting: true });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'staff can write to a learner first; learners cannot target others and are capped',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      const alice = await signUp(routes, 'alice');
      await signUp(routes, 'bob');

      const toAlice = await json(
        await routes.open(
          jsonRequest('POST', { subject: 'Welcome', body: 'Hello!', username: 'Alice' }, root),
        ),
      );
      expect(toAlice.status).toBe(201);
      const aliceList = await json(await routes.list(getRequest('/api/support', alice)));
      expect(aliceList.body.threads).toMatchObject([
        { subject: 'Welcome', unread: true, waiting: false },
      ]);

      const asLearner = await routes.open(
        jsonRequest('POST', { subject: 'x', body: 'y', username: 'bob' }, alice),
      );
      expect(asLearner.status).toBe(403);
      const unknown = await routes.open(
        jsonRequest('POST', { subject: 'x', body: 'y', username: 'nobody' }, root),
      );
      expect(unknown.status).toBe(404);

      for (let i = 0; i < 5; i += 1) {
        const ok = await routes.open(jsonRequest('POST', { subject: `q${i}`, body: 'y' }, alice));
        expect(ok.status).toBe(201);
      }
      const capped = await routes.open(jsonRequest('POST', { subject: 'q6', body: 'y' }, alice));
      expect(capped.status).toBe(429);

      const anonymous = await routes.list(getRequest('/api/support'));
      expect(anonymous.status).toBe(401);
      const empty = await routes.open(jsonRequest('POST', { subject: ' ', body: 'y' }, alice));
      expect(empty.status).toBe(400);
    },
    ROUTE_TIMEOUT_MS,
  );
});
