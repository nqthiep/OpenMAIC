import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ROOT = { username: 'root', password: PASSWORD, acceptedTerms: true };
const OPS = { username: 'ops', password: PASSWORD, acceptedTerms: true };
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
const DATABASE_URL = 'postgres://role-route-test';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;

let db: PGlite | undefined;

/** The subset of pg.Pool the account store uses, backed by in-process PGlite. */
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
  await db!.exec(
    'TRUNCATE account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.close();
  db = undefined;
});

async function loadHandlers() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, session, usage, list, disable, role] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/auth/session/route'),
    import('@/app/api/usage/route'),
    import('@/app/api/admin/accounts/route'),
    import('@/app/api/admin/accounts/[id]/disable/route'),
    import('@/app/api/admin/accounts/[id]/role/route'),
  ]);
  return {
    register: register.POST,
    session: session.GET,
    usage: usage.GET,
    list: list.GET,
    disable: disable.POST,
    role: role.POST,
  };
}

type Handlers = Awaited<ReturnType<typeof loadHandlers>>;

function jsonRequest(path: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function getRequest(path: string, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined);
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return setCookie!.split(';')[0]!;
}

async function signUp(handlers: Handlers, account: { username: string; password: string }) {
  return cookieFrom(await handlers.register(jsonRequest('/api/auth/register', account)));
}

async function errorOf(response: Response): Promise<{ status: number; errorCode: unknown }> {
  const body = (await response.clone().json()) as { errorCode?: unknown };
  return { status: response.status, errorCode: body.errorCode };
}

async function accountIdOf(username: string): Promise<string> {
  const result = await db!.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [
    username,
  ]);
  return result.rows[0]!.id;
}

/** Makes an account an operator in the database, as an administrator would through the route. */
async function makeOperator(handlers: Handlers, adminCookie: string, username: string) {
  const id = await accountIdOf(username);
  const response = await handlers.role(
    jsonRequest(`/api/admin/accounts/${id}/role`, { role: 'operator' }, adminCookie),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
}

describe('account roles', () => {
  it('an administrator sets a role, and the session reports the new role at once', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    const ops = await signUp(handlers, OPS);
    await makeOperator(handlers, root, 'ops');

    const body = (await (await handlers.session(getRequest('/api/auth/session', ops))).json()) as {
      role: string;
      administrator: boolean;
    };
    expect(body.role).toBe('operator');
    expect(body.administrator).toBe(false);
  });

  it('an operator reads usage and the account list, and cannot change roles', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    const ops = await signUp(handlers, OPS);
    await signUp(handlers, ALICE);
    await makeOperator(handlers, root, 'ops');
    const { NextRequest } = await import('next/server');

    expect(
      (await handlers.usage(new NextRequest(`${ORIGIN}/api/usage`, { headers: { cookie: ops } })))
        .status,
    ).toBe(200);
    expect((await handlers.list(getRequest('/api/admin/accounts', ops))).status).toBe(200);

    const id = await accountIdOf('alice');
    const refused = await handlers.role(
      jsonRequest(`/api/admin/accounts/${id}/role`, { role: 'operator' }, ops),
      { params: Promise.resolve({ id }) },
    );
    expect(await errorOf(refused)).toEqual({ status: 403, errorCode: 'ADMIN_ONLY' });
  });

  it('a learner gets 403 on usage and the account list', async () => {
    const handlers = await loadHandlers();
    await signUp(handlers, ROOT);
    const alice = await signUp(handlers, ALICE);
    const { NextRequest } = await import('next/server');

    expect(
      await errorOf(
        await handlers.usage(
          new NextRequest(`${ORIGIN}/api/usage`, { headers: { cookie: alice } }),
        ),
      ),
    ).toEqual({
      status: 403,
      errorCode: 'STAFF_ONLY',
    });
    expect(await errorOf(await handlers.list(getRequest('/api/admin/accounts', alice)))).toEqual({
      status: 403,
      errorCode: 'STAFF_ONLY',
    });
  });

  it('an operator disables a learner but not an administrator', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    const ops = await signUp(handlers, OPS);
    await signUp(handlers, ALICE);
    await makeOperator(handlers, root, 'ops');

    const aliceId = await accountIdOf('alice');
    const rootId = await accountIdOf('root');

    const disableAlice = await handlers.disable(
      jsonRequest(`/api/admin/accounts/${aliceId}/disable`, {}, ops),
      { params: Promise.resolve({ id: aliceId }) },
    );
    expect(disableAlice.status).toBe(200);

    const disableRoot = await handlers.disable(
      jsonRequest(`/api/admin/accounts/${rootId}/disable`, {}, ops),
      { params: Promise.resolve({ id: rootId }) },
    );
    expect(await errorOf(disableRoot)).toEqual({ status: 403, errorCode: 'ADMIN_ONLY' });
  });

  it('refuses a self change, an unknown role, and a change to an environment administrator', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    await signUp(handlers, ALICE);
    const rootId = await accountIdOf('root');
    const aliceId = await accountIdOf('alice');

    const self = await handlers.role(
      jsonRequest(`/api/admin/accounts/${rootId}/role`, { role: 'learner' }, root),
      { params: Promise.resolve({ id: rootId }) },
    );
    expect(self.status).toBe(400);

    const unknown = await handlers.role(
      jsonRequest(`/api/admin/accounts/${aliceId}/role`, { role: 'superuser' }, root),
      { params: Promise.resolve({ id: aliceId }) },
    );
    expect(await errorOf(unknown)).toEqual({ status: 400, errorCode: 'INVALID_REQUEST' });

    // root is listed in ADMIN_USERNAMES, so no request can demote it, even one from another admin.
    await makeAdmin(handlers, root, 'alice');
    const demote = await handlers.role(
      jsonRequest(
        `/api/admin/accounts/${rootId}/role`,
        { role: 'learner' },
        await loginAs('alice'),
      ),
      { params: Promise.resolve({ id: rootId }) },
    );
    expect(await errorOf(demote)).toEqual({ status: 409, errorCode: 'ENVIRONMENT_ADMIN' });
  });

  it('an account promoted to administrator reports the administrator role at its next request', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    await signUp(handlers, ALICE);
    await makeAdmin(handlers, root, 'alice');

    const aliceAdmin = await loginAs('alice');
    const session = (await (
      await handlers.session(getRequest('/api/auth/session', aliceAdmin))
    ).json()) as {
      role: string;
      administrator: boolean;
    };
    expect(session.role).toBe('admin');
    expect(session.administrator).toBe(true);
  });
});

/** Sets an account's stored role to admin through the route, as the environment admin would. */
async function makeAdmin(handlers: Handlers, adminCookie: string, username: string) {
  const id = await accountIdOf(username);
  const response = await handlers.role(
    jsonRequest(`/api/admin/accounts/${id}/role`, { role: 'admin' }, adminCookie),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
}

async function loginAs(username: string): Promise<string> {
  const { POST } = await import('@/app/api/auth/login/route');
  return cookieFrom(await POST(jsonRequest('/api/auth/login', { username, password: PASSWORD })));
}
