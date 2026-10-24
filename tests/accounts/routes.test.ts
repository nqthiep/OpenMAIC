import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { singleUserCapabilities } from '@/lib/server/authz/capabilities';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

type RouteHandler = (request: Request) => Promise<Response>;

// A visitor with no signed-in account can do nothing that the capability list gates.
const GUEST_CAPABILITIES = {
  generate: false,
  proMode: false,
  joinClass: false,
  exportCourse: false,
  shareCourse: false,
  requestAccess: false,
  personalProviderKey: false,
  viewProviders: false,
  dashboard: false,
  viewUsage: false,
  manageMembers: false,
  decideShares: false,
  markPreviews: false,
  manageClasses: false,
  viewAudit: false,
  changeRoles: false,
  disableLearners: false,
};

interface AccountRoutes {
  register: RouteHandler;
  login: RouteHandler;
  logout: RouteHandler;
  session: RouteHandler;
}

const PASSWORD = 'Tangerine-Waffle-2026';
const WRONG_PASSWORD = 'Tangerine-Waffle-2027';
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
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

/**
 * One in-process database for the whole file, with the schema applied once. Each
 * test starts from empty account tables. A database per test made the file create
 * about a dozen PGlite instances; under full-suite load one of them intermittently
 * failed every query, which surfaced as plain errors inside the route.
 */
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
  vi.stubEnv('DATABASE_URL', DATABASE_URL);
  // Registration is closed by default. Most cases in this file register accounts, so they open it.
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  // The login throttle is a process-wide singleton on globalThis. Clear it so
  // failures recorded by one test cannot throttle the next.
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  await db!.exec('TRUNCATE account_sessions, accounts CASCADE');
});

