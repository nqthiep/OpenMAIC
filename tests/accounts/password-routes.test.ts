import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a different long passphrase';
const DATABASE_URL = 'postgres://password-routes-test';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;

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
  const [register, login, session, change, reset] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/auth/login/route'),
    import('@/app/api/auth/session/route'),
    import('@/app/api/auth/password/route'),
    import('@/app/api/admin/accounts/[id]/password/route'),
  ]);
  return {
    register: register.POST,
    login: login.POST,
    session: session.GET,
    change: change.POST,
    reset: reset.POST,
  };
}

type Handlers = Awaited<ReturnType<typeof loadHandlers>>;

function post(path: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return setCookie!.split(';')[0]!;
}

async function signUp(handlers: Handlers, username: string): Promise<string> {
  return cookieFrom(
    await handlers.register(
      post('/api/auth/register', { username, password: PASSWORD, acceptedTerms: true }),
    ),
  );
}

async function signedIn(handlers: Handlers, cookie: string): Promise<boolean> {
  const response = await handlers.session(
    new Request(`${ORIGIN}/api/auth/session`, { headers: { cookie } }),
  );
  return ((await response.json()) as { authenticated: boolean }).authenticated;
}

async function idOf(username: string): Promise<string> {
  const result = await db!.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [
    username,
  ]);
  return result.rows[0]!.id;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('change own password', () => {
  it(
    'needs the current password, signs out other sessions, and keeps this one',
    async () => {
      const handlers = await loadHandlers();
      const here = await signUp(handlers, 'alice');
      const elsewhere = cookieFrom(
        await handlers.login(post('/api/auth/login', { username: 'alice', password: PASSWORD })),
      );

      const wrong = await handlers.change(
        post(
          '/api/auth/password',
          { currentPassword: 'not the password', newPassword: NEW_PASSWORD },
          here,
        ),
      );
      expect(wrong.status).toBe(401);
      await expect(wrong.json()).resolves.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });

      const tooShort = await handlers.change(
        post('/api/auth/password', { currentPassword: PASSWORD, newPassword: 'short' }, here),
      );
      expect(tooShort.status).toBe(400);

      const anonymous = await handlers.change(
        post('/api/auth/password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
      );
      expect(anonymous.status).toBe(401);

      const changed = await handlers.change(
        post('/api/auth/password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, here),
      );
      expect(changed.status).toBe(200);
      expect(await signedIn(handlers, here)).toBe(true);
      expect(await signedIn(handlers, elsewhere)).toBe(false);

      const oldLogin = await handlers.login(
        post('/api/auth/login', { username: 'alice', password: PASSWORD }),
      );
      expect(oldLogin.status).toBe(401);
      const newLogin = await handlers.login(
        post('/api/auth/login', { username: 'alice', password: NEW_PASSWORD }),
      );
      expect(newLogin.status).toBe(200);
    },
    ROUTE_TIMEOUT_MS,
  );
});

describe('staff password reset', () => {
  it(
    'gives a one-time password, signs the account out, and is audited; learners and self are refused',
    async () => {
      const handlers = await loadHandlers();
      const root = await signUp(handlers, 'root');
      const bob = await signUp(handlers, 'bob');
      const bobId = await idOf('bob');

      const byLearner = await handlers.reset(post('/x', {}, bob), params(await idOf('root')));
      expect(byLearner.status).toBe(403);
      const self = await handlers.reset(post('/x', {}, root), params(await idOf('root')));
      expect(self.status).toBe(400);

      const reset = await handlers.reset(post('/x', {}, root), params(bobId));
      expect(reset.status).toBe(200);
      const { temporaryPassword } = (await reset.json()) as { temporaryPassword: string };
      expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{14}$/);
      expect(await signedIn(handlers, bob)).toBe(false);

      const login = await handlers.login(
        post('/api/auth/login', { username: 'bob', password: temporaryPassword }),
      );
      expect(login.status).toBe(200);

      const audit = await db!.query<{ action: string; target_id: string }>(
        `SELECT action, target_id FROM account_admin_audit WHERE action = 'password_reset'`,
      );
      expect(audit.rows).toEqual([{ action: 'password_reset', target_id: bobId }]);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'an operator cannot reset an administrator',
    async () => {
      const handlers = await loadHandlers();
      await signUp(handlers, 'root');
      const op = await signUp(handlers, 'oper');
      await db!.query(`UPDATE accounts SET role = 'operator' WHERE username = 'oper'`);
      const response = await handlers.reset(post('/x', {}, op), params(await idOf('root')));
      expect(response.status).toBe(403);
    },
    ROUTE_TIMEOUT_MS,
  );
});
