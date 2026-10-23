import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashSessionToken } from '@/lib/server/accounts/session';
import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'https://omniroute.example.test';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const GATE_SECRET = 'g'.repeat(48);
const ADMIN_PASSWORD = 'p'.repeat(24);
const NO_SESSION = '0'.repeat(32);

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
}, 60_000);

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://omniroute-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  vi.stubEnv('OMNIROUTE_PUBLIC_URL', ORIGIN);
  vi.stubEnv('OMNIROUTE_GATE_SECRET', GATE_SECRET);
  vi.stubEnv('OMNIROUTE_ADMIN_PASSWORD', ADMIN_PASSWORD);
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  await db!.exec(
    'TRUNCATE account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await db?.close();
  db = undefined;
});

async function load() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, open, enter, check, token] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/admin/omniroute/open/route'),
    import('@/app/api/admin/omniroute/enter/route'),
    import('@/app/api/admin/omniroute/check/route'),
    import('@/lib/server/omniroute/token'),
  ]);
  return {
    register: register.POST,
    open: open.POST,
    enter: enter.GET,
    check: check.GET,
    token,
  };
}
type Routes = Awaited<ReturnType<typeof load>>;
type Who = { cookie: string; id: string; sessionKey: string };

async function signUp(routes: Routes, username: string): Promise<Who> {
  const response = await routes.register(
    new Request(`${ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD, acceptedTerms: true }),
    }),
  );
  const cookie = response.headers
    .getSetCookie()
    .find((v) => v.startsWith('openmaic_session='))!
    .split(';')[0]!;
  const rows = (await db!.query('SELECT id FROM accounts WHERE username = $1', [username])).rows;
  const sessionToken = cookie.slice('openmaic_session='.length);
  return {
    cookie,
    id: (rows[0] as { id: string }).id,
    sessionKey: hashSessionToken(sessionToken).slice(0, 32),
  };
}

/** A gate cookie or ticket for the session `who` signed up with, unless told otherwise. */
function mint(
  routes: Routes,
  kind: 'ticket' | 'gate',
  who: { id: string; sessionKey: string },
  options: { secret?: string; now?: number } = {},
) {
  const { TICKET_TTL_MS, GATE_TTL_MS, mintToken } = routes.token;
  const ttl = kind === 'ticket' ? TICKET_TTL_MS : GATE_TTL_MS;
  return mintToken(kind, who.id, who.sessionKey, ttl, options.secret ?? GATE_SECRET, options.now);
}

const post = (cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/admin/omniroute/open`, {
    method: 'POST',
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
const enterRequest = (ticket: string) =>
  new Request(`${ORIGIN}/api/admin/omniroute/enter?t=${encodeURIComponent(ticket)}`);
const checkRequest = (gate?: string) =>
  new Request(
    `${ORIGIN}/api/admin/omniroute/check`,
    gate ? { headers: { cookie: `omniroute_gate=${gate}` } } : undefined,
  );

function stubOmniRoute(response: () => Response) {
  const fetchMock = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const signedIn = () =>
  new Response('{"success":true}', {
    status: 200,
    headers: { 'set-cookie': 'auth_token=jwt-value; Path=/; HttpOnly; SameSite=lax' },
  });

/** Moves `Date` forward so the 15 s memory of the gate check has passed. */
async function afterCheckMemory<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 16_000);
  try {
    return await run();
  } finally {
    vi.useRealTimers();
  }
}

describe('open', () => {
  it('gives an administrator a ticket for the current session, and writes an audit row', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const response = await routes.open(post(root.cookie));
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect(url.startsWith(`${ORIGIN}/__enter?t=`)).toBe(true);
    const ticket = new URL(url).searchParams.get('t')!;
    expect(routes.token.verifyToken('ticket', ticket, GATE_SECRET)).toMatchObject({
      accountId: root.id,
      sessionKey: root.sessionKey,
    });
    const audit = await db!.query(
      `SELECT actor_id FROM account_admin_audit WHERE action = 'omniroute:open'`,
    );
    expect(audit.rows).toEqual([{ actor_id: root.id }]);
  });

  it('refuses anonymous visitors, learners and cross-site posts', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const alice = await signUp(routes, 'alice');
    expect((await routes.open(post())).status).toBe(401);
    expect((await routes.open(post(alice.cookie))).status).toBe(403);
    const crossSite = await routes.open(post(root.cookie, { 'sec-fetch-site': 'cross-site' }));
    expect(crossSite.status).toBe(403);
    const sameSite = await routes.open(post(root.cookie, { 'sec-fetch-site': 'same-site' }));
    expect(sameSite.status).toBe(403);
    const audit = await db!.query(
      `SELECT 1 FROM account_admin_audit WHERE action = 'omniroute:open'`,
    );
    expect(audit.rows).toHaveLength(0);
  });

  it('is 404 when OmniRoute is not set up', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    vi.stubEnv('OMNIROUTE_PUBLIC_URL', '');
    expect((await routes.open(post(root.cookie))).status).toBe(404);
  });

  it("puts one of OmniRoute's own pages in the address, and refuses any other path", async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const withBody = (body: unknown) =>
      new Request(`${ORIGIN}/api/admin/omniroute/open`, {
        method: 'POST',
        headers: { cookie: root.cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const good = await routes.open(withBody({ path: '/dashboard/providers' }));
    expect(good.status).toBe(200);
    const { url } = (await good.json()) as { url: string };
    expect(new URL(url).searchParams.get('to')).toBe('/dashboard/providers');
    for (const path of [
      '/dashboard/../api/keys',
      'https://evil.test/',
      '//evil.test',
      '/api/keys',
      7,
    ]) {
      expect((await routes.open(withBody({ path }))).status, String(path)).toBe(400);
    }
    expect((await routes.open(withBody({}))).status).toBe(200);
  });
});

describe('check', () => {
  it('lets an administrator with a gate cookie through', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    expect((await routes.check(checkRequest(mint(routes, 'gate', root)))).status).toBe(204);
  });

  it('refuses no cookie, junk, an expired cookie, a ticket, another secret and a duplicate', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    expect((await routes.check(checkRequest())).status).toBe(401);
    expect((await routes.check(checkRequest('junk'))).status).toBe(401);
    const expired = mint(routes, 'gate', root, { now: Date.now() - 2 * routes.token.GATE_TTL_MS });
    expect((await routes.check(checkRequest(expired))).status).toBe(401);
    expect((await routes.check(checkRequest(mint(routes, 'ticket', root)))).status).toBe(401);
    const foreign = mint(routes, 'gate', root, { secret: 'x'.repeat(48) });
    expect((await routes.check(checkRequest(foreign))).status).toBe(401);
    const good = mint(routes, 'gate', root);
    const twice = new Request(`${ORIGIN}/api/admin/omniroute/check`, {
      headers: { cookie: `omniroute_gate=${good}; omniroute_gate=${good}` },
    });
    expect((await routes.check(twice)).status).toBe(401);
  });

  it('refuses a learner, a disabled administrator, an unknown account and a closed gate', async () => {
    const routes = await load();
    const alice = await signUp(routes, 'alice');
    const bob = await signUp(routes, 'bob');
    await db!.query(`UPDATE accounts SET role = 'admin', disabled_at = now() WHERE id = $1`, [
      bob.id,
    ]);
    expect((await routes.check(checkRequest(mint(routes, 'gate', alice)))).status).toBe(403);
    expect((await routes.check(checkRequest(mint(routes, 'gate', bob)))).status).toBe(403);
    const stranger = { id: 'no-such-account', sessionKey: NO_SESSION };
    expect((await routes.check(checkRequest(mint(routes, 'gate', stranger)))).status).toBe(403);
    const gate = mint(routes, 'gate', alice);
    vi.stubEnv('OMNIROUTE_GATE_SECRET', '');
    expect((await routes.check(checkRequest(gate))).status).toBe(404);
  });

  it('stops admitting an administrator who was demoted, once the 15 s memory has passed', async () => {
    const routes = await load();
    const carol = await signUp(routes, 'carol');
    await db!.query(`UPDATE accounts SET role = 'admin' WHERE id = $1`, [carol.id]);
    const gate = mint(routes, 'gate', carol);
    expect((await routes.check(checkRequest(gate))).status).toBe(204);
    await db!.query(`UPDATE accounts SET role = 'learner' WHERE id = $1`, [carol.id]);
    expect((await routes.check(checkRequest(gate))).status).toBe(204); // remembered
    const later = await afterCheckMemory(() => routes.check(checkRequest(gate)));
    expect(later.status).toBe(403);
  });

  it('closes the gate when the OpenMAIC session it was opened from is signed out', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const gate = mint(routes, 'gate', root);
    expect((await routes.check(checkRequest(gate))).status).toBe(204);
    await db!.query(
      `UPDATE account_sessions SET revoked_at = now() WHERE left(token_hash, 32) = $1`,
      [root.sessionKey],
    );
    expect((await routes.check(checkRequest(gate))).status).toBe(204); // remembered
    const later = await afterCheckMemory(() => routes.check(checkRequest(gate)));
    expect(later.status).toBe(403);
  });

  it('closes the gate when that session has expired', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    await db!.query(
      `UPDATE account_sessions SET expires_at = now() - interval '1 minute' WHERE left(token_hash, 32) = $1`,
      [root.sessionKey],
    );
    expect((await routes.check(checkRequest(mint(routes, 'gate', root)))).status).toBe(403);
  });

  it('refuses a gate cookie that names a session the account does not have', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const other = { id: root.id, sessionKey: NO_SESSION };
    expect((await routes.check(checkRequest(mint(routes, 'gate', other)))).status).toBe(403);
  });

  it("does not take another account's session for its own", async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const alice = await signUp(routes, 'alice');
    const crossed = { id: root.id, sessionKey: alice.sessionKey };
    expect((await routes.check(checkRequest(mint(routes, 'gate', crossed)))).status).toBe(403);
  });
});