afterEach(() => {
  vi.doUnmock('@/lib/persistence/server-provider');
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
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

/** Points the account routes at the file's database and loads their handlers. */
async function loadRoutes(): Promise<AccountRoutes> {
  const pool = new PGlitePool(db!);
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
        capabilities: singleUserCapabilities(),
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'registers a normalized username with 201 and an HttpOnly session cookie, echoing no password',
    async () => {
      const { register } = await loadRoutes();
      const response = await register(
        jsonRequest('/api/auth/register', {
          username: '  Alice.X ',
          password: PASSWORD,
          acceptedTerms: true,
        }),
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
        await register(
          jsonRequest('/api/auth/register', {
            username: 'a b',
            password: PASSWORD,
            acceptedTerms: true,
          }),
        ),
        await register(
          jsonRequest('/api/auth/register', {
            username: 'carol',
            password: 'short',
            acceptedTerms: true,
          }),
        ),
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
          jsonRequest(
            '/api/auth/register',
            { username: 'bob', password: PASSWORD, acceptedTerms: true },
            crossSite,
          ),
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

  it('refuses a trusted client after 30 failed sign-ins, while another client still signs in', async () => {
    const { register, login } = await loadRoutes();
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');
    const other = { 'x-forwarded-for': '198.51.100.7' };
    const spent = { 'x-forwarded-for': '203.0.113.200' };
    await register(jsonRequest('/api/auth/register', ALICE, other));

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const failed = await login(
        jsonRequest('/api/auth/login', { username: `ghost${attempt}`, password: PASSWORD }, spent),
      );
      expect(failed.status).toBe(401);
    }

    const refused = await login(
      jsonRequest('/api/auth/login', { username: 'ghost-last', password: PASSWORD }, spent),
    );
    expect(await summarize(refused)).toMatchObject({ status: 429, errorCode: 'RATE_LIMITED' });
    expect((await login(jsonRequest('/api/auth/login', ALICE, other))).status).toBe(200);
  }, 90_000);

  it(
    'answers 403 REGISTRATION_DISABLED when ACCOUNT_REGISTRATION is not set to open',
    async () => {
      const { register, session } = await loadRoutes();
      vi.stubEnv('ACCOUNT_REGISTRATION', '');

      const refused = await register(jsonRequest('/api/auth/register', ALICE));
      expect(await summarize(refused)).toMatchObject({
        status: 403,
        errorCode: 'REGISTRATION_DISABLED',
      });
      await expect(accountCount()).resolves.toBe(0);
      await expect((await session(sessionRequest())).json()).resolves.toMatchObject({
        registrationOpen: false,
      });
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
        jsonRequest('/api/auth/register', {
          username: 'bob',
          password: PASSWORD,
          acceptedTerms: true,
        }),
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
    'GET session reports availability, and the account only for a valid cookie',
    async () => {
      const { register, session } = await loadRoutes();
      const anonymous = await session(sessionRequest());
      expect(anonymous.headers.get('cache-control')).toBe('no-store');
      await expect(anonymous.json()).resolves.toEqual({
        success: true,
        enabled: true,
        registrationOpen: true,
        trialDays: 0,
        authenticated: false,
        capabilities: GUEST_CAPABILITIES,
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
      expect(signedIn).not.toHaveProperty('learnerKey');

      const unknownToken = `openmaic_session=${'B'.repeat(43)}`;
      await expect((await session(sessionRequest(unknownToken))).json()).resolves.toEqual({
        success: true,
        enabled: true,
        registrationOpen: true,
        trialDays: 0,
        authenticated: false,
        capabilities: GUEST_CAPABILITIES,
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

describe('consent and the free first month', () => {
  const TRIAL_DAYS = 30;

  const rowsOf = async (sql: string, params: unknown[] = []) =>
    (await db!.query(sql, params)).rows as Record<string, unknown>[];

  it(
    'refuses a sign-up that does not say the terms were accepted, and creates no account',
    async () => {
      const { register } = await loadRoutes();
      for (const acceptedTerms of [undefined, false, 'true', 1, null]) {
        const response = await register(
          jsonRequest('/api/auth/register', { ...ALICE, acceptedTerms }),
        );
        expect(response.status).toBe(400);
        expect(response.headers.get('set-cookie')).toBeNull();
        await expect(response.json()).resolves.toMatchObject({
          success: false,
          errorCode: 'TERMS_NOT_ACCEPTED',
        });
      }
      expect(await rowsOf('SELECT id FROM accounts')).toEqual([]);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'records the version of the terms and the time they were accepted with the account',
    async () => {
      const { TERMS_VERSION } = await import('@/lib/legal/versions');
      const { register } = await loadRoutes();
      const before = Date.now();
      expect((await register(jsonRequest('/api/auth/register', ALICE))).status).toBe(201);
      const [row] = await rowsOf(
        'SELECT terms_version, terms_accepted_at FROM accounts WHERE username = $1',
        ['alice'],
      );
      expect(row?.terms_version).toBe(TERMS_VERSION);
      expect(new Date(String(row?.terms_accepted_at)).getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'gives a new account a free membership for the trial days, with the trial quota, and logs it',
    async () => {
      vi.stubEnv('MEMBERSHIP_TRIAL_DAYS', String(TRIAL_DAYS));
      vi.stubEnv('MEMBERSHIP_TRIAL_QUOTA_TOKENS', '500000');
      const { register } = await loadRoutes();
      const before = Date.now();
      expect((await register(jsonRequest('/api/auth/register', ALICE))).status).toBe(201);
      const [member] = await rowsOf(
        `SELECT m.status, m.expires_at, m.monthly_token_quota, m.granted_by
           FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE a.username = $1`,
        ['alice'],
      );
      expect(member).toMatchObject({
        status: 'active',
        monthly_token_quota: 500000,
        granted_by: 'system:trial',
      });
      const days = (new Date(String(member?.expires_at)).getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(TRIAL_DAYS - 0.01);
      expect(days).toBeLessThan(TRIAL_DAYS + 0.01);
      expect(
        await rowsOf('SELECT action, reason FROM account_admin_audit WHERE actor_id = $1', [
          'system:trial',
        ]),
      ).toEqual([{ action: 'membership:grant', reason: 'free first month' }]);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'tells the browser how long the free month is, so the sign-up dialog can promise it',
    async () => {
      vi.stubEnv('MEMBERSHIP_TRIAL_DAYS', String(TRIAL_DAYS));
      const { session } = await loadRoutes();
      await expect((await session(sessionRequest())).json()).resolves.toMatchObject({
        trialDays: TRIAL_DAYS,
      });
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'gives no membership when the trial is off, which is how the rest of this suite runs',
    async () => {
      const { register } = await loadRoutes();
      expect((await register(jsonRequest('/api/auth/register', ALICE))).status).toBe(201);
      expect(await rowsOf('SELECT account_id FROM memberships')).toEqual([]);
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'still signs the account up when the free month cannot be granted',
    async () => {
      vi.stubEnv('MEMBERSHIP_TRIAL_DAYS', String(TRIAL_DAYS));
      const { register } = await loadRoutes();
      await db!.exec('ALTER TABLE memberships RENAME TO memberships_away');
      try {
        const response = await register(jsonRequest('/api/auth/register', ALICE));
        expect(response.status).toBe(201);
        expect(response.headers.get('set-cookie')).toMatch(/^openmaic_session=/);
        expect(await rowsOf('SELECT username FROM accounts')).toEqual([{ username: 'alice' }]);
      } finally {
        await db!.exec('ALTER TABLE memberships_away RENAME TO memberships');
      }
    },
    ROUTE_TIMEOUT_MS,
  );
});

describe('membershipTrial', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is 30 days with half the paid quota when nothing is set', async () => {
    vi.stubEnv('MEMBERSHIP_TRIAL_DAYS', '');
    const { membershipTrial } = await import('@/lib/server/accounts/runtime');
    expect(membershipTrial()).toEqual({ days: 30, monthlyQuota: 500_000 });
  });

  it('is off for 0 and for anything that is not a sensible number of days', async () => {
    const { membershipTrial } = await import('@/lib/server/accounts/runtime');
    for (const value of ['0', '-5', '1.5', 'abc', '400']) {
      vi.stubEnv('MEMBERSHIP_TRIAL_DAYS', value);
      expect(membershipTrial(), value).toBeUndefined();
    }
  });

  it('takes the days and the quota from the environment', async () => {
    vi.stubEnv('MEMBERSHIP_TRIAL_DAYS', '14');
    vi.stubEnv('MEMBERSHIP_TRIAL_QUOTA_TOKENS', '250000');
    const { membershipTrial } = await import('@/lib/server/accounts/runtime');
    expect(membershipTrial()).toEqual({ days: 14, monthlyQuota: 250000 });
  });
});
