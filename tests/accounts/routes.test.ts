import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';

type RouteHandler = (request: Request) => Promise<Response>;

interface AccountRoutes {
  register: RouteHandler;
  login: RouteHandler;
  logout: RouteHandler;
  session: RouteHandler;
}

const PASSWORD = 'Tangerine-Waffle-2026';
const WRONG_PASSWORD = 'Tangerine-Waffle-2027';
const ALICE = { username: 'alice', password: PASSWORD };
const DATABASE_URL = 'postgres://accounts-route-test';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
/** Covers scrypt (roughly 50-150 ms per hash) plus PGlite and route-module setup. */
const ROUTE_TIMEOUT_MS = 30_000;
const SESSION_COOKIE_PATTERN =
  /^openmaic_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/;

/** Register bodies that must be refused before any account is created. */
const MALFORMED_REGISTER_BODIES = [
  {
    label: 'a form-encoded body',
    contentType: 'application/x-www-form-urlencoded',
    body: `username=alice&password=${PASSWORD}`,
    status: 415,
  },
  {
    label: 'a text/plain body',
    contentType: 'text/plain',
    body: JSON.stringify(ALICE),
    status: 415,
  },
  { label: 'no content type', contentType: undefined, body: JSON.stringify(ALICE), status: 415 },
  { label: 'invalid JSON', contentType: 'application/json', body: '{"username": ', status: 400 },
  {
    label: 'a JSON array',
    contentType: 'application/json',
    body: JSON.stringify(['alice', PASSWORD]),
    status: 400,
  },
  { label: 'a JSON null', contentType: 'application/json', body: 'null', status: 400 },
  {
    label: 'a body over 4 KiB',
    contentType: 'application/json',
    body: JSON.stringify({ ...ALICE, padding: 'x'.repeat(4096) }),
    status: 413,
  },
];

let db: PGlite | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', DATABASE_URL);
  // The login throttle is a process-wide singleton on globalThis. Clear it so
  // failures recorded by one test cannot throttle the next.
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
});

afterEach(async () => {
  vi.doUnmock('@/lib/persistence/server-provider');
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await db?.close();
  db = undefined;
});

/** The subset of pg.Pool the account store uses, backed by in-process PGlite. */
class PGlitePool {
  constructor(private readonly database: PGlite) {}

  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

/** Points the account routes at a fresh PGlite database and loads their handlers. */
async function loadRoutes(): Promise<AccountRoutes> {
  db = new PGlite();
  await db.waitReady;
  const pool = new PGlitePool(db);
  // The production provider runs this on first use; the mock bypasses that, so run it here.
  await ensureAccountSchema(pool);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, login, logout, session] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/auth/login/route'),
    import('@/app/api/auth/logout/route'),
    import('@/app/api/auth/session/route'),
  ]);
  return {
    register: register.POST,
    login: login.POST,
    logout: logout.POST,
    session: session.GET,
  };
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function logoutRequest(headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/auth/logout`, { method: 'POST', headers });
}

function sessionRequest(cookie?: string): Request {
  return new Request(`${ORIGIN}/api/auth/session`, cookie ? { headers: { cookie } } : undefined);
}

/** The `openmaic_session=<token>` pair from a response, ready to send as a Cookie header. */
function sessionCookieFrom(response: Response): string {
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  if (!setCookie) throw new Error('response did not set the session cookie');
  return setCookie.split(';')[0]!;
}

/** Status, cache header, cookie count and error envelope of a response, for compact comparisons. */
async function summarize(response: Response) {
  const body = (await response.clone().json()) as Record<string, unknown>;
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control'),
    setCookies: response.headers.getSetCookie().length,
    success: body.success,
    errorCode: body.errorCode,
  };
}

/** True when the secret appears in any response header or in the body. Leaves the body unread. */
async function leaksSecret(response: Response, secret: string): Promise<boolean> {
  const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`).join('\n');
  return `${headers}\n${await response.clone().text()}`.includes(secret);
}

