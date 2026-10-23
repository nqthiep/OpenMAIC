import { PGlite } from '@electric-sql/pglite';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

import { connection, startFakeOmniRoute, type FakeOmniRoute } from './fake-omniroute';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ADMIN_PASSWORD = 'p'.repeat(24);

let db: PGlite | undefined;
let fake: FakeOmniRoute;

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
  fake = await startFakeOmniRoute(ADMIN_PASSWORD);
}, 60_000);

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://omniroute-connect-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  vi.stubEnv('PROVIDER_SECRET_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('OMNIROUTE_PUBLIC_URL', 'https://omniroute.example.test');
  vi.stubEnv('OMNIROUTE_GATE_SECRET', 'g'.repeat(48));
  vi.stubEnv('OMNIROUTE_ADMIN_PASSWORD', ADMIN_PASSWORD);
  vi.stubEnv('OMNIROUTE_INTERNAL_URL', fake.url);
  vi.stubEnv('OMNIROUTE_API_URL', fake.url);
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  fake.connections = [];
  fake.keys = [];
  fake.models = [];
  fake.calls = [];
  fake.failChat = false;
  fake.password = ADMIN_PASSWORD;
  await db!.exec(
    'TRUNCATE provider_credentials, model_routing, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await fake.close();
  await db?.close();
  db = undefined;
});

async function load() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, overview, connect, test, snapshot, roles] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/admin/omniroute/overview/route'),
    import('@/app/api/admin/omniroute/connect/route'),
    import('@/app/api/admin/omniroute/test/route'),
    import('@/lib/server/provider-store/snapshot'),
    import('@/lib/server/omniroute/roles'),
  ]);
  return {
    register: register.POST,
    overview: overview.GET,
    connect: connect.POST,
    disconnect: connect.DELETE,
    test: test.POST,
    currentSnapshot: snapshot.currentSnapshot,
    roles,
    pool,
  };
}
type Routes = Awaited<ReturnType<typeof load>>;

