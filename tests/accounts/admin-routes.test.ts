import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ROOT = { username: 'root', password: PASSWORD, acceptedTerms: true };
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
const BOB = { username: 'bob', password: PASSWORD, acceptedTerms: true };
const DATABASE_URL = 'postgres://admin-route-test';
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
  const [register, login, session, usage, list, disable, enable] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/auth/login/route'),
    import('@/app/api/auth/session/route'),
    import('@/app/api/usage/route'),
    import('@/app/api/admin/accounts/route'),
    import('@/app/api/admin/accounts/[id]/disable/route'),
    import('@/app/api/admin/accounts/[id]/enable/route'),
  ]);
  return {
    register: register.POST,
    login: login.POST,
    session: session.GET,
    usage: usage.GET,
    list: list.GET,
    disable: disable.POST,
    enable: enable.POST,
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

/** The `openmaic_session=<token>` pair from a response, ready to send as a Cookie header. */
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

async function isAuthenticated(handlers: Handlers, cookie: string): Promise<boolean> {
  const body = (await (await handlers.session(getRequest('/api/auth/session', cookie))).json()) as {
    authenticated: boolean;
  };
  return body.authenticated;
}

async function accountIdOf(username: string): Promise<string> {
  const result = await db!.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [
    username,
  ]);
  return result.rows[0]!.id;
}