describe('enter', () => {
  it("trades a ticket for the gate cookie and OmniRoute's own cookie, and the gate then admits", async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const fetchMock = stubOmniRoute(signedIn);
    const { url } = (await (await routes.open(post(root.cookie))).json()) as { url: string };
    const ticket = new URL(url).searchParams.get('t')!;

    const response = await routes.enter(enterRequest(ticket));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookies = response.headers.getSetCookie();
    const gate = cookies.find((c) => c.startsWith('omniroute_gate='))!;
    expect(gate).toContain('HttpOnly');
    expect(gate).toContain('Secure');
    expect(gate).not.toContain('Domain');
    expect(cookies.find((c) => c.startsWith('auth_token='))).toMatch(/Secure$/);
    expect(cookies).toHaveLength(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe('http://omniroute:20128/api/auth/login');
    expect(JSON.parse(String(init.body))).toEqual({ password: ADMIN_PASSWORD });

    const gateValue = gate.split(';')[0]!.split('=').slice(1).join('=');
    expect(routes.token.verifyToken('gate', gateValue, GATE_SECRET)).toMatchObject({
      accountId: root.id,
      sessionKey: root.sessionKey,
    });
    expect((await routes.check(checkRequest(gateValue))).status).toBe(204);
  });

  it('lands on the page asked for, or on the front page for anything else', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    stubOmniRoute(signedIn);
    const landing = async (query: string) => {
      const ticket = mint(routes, 'ticket', root);
      const response = await routes.enter(
        new Request(`${ORIGIN}/api/admin/omniroute/enter?t=${encodeURIComponent(ticket)}${query}`),
      );
      return response.headers.get('location');
    };
    expect(await landing('&to=%2Fdashboard%2Fcombos')).toBe(`${ORIGIN}/dashboard/combos`);
    expect(await landing('&to=%2Fapi%2Fkeys')).toBe(`${ORIGIN}/`);
    expect(await landing('&to=https%3A%2F%2Fevil.test%2F')).toBe(`${ORIGIN}/`);
    expect(await landing('')).toBe(`${ORIGIN}/`);
  });

  it('accepts a ticket once', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    stubOmniRoute(signedIn);
    const ticket = mint(routes, 'ticket', root);
    expect((await routes.enter(enterRequest(ticket))).status).toBe(302);
    expect((await routes.enter(enterRequest(ticket))).status).toBe(403);
  });

  it('refuses a missing, expired, wrong-kind or learner ticket without calling OmniRoute', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const alice = await signUp(routes, 'alice');
    const fetchMock = stubOmniRoute(signedIn);
    const expired = mint(routes, 'ticket', root, {
      now: Date.now() - 2 * routes.token.TICKET_TTL_MS,
    });
    const tickets = [
      '',
      'junk',
      expired,
      mint(routes, 'gate', root),
      mint(routes, 'ticket', alice),
      mint(routes, 'ticket', root, { secret: 'x'.repeat(48) }),
    ];
    for (const ticket of tickets) {
      const response = await routes.enter(enterRequest(ticket));
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a ticket from a session that was signed out, or that never existed', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const fetchMock = stubOmniRoute(signedIn);
    const ticket = mint(routes, 'ticket', root);
    await db!.query(
      `UPDATE account_sessions SET revoked_at = now() WHERE left(token_hash, 32) = $1`,
      [root.sessionKey],
    );
    const signedOut = await routes.enter(enterRequest(ticket));
    expect(signedOut.status).toBe(403);
    expect(signedOut.headers.getSetCookie()).toHaveLength(0);
    const invented = mint(routes, 'ticket', { id: root.id, sessionKey: NO_SESSION });
    expect((await routes.enter(enterRequest(invented))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets no cookie when OmniRoute refuses the sign-in, and never shows the password', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const fetchMock = stubOmniRoute(
      () => new Response('{"error":"Invalid password"}', { status: 401 }),
    );
    const response = await routes.enter(enterRequest(mint(routes, 'ticket', root)));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(await response.text()).not.toContain(ADMIN_PASSWORD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sets no cookie when OmniRoute answers without its session cookie', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    stubOmniRoute(() => new Response('{"success":true}', { status: 200 }));
    const response = await routes.enter(enterRequest(mint(routes, 'ticket', root)));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('sets no cookie when OmniRoute is unreachable', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const response = await routes.enter(enterRequest(mint(routes, 'ticket', root)));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('is 404 when OmniRoute is not set up', async () => {
    const routes = await load();
    vi.stubEnv('OMNIROUTE_ADMIN_PASSWORD', '');
    expect((await routes.enter(enterRequest('x'))).status).toBe(404);
  });
});