async function signUp(routes: Routes, username: string): Promise<string> {
  const response = await routes.register(
    new Request(`${ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD, acceptedTerms: true }),
    }),
  );
  return response.headers
    .getSetCookie()
    .find((v) => v.startsWith('openmaic_session='))!
    .split(';')[0]!;
}

const get = (cookie?: string) =>
  new Request(`${ORIGIN}/x`, cookie ? { headers: { cookie } } : undefined);
const send = (
  method: string,
  body: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) =>
  new Request(`${ORIGIN}/x`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function json(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const callsTo = (method: string, path: string) =>
  fake.calls.filter((call) => call.method === method && call.path === path);

async function arrange() {
  const routes = await load();
  const root = await signUp(routes, 'root');
  const alice = await signUp(routes, 'alice');
  return { routes, root, alice, pool: routes.pool };
}

describe('overview', () => {
  it('answers only an administrator', async () => {
    const { routes, root, alice } = await arrange();
    expect((await routes.overview(get())).status).toBe(401);
    expect((await routes.overview(get(alice))).status).toBe(403);
    expect((await routes.overview(get(root))).status).toBe(200);
  });

  it('names the missing environment values and nothing else when not set up', async () => {
    const { routes, root } = await arrange();
    vi.stubEnv('OMNIROUTE_GATE_SECRET', 'short');
    vi.stubEnv('OMNIROUTE_ADMIN_PASSWORD', '');
    const { body } = await json(await routes.overview(get(root)));
    expect(body.overview).toMatchObject({
      state: 'unconfigured',
      missingEnv: ['OMNIROUTE_GATE_SECRET', 'OMNIROUTE_ADMIN_PASSWORD'],
      key: null,
    });
    expect(JSON.stringify(body)).not.toContain('short');
  });

  it('says unreachable when OmniRoute does not answer, and when it refuses the sign-in', async () => {
    const { routes, root } = await arrange();
    vi.stubEnv('OMNIROUTE_INTERNAL_URL', 'http://127.0.0.1:9');
    expect((await json(await routes.overview(get(root)))).body.overview.state).toBe('unreachable');
    vi.stubEnv('OMNIROUTE_INTERNAL_URL', fake.url);
    fake.password = 'another password';
    expect((await json(await routes.overview(get(root)))).body.overview.state).toBe('unreachable');
  });

  it('walks no-providers, no-key and ready, and lists the connections as they are', async () => {
    const { routes, root } = await arrange();
    fake.connections = [connection('c-off', { isActive: false })];
    expect((await json(await routes.overview(get(root)))).body.overview.state).toBe('no-providers');

    fake.connections = [
      connection('c-key', { name: 'OpenAI', provider: 'openai' }),
      connection('c-oauth', { name: 'Claude', provider: 'claude', authType: 'oauth' }),
      connection('c-off', { isActive: false }),
    ];
    const noKey = (await json(await routes.overview(get(root)))).body.overview;
    expect(noKey.state).toBe('no-key');
    expect(noKey.providers).toEqual({ configured: 3, active: 2 });
    expect(noKey.version).toBe('3.8.52');
    expect(noKey.connections).toEqual([
      {
        id: 'c-key',
        name: 'OpenAI',
        provider: 'openai',
        authType: 'apikey',
        active: true,
        subscription: false,
        allowed: false,
      },
      {
        id: 'c-oauth',
        name: 'Claude',
        provider: 'claude',
        authType: 'oauth',
        active: true,
        subscription: true,
        allowed: false,
      },
      {
        id: 'c-off',
        name: 'c-off',
        provider: 'openai',
        authType: 'apikey',
        active: false,
        subscription: false,
        allowed: false,
      },
    ]);
    expect(noKey.deepLinks.providers).toBe('/dashboard/providers');

    await routes.connect(
      send('POST', { connectionIds: ['c-key'], noLog: true, dailyLimitUsd: null }, root),
    );
    const ready = (await json(await routes.overview(get(root)))).body.overview;
    expect(ready.state).toBe('ready');
    expect(ready.key).toMatchObject({ noLog: true, dailyLimitUsd: null, connectionIds: ['c-key'] });
    expect(ready.key.hint).toBe(fake.keys[0]!.key.slice(-4));
    expect(ready.connections.map((c: { allowed: boolean }) => c.allowed)).toEqual([
      true,
      false,
      false,
    ]);
    expect(JSON.stringify(ready)).not.toContain(fake.keys[0]!.key);
  });
});

describe('connect', () => {
  it('makes a key limited to the ticked connections and stores it encrypted', async () => {
    const { routes, root, pool } = await arrange();
    fake.connections = [connection('c-1'), connection('c-2')];
    const { status, body } = await json(
      await routes.connect(
        send('POST', { connectionIds: ['c-2'], noLog: true, dailyLimitUsd: 5 }, root),
      ),
    );
    expect(status).toBe(200);
    expect(body.key).toMatchObject({ noLog: true, dailyLimitUsd: 5, connectionIds: ['c-2'] });

    const created = callsTo('POST', '/api/keys')[0]!.body!;
    expect(created).toMatchObject({
      name: 'OpenMAIC',
      noLog: true,
      allowedConnections: ['c-2'],
      usageLimitEnabled: true,
      dailyUsageLimitUsd: 5,
    });

    const secret = fake.keys[0]!.key;
    const stored = await pool.query(
      `SELECT base_url, key_hint, secret_enc FROM provider_credentials WHERE section = 'providers' AND provider_id = 'omniroute'`,
    );
    const row = stored.rows[0] as { base_url: string; key_hint: string; secret_enc: Buffer };
    expect(row.base_url).toBe(`${fake.url}/v1`);
    expect(row.key_hint).toBe(secret.slice(-4));
    expect(Buffer.from(row.secret_enc).includes(Buffer.from(secret))).toBe(false);
    expect(routes.currentSnapshot().config.providers.omniroute?.apiKey).toBe(secret);
    expect(JSON.stringify(body)).not.toContain(secret);
    const audit = await pool.query(
      `SELECT action FROM account_admin_audit WHERE action = 'omniroute:connect'`,
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('sends no limit when there is none', async () => {
    const { routes, root } = await arrange();
    fake.connections = [connection('c-1')];
    await routes.connect(
      send('POST', { connectionIds: ['c-1'], noLog: false, dailyLimitUsd: null }, root),
    );
    const created = callsTo('POST', '/api/keys')[0]!.body!;
    expect(created.noLog).toBe(false);
    expect(created).not.toHaveProperty('usageLimitEnabled');
  });

  it('refuses nothing ticked, an unknown id, an inactive id and bad bodies, and creates nothing', async () => {
    const { routes, root } = await arrange();
    fake.connections = [connection('c-1'), connection('c-off', { isActive: false })];
    const attempt = async (body: unknown) => json(await routes.connect(send('POST', body, root)));
    expect(
      (await attempt({ connectionIds: [], noLog: true, dailyLimitUsd: null })).body.details,
    ).toBe('no-connections');
    expect(
      (await attempt({ connectionIds: ['nope'], noLog: true, dailyLimitUsd: null })).body.details,
    ).toBe('no-connections');
    expect(
      (await attempt({ connectionIds: ['c-off'], noLog: true, dailyLimitUsd: null })).status,
    ).toBe(400);
    expect((await attempt({ connectionIds: 'c-1', noLog: true })).status).toBe(400);
    expect((await attempt({ connectionIds: ['c-1'], noLog: 'yes' })).status).toBe(400);
    expect((await attempt({ connectionIds: ['c-1'], noLog: true, dailyLimitUsd: -1 })).status).toBe(
      400,
    );
    expect(
      (await attempt({ connectionIds: ['c-1'], noLog: true, dailyLimitUsd: 'a lot' })).status,
    ).toBe(400);
    expect(fake.keys).toHaveLength(0);
  });

  it('changes what an existing key may use without issuing a new secret', async () => {
    const { routes, root } = await arrange();
    fake.connections = [connection('c-1'), connection('c-2')];
    await routes.connect(
      send('POST', { connectionIds: ['c-1'], noLog: true, dailyLimitUsd: null }, root),
    );
    const secret = fake.keys[0]!.key;
    await routes.connect(
      send('POST', { connectionIds: ['c-1', 'c-2'], noLog: false, dailyLimitUsd: 2 }, root),
    );
    expect(fake.keys).toHaveLength(1);
    expect(fake.keys[0]!.key).toBe(secret);
    expect(callsTo('POST', '/api/keys')).toHaveLength(1);
    const patch = callsTo('PATCH', `/api/keys/${fake.keys[0]!.id}`)[0]!.body!;
    expect(patch).toMatchObject({
      noLog: false,
      connectionAccessMode: 'restricted',
      allowedConnections: ['c-1', 'c-2'],
      usageLimitEnabled: true,
      dailyUsageLimitUsd: 2,
    });
    expect(routes.currentSnapshot().config.providers.omniroute?.apiKey).toBe(secret);
  });

  it('replaces a key whose secret the app does not hold', async () => {
    const { routes, root } = await arrange();
    fake.connections = [connection('c-1')];
    fake.keys = [
      {
        id: 'key-old',
        name: 'OpenMAIC',
        key: 'sk-lost-secret',
        noLog: false,
        allowedConnections: [],
        usageLimitEnabled: false,
        dailyUsageLimitUsd: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ];
    await routes.connect(
      send('POST', { connectionIds: ['c-1'], noLog: true, dailyLimitUsd: null }, root),
    );
    expect(callsTo('POST', '/api/keys')).toHaveLength(0);
    expect(callsTo('POST', '/api/keys/key-old/regenerate')).toHaveLength(1);
    const stored = routes.currentSnapshot().config.providers.omniroute?.apiKey;
    expect(stored).toBe(fake.keys[0]!.key);
    expect(stored).not.toBe('sk-lost-secret');
  });

  it('is for an administrator, from this site, and 404 when not set up', async () => {
    const { routes, root, alice } = await arrange();
    fake.connections = [connection('c-1')];
    const body = { connectionIds: ['c-1'], noLog: true, dailyLimitUsd: null };
    expect((await routes.connect(send('POST', body))).status).toBe(401);
    expect((await routes.connect(send('POST', body, alice))).status).toBe(403);
    expect(
      (await routes.connect(send('POST', body, root, { 'sec-fetch-site': 'same-site' }))).status,
    ).toBe(403);
    vi.stubEnv('OMNIROUTE_ADMIN_PASSWORD', '');
    expect((await routes.connect(send('POST', body, root))).status).toBe(404);
    expect(fake.keys).toHaveLength(0);
  });

  it('answers 502 when OmniRoute is down, and 409 when the master key is missing', async () => {
    const { routes, root } = await arrange();
    fake.connections = [connection('c-1')];
    const body = { connectionIds: ['c-1'], noLog: true, dailyLimitUsd: null };
    vi.stubEnv('OMNIROUTE_INTERNAL_URL', 'http://127.0.0.1:9');
    const down = await json(await routes.connect(send('POST', body, root)));
    expect(down).toMatchObject({ status: 502, body: { details: 'unreachable' } });
    vi.stubEnv('OMNIROUTE_INTERNAL_URL', fake.url);
    vi.stubEnv('PROVIDER_SECRET_KEY', '');
    const noMaster = await json(await routes.connect(send('POST', body, root)));
    expect(noMaster).toMatchObject({ status: 409, body: { errorCode: 'MASTER_KEY_MISSING' } });
  });
});

describe('rotate and disconnect', () => {
  async function connected() {
    const arranged = await arrange();
    fake.connections = [connection('c-1')];
    await arranged.routes.connect(
      send('POST', { connectionIds: ['c-1'], noLog: true, dailyLimitUsd: null }, arranged.root),
    );
    return arranged;
  }

  it('issues a new secret and stores it', async () => {
    const { routes, root } = await connected();
    const before = fake.keys[0]!.key;
    const { status, body } = await json(await routes.connect(send('POST', { rotate: true }, root)));
    expect(status).toBe(200);
    expect(fake.keys[0]!.key).not.toBe(before);
    expect(routes.currentSnapshot().config.providers.omniroute?.apiKey).toBe(fake.keys[0]!.key);
    expect(body.key.hint).toBe(fake.keys[0]!.key.slice(-4));
  });

  it('has nothing to rotate before connecting', async () => {
    const { routes, root } = await arrange();
    fake.connections = [connection('c-1')];
    expect(await json(await routes.connect(send('POST', { rotate: true }, root)))).toMatchObject({
      status: 409,
      body: { details: 'not-ready' },
    });
  });

  it('removes the key, the credential and the routes that point at OmniRoute, and only those', async () => {
    const { routes, root, pool } = await connected();
    const actor = { actorId: 'root-id', now: new Date() };
    await routes.roles.writeRoles(
      pool as never,
      {
        generate: { model: 'auto/best-vision', vision: true, tools: true },
        chat: { model: 'auto/best-chat', vision: false, tools: true },
        grade: { model: 'auto/best-reasoning', vision: false, tools: true },
        utility: { model: 'auto/cheap', vision: false, tools: true },
      },
      actor,
    );
    await pool.query(
      `UPDATE model_routing SET value = '"openai:gpt-5"'::jsonb WHERE stage = 'quiz-grade'`,
    );

    const { status, body } = await json(await routes.disconnect(send('DELETE', undefined, root)));
    expect(status).toBe(200);
    expect(body.clearedStages).toContain('default');
    expect(body.clearedStages).toContain('scene-content');
    expect(body.clearedStages).not.toContain('quiz-grade');
    expect(fake.keys).toHaveLength(0);
    const rows = await pool.query(`SELECT stage FROM model_routing`);
    expect(rows.rows.map((r) => (r as { stage: string }).stage)).toContain('quiz-grade');
    expect(
      (await pool.query(`SELECT 1 FROM provider_credentials WHERE provider_id = 'omniroute'`)).rows,
    ).toHaveLength(0);
    expect(routes.currentSnapshot().config.providers.omniroute).toBeUndefined();
  });

  it('cleans this side even when OmniRoute is down', async () => {
    const { routes, root, pool } = await connected();
    vi.stubEnv('OMNIROUTE_INTERNAL_URL', 'http://127.0.0.1:9');
    expect((await routes.disconnect(send('DELETE', undefined, root))).status).toBe(200);
    expect(
      (await pool.query(`SELECT 1 FROM provider_credentials WHERE provider_id = 'omniroute'`)).rows,
    ).toHaveLength(0);
  });

  it('is for an administrator from this site', async () => {
    const { routes, alice } = await connected();
    expect((await routes.disconnect(send('DELETE', undefined))).status).toBe(401);
    expect((await routes.disconnect(send('DELETE', undefined, alice))).status).toBe(403);
  });
});

describe('test', () => {
  it("sends one tiny request through the role's model with the stored key", async () => {
    const { routes, root, pool } = await arrange();
    fake.connections = [connection('c-1')];
    await routes.connect(
      send('POST', { connectionIds: ['c-1'], noLog: true, dailyLimitUsd: null }, root),
    );
    await routes.roles.writeRoles(
      pool as never,
      {
        generate: { model: 'auto/best-vision', vision: true, tools: true },
        chat: { model: 'auto/best-chat', vision: false, tools: true },
        grade: { model: 'auto/best-reasoning', vision: false, tools: true },
        utility: { model: 'auto/cheap', vision: false, tools: true },
      },
      { actorId: 'x', now: new Date() },
    );
    const { refreshProviderSnapshot } = await import('@/lib/server/provider-store/snapshot');
    await refreshProviderSnapshot(pool as never);
    const { status, body } = await json(await routes.test(send('POST', { role: 'chat' }, root)));
    expect(status).toBe(200);
    expect(body.model).toBe('auto/best-chat');
    expect(typeof body.latencyMs).toBe('number');
    const chat = callsTo('POST', '/v1/chat/completions')[0]!.body!;
    expect(chat.model).toBe('auto/best-chat');
    expect(chat.max_tokens).toBe(8);
  });

  it('refuses a role that has no model yet, a bad role, and reports a failing model as 502', async () => {
    const { routes, root, pool } = await arrange();
    fake.connections = [connection('c-1')];
    await routes.connect(
      send('POST', { connectionIds: ['c-1'], noLog: true, dailyLimitUsd: null }, root),
    );
    expect(await json(await routes.test(send('POST', { role: 'chat' }, root)))).toMatchObject({
      status: 409,
      body: { details: 'not-ready' },
    });
    expect((await routes.test(send('POST', { role: 'everything' }, root))).status).toBe(400);
    await routes.roles.writeRoles(
      pool as never,
      {
        generate: { model: 'a', vision: false, tools: false },
        chat: { model: 'a', vision: false, tools: false },
        grade: { model: 'a', vision: false, tools: false },
        utility: { model: 'a', vision: false, tools: false },
      },
      { actorId: 'x', now: new Date() },
    );
    const { refreshProviderSnapshot } = await import('@/lib/server/provider-store/snapshot');
    await refreshProviderSnapshot(pool as never);
    fake.failChat = true;
    expect(await json(await routes.test(send('POST', { role: 'chat' }, root)))).toMatchObject({
      status: 502,
      body: { details: 'model-failed' },
    });
  });
});