describe('administrator account routes', () => {
  it('lists accounts for operators and administrators only, and never returns password material', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    await signUp(handlers, ALICE);

    const refusedForAlice = await handlers.list(
      getRequest('/api/admin/accounts', await signUp(handlers, BOB)),
    );
    expect(await errorOf(refusedForAlice)).toEqual({ status: 403, errorCode: 'STAFF_ONLY' });

    const anonymous = await handlers.list(getRequest('/api/admin/accounts'));
    expect(await errorOf(anonymous)).toEqual({ status: 401, errorCode: 'UNAUTHENTICATED' });

    const allowed = await handlers.list(getRequest('/api/admin/accounts', root));
    expect(allowed.status).toBe(200);
    const text = await allowed.text();
    expect(text).toContain('"alice"');
    expect(text).not.toMatch(/password|\$scrypt\$/i);
  });

  it('writes an audit row for every page the administrator reads', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);

    await handlers.list(getRequest('/api/admin/accounts', root));
    await handlers.list(getRequest('/api/admin/accounts?limit=1', root));

    const rows = await db!.query<{ actor_id: string; action: string }>(
      "SELECT actor_id, action FROM account_admin_audit WHERE action = 'list'",
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((row) => row.actor_id === rows.rows[0]!.actor_id)).toBe(true);
  });

  it('pages the account list with a cursor until nextAfter is null', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    await signUp(handlers, ALICE);
    await signUp(handlers, BOB);

    const first = (await (
      await handlers.list(getRequest('/api/admin/accounts?limit=2', root))
    ).json()) as {
      accounts: { id: string }[];
      nextAfter: string | null;
    };
    expect(first.accounts).toHaveLength(2);
    expect(first.nextAfter).toBe(first.accounts[1]!.id);

    const second = (await (
      await handlers.list(getRequest(`/api/admin/accounts?limit=2&after=${first.nextAfter}`, root))
    ).json()) as { accounts: unknown[]; nextAfter: string | null };
    expect(second.accounts).toHaveLength(1);
    expect(second.nextAfter).toBeNull();
  });

  it('refuses a malformed cursor', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);

    const response = await handlers.list(getRequest('/api/admin/accounts?after=not-an-id', root));
    expect(await errorOf(response)).toEqual({ status: 400, errorCode: 'INVALID_REQUEST' });
  });

  it('disabling an account stops its sessions and sign-in; enabling it does not revive old sessions', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    const aliceSession = await signUp(handlers, ALICE);
    const aliceId = await accountIdOf('alice');

    const disabled = await handlers.disable(
      jsonRequest(`/api/admin/accounts/${aliceId}/disable`, { reason: 'left the school' }, root),
      { params: Promise.resolve({ id: aliceId }) },
    );
    expect(disabled.status).toBe(200);
    expect(await isAuthenticated(handlers, aliceSession)).toBe(false);

    const enabled = await handlers.enable(
      jsonRequest(`/api/admin/accounts/${aliceId}/enable`, {}, root),
      {
        params: Promise.resolve({ id: aliceId }),
      },
    );
    expect(enabled.status).toBe(200);
    expect(await isAuthenticated(handlers, aliceSession)).toBe(false);
    expect((await handlers.login(jsonRequest('/api/auth/login', ALICE))).status).toBe(200);

    const audit = await db!.query<{ action: string; reason: string | null }>(
      'SELECT action, reason FROM account_admin_audit WHERE target_id = $1 ORDER BY id',
      [aliceId],
    );
    expect(audit.rows).toEqual([
      { action: 'disable', reason: 'left the school' },
      { action: 'enable', reason: null },
    ]);
  });

  it('refuses an administrator who disables their own account, and a non-administrator who tries', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    const alice = await signUp(handlers, ALICE);
    const rootId = await accountIdOf('root');

    const self = await handlers.disable(
      jsonRequest(`/api/admin/accounts/${rootId}/disable`, {}, root),
      {
        params: Promise.resolve({ id: rootId }),
      },
    );
    expect(await errorOf(self)).toEqual({ status: 400, errorCode: 'INVALID_REQUEST' });

    const byAlice = await handlers.disable(
      jsonRequest(`/api/admin/accounts/${rootId}/disable`, {}, alice),
      {
        params: Promise.resolve({ id: rootId }),
      },
    );
    expect(await errorOf(byAlice)).toEqual({ status: 403, errorCode: 'STAFF_ONLY' });
  });

  it('refuses a reason longer than 200 characters', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    await signUp(handlers, ALICE);
    const aliceId = await accountIdOf('alice');

    const response = await handlers.disable(
      jsonRequest(`/api/admin/accounts/${aliceId}/disable`, { reason: 'x'.repeat(201) }, root),
      { params: Promise.resolve({ id: aliceId }) },
    );
    expect(await errorOf(response)).toEqual({ status: 400, errorCode: 'INVALID_REQUEST' });
  });

  it('refuses everyone when ADMIN_USERNAMES is empty, so no account is an administrator', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    vi.stubEnv('ADMIN_USERNAMES', '');

    const response = await handlers.list(getRequest('/api/admin/accounts', root));
    expect(await errorOf(response)).toEqual({ status: 403, errorCode: 'STAFF_ONLY' });
  });
});

describe('usage endpoint with accounts enabled', () => {
  it('is staff-only: anonymous and learner accounts get 403, an administrator gets the data', async () => {
    const handlers = await loadHandlers();
    const root = await signUp(handlers, ROOT);
    const alice = await signUp(handlers, ALICE);
    const { NextRequest } = await import('next/server');
    const usageRequest = (cookie?: string) =>
      new NextRequest(`${ORIGIN}/api/usage`, cookie ? { headers: { cookie } } : undefined);

    expect(await errorOf(await handlers.usage(usageRequest()))).toEqual({
      status: 403,
      errorCode: 'STAFF_ONLY',
    });
    expect(await errorOf(await handlers.usage(usageRequest(alice)))).toEqual({
      status: 403,
      errorCode: 'STAFF_ONLY',
    });
    expect((await handlers.usage(usageRequest(root))).status).toBe(200);
  });

  it('is off without accounts: even a visitor with no cookie gets 403, not the data', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const handlers = await loadHandlers();
    const { NextRequest } = await import('next/server');

    const response = await handlers.usage(new NextRequest(`${ORIGIN}/api/usage`));
    expect(await errorOf(response)).toEqual({ status: 403, errorCode: 'STAFF_ONLY' });
  });
});
