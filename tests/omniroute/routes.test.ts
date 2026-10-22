import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'https://omniroute.example.test';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const GATE_SECRET = 'g'.repeat(48);
const ADMIN_PASSWORD = 'p'.repeat(24);

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
  const [register, status, open, enter, check, token] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/admin/omniroute/status/route'),
    import('@/app/api/admin/omniroute/open/route'),
    import('@/app/api/admin/omniroute/enter/route'),
    import('@/app/api/admin/omniroute/check/route'),
    import('@/lib/server/omniroute/token'),
  ]);
  return {
    register: register.POST,
    status: status.GET,
    open: open.POST,
    enter: enter.GET,
    check: check.GET,
    token,
  };
}
type Routes = Awaited<ReturnType<typeof load>>;

async function signUp(routes: Routes, username: string): Promise<{ cookie: string; id: string }> {
  const response = await routes.register(
    new Request(`${ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    }),
  );
  const cookie = response.headers
    .getSetCookie()
    .find((v) => v.startsWith('openmaic_session='))!
    .split(';')[0]!;
  const rows = (await db!.query('SELECT id FROM accounts WHERE username = $1', [username])).rows;
  return { cookie, id: (rows[0] as { id: string }).id };
}

const withCookie = (cookie?: string): RequestInit => (cookie ? { headers: { cookie } } : {});
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

describe('status', () => {
  it('answers only an administrator', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const alice = await signUp(routes, 'alice');
    const url = `${ORIGIN}/api/admin/omniroute/status`;
    expect((await routes.status(new Request(url))).status).toBe(401);
    expect((await routes.status(new Request(url, withCookie(alice.cookie)))).status).toBe(403);
    const ok = await routes.status(new Request(url, withCookie(root.cookie)));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ enabled: true });
  });

  it('says disabled when the environment is incomplete', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    vi.stubEnv('OMNIROUTE_GATE_SECRET', 'short');
    const response = await routes.status(
      new Request(`${ORIGIN}/api/admin/omniroute/status`, withCookie(root.cookie)),
    );
    expect(await response.json()).toMatchObject({ enabled: false });
  });
});

describe('open', () => {
  it('gives an administrator a ticket address, and writes an audit row', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const response = await routes.open(post(root.cookie));
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect(url.startsWith(`${ORIGIN}/__enter?t=`)).toBe(true);
    const ticket = new URL(url).searchParams.get('t')!;
    expect(routes.token.verifyToken('ticket', ticket, GATE_SECRET)).toMatchObject({
      accountId: root.id,
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
    expect(
      (await db!.query(`SELECT 1 FROM account_admin_audit WHERE action = 'omniroute:open'`)).rows,
    ).toHaveLength(0);
  });

  it('is 404 when OmniRoute is not set up', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    vi.stubEnv('OMNIROUTE_PUBLIC_URL', '');
    expect((await routes.open(post(root.cookie))).status).toBe(404);
  });
});

describe('check', () => {
  it('lets an administrator with a gate cookie through', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const gate = routes.token.mintToken('gate', root.id, routes.token.GATE_TTL_MS, GATE_SECRET);
    expect((await routes.check(checkRequest(gate))).status).toBe(204);
  });

  it('refuses no cookie, junk, an expired cookie, a ticket, another secret and a duplicate', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const { mintToken, GATE_TTL_MS, TICKET_TTL_MS } = routes.token;
    expect((await routes.check(checkRequest())).status).toBe(401);
    expect((await routes.check(checkRequest('junk'))).status).toBe(401);
    const expired = mintToken(
      'gate',
      root.id,
      GATE_TTL_MS,
      GATE_SECRET,
      Date.now() - 2 * GATE_TTL_MS,
    );
    expect((await routes.check(checkRequest(expired))).status).toBe(401);
    const ticket = mintToken('ticket', root.id, TICKET_TTL_MS, GATE_SECRET);
    expect((await routes.check(checkRequest(ticket))).status).toBe(401);
    const foreign = mintToken('gate', root.id, GATE_TTL_MS, 'x'.repeat(48));
    expect((await routes.check(checkRequest(foreign))).status).toBe(401);
    const good = mintToken('gate', root.id, GATE_TTL_MS, GATE_SECRET);
    const twice = new Request(`${ORIGIN}/api/admin/omniroute/check`, {
      headers: { cookie: `omniroute_gate=${good}; omniroute_gate=${good}` },
    });
    expect((await routes.check(twice)).status).toBe(401);
  });

  it('refuses a learner, a disabled administrator, an unknown account and a closed gate', async () => {
    const routes = await load();
    const { mintToken, GATE_TTL_MS } = routes.token;
    const alice = await signUp(routes, 'alice');
    const bob = await signUp(routes, 'bob');
    await db!.query(`UPDATE accounts SET role = 'admin', disabled_at = now() WHERE id = $1`, [
      bob.id,
    ]);
    const gateFor = (id: string) => mintToken('gate', id, GATE_TTL_MS, GATE_SECRET);
    expect((await routes.check(checkRequest(gateFor(alice.id)))).status).toBe(403);
    expect((await routes.check(checkRequest(gateFor(bob.id)))).status).toBe(403);
    expect((await routes.check(checkRequest(gateFor('no-such-account')))).status).toBe(403);
    vi.stubEnv('OMNIROUTE_GATE_SECRET', '');
    expect((await routes.check(checkRequest(gateFor(alice.id)))).status).toBe(404);
  });

  it('stops admitting an administrator who was demoted, once the 15 s memory has passed', async () => {
    const routes = await load();
    const carol = await signUp(routes, 'carol');
    await db!.query(`UPDATE accounts SET role = 'admin' WHERE id = $1`, [carol.id]);
    const gate = routes.token.mintToken('gate', carol.id, routes.token.GATE_TTL_MS, GATE_SECRET);
    expect((await routes.check(checkRequest(gate))).status).toBe(204);
    await db!.query(`UPDATE accounts SET role = 'learner' WHERE id = $1`, [carol.id]);
    expect((await routes.check(checkRequest(gate))).status).toBe(204); // remembered
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16_000);
    try {
      expect((await routes.check(checkRequest(gate))).status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
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
    expect((await routes.check(checkRequest(gateValue))).status).toBe(204);
  });

  it('accepts a ticket once', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    stubOmniRoute(signedIn);
    const ticket = routes.token.mintToken(
      'ticket',
      root.id,
      routes.token.TICKET_TTL_MS,
      GATE_SECRET,
    );
    expect((await routes.enter(enterRequest(ticket))).status).toBe(302);
    expect((await routes.enter(enterRequest(ticket))).status).toBe(403);
  });

  it('refuses a missing, expired, wrong-kind or learner ticket without calling OmniRoute', async () => {
    const routes = await load();
    const { mintToken, TICKET_TTL_MS, GATE_TTL_MS } = routes.token;
    const root = await signUp(routes, 'root');
    const alice = await signUp(routes, 'alice');
    const fetchMock = stubOmniRoute(signedIn);
    const expired = mintToken(
      'ticket',
      root.id,
      TICKET_TTL_MS,
      GATE_SECRET,
      Date.now() - 2 * TICKET_TTL_MS,
    );
    const cookieAsTicket = mintToken('gate', root.id, GATE_TTL_MS, GATE_SECRET);
    const learner = mintToken('ticket', alice.id, TICKET_TTL_MS, GATE_SECRET);
    for (const ticket of ['', 'junk', expired, cookieAsTicket, learner]) {
      const response = await routes.enter(enterRequest(ticket));
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets no cookie when OmniRoute refuses the sign-in, and never shows the password', async () => {
    const routes = await load();
    const root = await signUp(routes, 'root');
    const fetchMock = stubOmniRoute(
      () => new Response('{"error":"Invalid password"}', { status: 401 }),
    );
    const ticket = routes.token.mintToken(
      'ticket',
      root.id,
      routes.token.TICKET_TTL_MS,
      GATE_SECRET,
    );
    const response = await routes.enter(enterRequest(ticket));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(await response.text()).not.toContain(ADMIN_PASSWORD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const ticket = routes.token.mintToken(
      'ticket',
      root.id,
      routes.token.TICKET_TTL_MS,
      GATE_SECRET,
    );
    const response = await routes.enter(enterRequest(ticket));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('is 404 when OmniRoute is not set up', async () => {
    const routes = await load();
    vi.stubEnv('OMNIROUTE_ADMIN_PASSWORD', '');
    expect((await routes.enter(enterRequest('x'))).status).toBe(404);
  });
});
