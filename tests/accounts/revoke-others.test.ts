import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
const DATABASE_URL = 'postgres://revoke-others-test';
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
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  await db!.exec('TRUNCATE account_sessions, accounts RESTART IDENTITY CASCADE');
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
  const [register, login, session, revoke] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/auth/login/route'),
    import('@/app/api/auth/session/route'),
    import('@/app/api/auth/revoke-others/route'),
  ]);
  return {
    register: register.POST,
    login: login.POST,
    session: session.GET,
    revoke: revoke.POST,
  };
}

type Handlers = Awaited<ReturnType<typeof loadHandlers>>;

function jsonPost(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function revokePost(cookie?: string, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/auth/revoke-others`, { method: 'POST', headers, body: '{}' });
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return setCookie!.split(';')[0]!;
}

async function isAuthenticated(handlers: Handlers, cookie: string): Promise<boolean> {
  const response = await handlers.session(
    new Request(`${ORIGIN}/api/auth/session`, { headers: { cookie } }),
  );
  const body = (await response.json()) as { authenticated: boolean };
  return body.authenticated;
}

describe('sign out other sessions', () => {
  it(
    'revokes every other session of the account and keeps the caller signed in',
    async () => {
      const handlers = await loadHandlers();
      const here = cookieFrom(await handlers.register(jsonPost('/api/auth/register', ALICE)));
      // The same account signs in again from another device.
      const elsewhere = cookieFrom(await handlers.login(jsonPost('/api/auth/login', ALICE)));
      expect(await isAuthenticated(handlers, elsewhere)).toBe(true);

      const response = await handlers.revoke(revokePost(here));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ success: true, revoked: 1 });
      expect(await isAuthenticated(handlers, here)).toBe(true);
      expect(await isAuthenticated(handlers, elsewhere)).toBe(false);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'answers 401 for a request with no live session, and revokes nothing',
    async () => {
      const handlers = await loadHandlers();
      const signedIn = cookieFrom(await handlers.register(jsonPost('/api/auth/register', ALICE)));

      const anonymous = await handlers.revoke(revokePost());

      expect(anonymous.status).toBe(401);
      expect(await isAuthenticated(handlers, signedIn)).toBe(true);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'refuses a cross-site request before it revokes anything',
    async () => {
      const handlers = await loadHandlers();
      const here = cookieFrom(await handlers.register(jsonPost('/api/auth/register', ALICE)));
      const elsewhere = cookieFrom(await handlers.login(jsonPost('/api/auth/login', ALICE)));

      const response = await handlers.revoke(revokePost(here, { 'sec-fetch-site': 'cross-site' }));

      expect(response.status).not.toBe(200);
      expect(await isAuthenticated(handlers, elsewhere)).toBe(true);
    },
    ROUTE_TIMEOUT_MS,
  );
});