async function accountCount(): Promise<number> {
  const result = await db!.query<{ n: number }>(`SELECT count(*)::int AS n FROM accounts`);
  return result.rows[0]!.n;
}

describe('account routes', () => {
  it(
    'answers 404 ACCOUNTS_NOT_CONFIGURED on every account route when DATABASE_URL is unset',
    async () => {
      vi.stubEnv('DATABASE_URL', '');
      const { register, login, logout, session } = await loadRoutes();
      const responses = [
        await register(jsonRequest('/api/auth/register', ALICE)),
        await login(jsonRequest('/api/auth/login', ALICE)),
        await logout(logoutRequest()),
      ];
      expect(await Promise.all(responses.map(summarize))).toEqual(
        responses.map(() => ({
          status: 404,
          cacheControl: 'no-store',
          setCookies: 0,
          success: false,
          errorCode: 'ACCOUNTS_NOT_CONFIGURED',
        })),
      );
      await expect((await session(sessionRequest())).json()).resolves.toEqual({
        success: true,
        enabled: false,
        registrationOpen: false,
        authenticated: false,
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'registers a normalized username with 201 and an HttpOnly session cookie, echoing no password',
    async () => {
      const { register } = await loadRoutes();
      const response = await register(
        jsonRequest('/api/auth/register', { username: '  Alice.X ', password: PASSWORD }),
      );
      expect(await summarize(response)).toEqual({
        status: 201,
        cacheControl: 'no-store',
        setCookies: 1,
        success: true,
      });
      expect(response.headers.getSetCookie()[0]).toMatch(SESSION_COOKIE_PATTERN);
      expect(await leaksSecret(response, PASSWORD)).toBe(false);
      await expect(response.json()).resolves.toEqual({
        success: true,
        account: { username: 'alice.x' },
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'answers 409 for a taken username and 400 for invalid input',
    async () => {
      const { register } = await loadRoutes();
      await register(jsonRequest('/api/auth/register', ALICE));
      const attempts = [
        await register(jsonRequest('/api/auth/register', { ...ALICE, username: 'ALICE' })),
        await register(jsonRequest('/api/auth/register', { username: 'a b', password: PASSWORD })),
        await register(jsonRequest('/api/auth/register', { username: 'carol', password: 'short' })),
      ];
      const results = (await Promise.all(attempts.map(summarize))).map(({ status, errorCode }) => [
        status,
        errorCode,
      ]);
      expect(results).toEqual([
        [409, 'USERNAME_TAKEN'],
        [400, 'USERNAME_INVALID'],
        [400, 'PASSWORD_INVALID'],
      ]);
      await expect(accountCount()).resolves.toBe(1);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'refuses malformed register bodies with the right status, echoes no secret, and creates nothing',
    async () => {
      const { register } = await loadRoutes();
      const summaries: Array<Record<string, unknown>> = [];
      const echoing: string[] = [];
      for (const { label, contentType, body } of MALFORMED_REGISTER_BODIES) {
        const headers: Record<string, string> = contentType ? { 'content-type': contentType } : {};
        // A Uint8Array body stops fetch from adding its own text/plain content type.
        const response = await register(
          new Request(`${ORIGIN}/api/auth/register`, {
            method: 'POST',
            headers,
            body: new TextEncoder().encode(body),
          }),
        );
        summaries.push({ label, ...(await summarize(response)) });
        if (await leaksSecret(response, PASSWORD)) echoing.push(label);
      }
      expect(summaries).toEqual(
        MALFORMED_REGISTER_BODIES.map(({ label, status }) => ({
          label,
          status,
          cacheControl: 'no-store',
          setCookies: 0,
          success: false,
          errorCode: 'INVALID_REQUEST',
        })),
      );
      expect(echoing).toEqual([]);
      await expect(accountCount()).resolves.toBe(0);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'stops reading an oversized body once it passes the 4 KiB cap',
    async () => {
      const { register } = await loadRoutes();
      const chunk = new Uint8Array(64 * 1024);
      const chunkCount = 64; // 4 MiB in total
      let pulled = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulled === chunkCount) {
            controller.close();
            return;
          }
          pulled += 1;
          controller.enqueue(chunk);
        },
      });
      const request = new Request(`${ORIGIN}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit);
      const response = await register(request);
      expect(response.status).toBe(413);
      // The cap is 4 KiB, so refusing early means at most a few 64 KiB chunks are read.
      expect(pulled).toBeLessThan(16);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'refuses cross-site register, login and logout, and a refused logout revokes nothing',
    async () => {
      const { register, login, logout, session } = await loadRoutes();
      const created = await register(
        jsonRequest('/api/auth/register', ALICE, { 'sec-fetch-site': 'same-origin' }),
      );
      expect(created.status).toBe(201);
      const cookie = sessionCookieFrom(created);

      const crossSite = { 'sec-fetch-site': 'cross-site' };
      const refused = [
        await register(
          jsonRequest('/api/auth/register', { username: 'bob', password: PASSWORD }, crossSite),
        ),
        await login(jsonRequest('/api/auth/login', ALICE, crossSite)),
        await logout(logoutRequest({ ...crossSite, cookie })),
      ];
      expect(await Promise.all(refused.map(summarize))).toEqual(
        refused.map(() => ({
          status: 403,
          cacheControl: 'no-store',
          setCookies: 0,
          success: false,
          errorCode: 'INVALID_REQUEST',
        })),
      );
      await expect(accountCount()).resolves.toBe(1);
      await expect((await session(sessionRequest(cookie))).json()).resolves.toMatchObject({
        authenticated: true,
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'signs in with the right password and sets a new cookie; a wrong password is 401 INVALID_CREDENTIALS',
    async () => {
      const { register, login } = await loadRoutes();
      await register(jsonRequest('/api/auth/register', ALICE));

      const signedIn = await login(
        jsonRequest('/api/auth/login', { username: 'ALICE', password: PASSWORD }),
      );
      expect(await summarize(signedIn)).toEqual({
        status: 200,
        cacheControl: 'no-store',
        setCookies: 1,
        success: true,
      });
      expect(signedIn.headers.getSetCookie()[0]).toMatch(SESSION_COOKIE_PATTERN);
      expect(await leaksSecret(signedIn, PASSWORD)).toBe(false);
      await expect(signedIn.json()).resolves.toEqual({
        success: true,
        account: { username: 'alice' },
      });

      const wrong = await login(
        jsonRequest('/api/auth/login', { username: 'alice', password: WRONG_PASSWORD }),
      );
      expect(await summarize(wrong)).toEqual({
        status: 401,
        cacheControl: 'no-store',
        setCookies: 0,
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
      });
      expect(await leaksSecret(wrong, WRONG_PASSWORD)).toBe(false);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'answers 429 RATE_LIMITED with Retry-After after eight failed sign-ins, even for the right password',
    async () => {
      const { register, login } = await loadRoutes();
      await register(jsonRequest('/api/auth/register', ALICE));
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const failed = await login(
          jsonRequest('/api/auth/login', { username: 'alice', password: WRONG_PASSWORD }),
        );
        statuses.push(failed.status);
      }
      expect(statuses).toEqual(Array.from({ length: 8 }, () => 401));

      const limited = await login(jsonRequest('/api/auth/login', ALICE));
      expect(await summarize(limited)).toEqual({
        status: 429,
        cacheControl: 'no-store',
        setCookies: 0,
        success: false,
        errorCode: 'RATE_LIMITED',
      });
      // The route reads the real clock, so the exact value drifts with elapsed time.
      // Only the range is fixed: a whole number of seconds inside the 15-minute window.
      const retryAfter = Number(limited.headers.get('retry-after'));
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(15 * 60);
      expect(await leaksSecret(limited, PASSWORD)).toBe(false);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'answers 403 REGISTRATION_DISABLED when ACCOUNT_REGISTRATION=closed, while sign-in keeps working',
    async () => {
      const { register, login, session } = await loadRoutes();
      await register(jsonRequest('/api/auth/register', ALICE));
      vi.stubEnv('ACCOUNT_REGISTRATION', 'closed');

      const refused = await register(
        jsonRequest('/api/auth/register', { username: 'bob', password: PASSWORD }),
      );
      expect(await summarize(refused)).toEqual({
        status: 403,
        cacheControl: 'no-store',
        setCookies: 0,
        success: false,
        errorCode: 'REGISTRATION_DISABLED',
      });
      await expect(accountCount()).resolves.toBe(1);

      expect((await login(jsonRequest('/api/auth/login', ALICE))).status).toBe(200);
      await expect((await session(sessionRequest())).json()).resolves.toMatchObject({
        enabled: true,
        registrationOpen: false,
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'logout clears the cookie with Max-Age=0 and revokes the session on the server',
    async () => {
      const { register, logout, session } = await loadRoutes();
      const cookie = sessionCookieFrom(await register(jsonRequest('/api/auth/register', ALICE)));
      await expect((await session(sessionRequest(cookie))).json()).resolves.toMatchObject({
        authenticated: true,
      });

      const response = await logout(logoutRequest({ cookie }));
      expect(await summarize(response)).toEqual({
        status: 200,
        cacheControl: 'no-store',
        setCookies: 1,
        success: true,
      });
      expect(response.headers.getSetCookie()).toEqual([
        'openmaic_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      ]);
      await expect((await session(sessionRequest(cookie))).json()).resolves.toMatchObject({
        authenticated: false,
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'GET session reports availability, and the account with its learnerKey only for a valid cookie',
    async () => {
      const { register, session } = await loadRoutes();
      const anonymous = await session(sessionRequest());
      expect(anonymous.headers.get('cache-control')).toBe('no-store');
      await expect(anonymous.json()).resolves.toEqual({
        success: true,
        enabled: true,
        registrationOpen: true,
        authenticated: false,
      });

      const cookie = sessionCookieFrom(await register(jsonRequest('/api/auth/register', ALICE)));
      const signedIn = await (await session(sessionRequest(cookie))).json();
      expect(signedIn).toMatchObject({
        success: true,
        enabled: true,
        registrationOpen: true,
        authenticated: true,
        account: { username: 'alice' },
      });
      const row = await db!.query<{ id: string }>(
        `SELECT id FROM accounts WHERE username = 'alice'`,
      );
      expect(signedIn.learnerKey).toBe(`acct:${row.rows[0]!.id}`);

      const unknownToken = `openmaic_session=${'B'.repeat(43)}`;
      await expect((await session(sessionRequest(unknownToken))).json()).resolves.toEqual({
        success: true,
        enabled: true,
        registrationOpen: true,
        authenticated: false,
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'answers 500 INTERNAL_ERROR and keeps database error text out of the response and the log',
    async () => {
      vi.doMock('@/lib/persistence/server-provider', () => ({
        getServerPersistenceProvider: async () => ({
          pool: {
            query: async () => {
              throw new Error('SENTINEL-DB-DETAIL postgres://user:secret@db.internal/accounts');
            },
          },
        }),
      }));
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { POST: login } = await import('@/app/api/auth/login/route');

      const response = await login(jsonRequest('/api/auth/login', ALICE));
      expect(await summarize(response)).toEqual({
        status: 500,
        cacheControl: 'no-store',
        setCookies: 0,
        success: false,
        errorCode: 'INTERNAL_ERROR',
      });
      expect(await leaksSecret(response, 'SENTINEL-DB-DETAIL')).toBe(false);
      expect(errorLog.mock.calls.flat().join(' ')).not.toContain('SENTINEL-DB-DETAIL');
    },
    ROUTE_TIMEOUT_MS,
  );
});
