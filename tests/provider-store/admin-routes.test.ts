import { PGlite } from '@electric-sql/pglite';
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ROOT = { username: 'root', password: PASSWORD, acceptedTerms: true };
const ALICE = { username: 'alice', password: PASSWORD, acceptedTerms: true };
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const MASTER_KEY = randomBytes(32).toString('base64');
const SECRET = 'sk-admin-test-0123456789';

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
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://provider-admin-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  vi.stubEnv('PROVIDER_SECRET_KEY', MASTER_KEY);
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  await db!.exec(
    'TRUNCATE provider_credentials, model_routing, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
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
  const [register, list, one, routing, snapshot] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/admin/providers/route'),
    import('@/app/api/admin/providers/[section]/[providerId]/route'),
    import('@/app/api/admin/model-routing/route'),
    import('@/lib/server/provider-store/snapshot'),
  ]);
  return {
    register: register.POST,
    list: list.GET,
    save: one.PUT,
    remove: one.DELETE,
    routePut: routing.PUT,
    routeDelete: routing.DELETE,
    currentSnapshot: snapshot.currentSnapshot,
  };
}
type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(method: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/x`, { method, headers, body: JSON.stringify(body) });
}

function getRequest(cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}/x`, cookie ? { headers: { cookie } } : undefined);
}

async function signUp(routes: Routes, account: { username: string; password: string }) {
  const response = await routes.register(
    new Request(`${ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(account),
    }),
  );
  return response.headers
    .getSetCookie()
    .find((v) => v.startsWith('openmaic_session='))!
    .split(';')[0]!;
}

const target = (section: string, providerId: string) => ({
  params: Promise.resolve({ section, providerId }),
});

// The response bodies are read loosely: each test asserts only the fields it cares about.
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function json(response: Response) {
  return { status: response.status, body: (await response.clone().json()) as Body };
}

async function arrange() {
  const routes = await loadRoutes();
  const root = await signUp(routes, ROOT);
  const alice = await signUp(routes, ALICE);
  return { routes, root, alice };
}

describe('provider admin routes', () => {
  it('lets only an administrator save, and refuses a learner and an anonymous visitor', async () => {
    const { routes, root, alice } = await arrange();
    const body = { expectedVersion: 0, secret: { apiKey: SECRET } };
    expect(
      (
        await json(
          await routes.save(jsonRequest('PUT', body, alice), target('providers', 'openai')),
        )
      ).status,
    ).toBe(403);
    expect([401, 403]).toContain(
      (await json(await routes.save(jsonRequest('PUT', body), target('providers', 'openai'))))
        .status,
    );
    expect(
      (await json(await routes.save(jsonRequest('PUT', body, root), target('providers', 'openai'))))
        .status,
    ).toBe(200);
  });

  it('keeps the key out of every response and out of the audit log, and serves it at once', async () => {
    const { routes, root } = await arrange();
    const saved = await routes.save(
      jsonRequest(
        'PUT',
        { expectedVersion: 0, baseUrl: 'https://gw.example/v1', secret: { apiKey: SECRET } },
        root,
      ),
      target('providers', 'openai'),
    );
    expect(JSON.stringify((await json(saved)).body)).not.toContain(SECRET);
    const listed = await json(await routes.list(getRequest(root)));
    expect(JSON.stringify(listed.body)).not.toContain(SECRET);
    expect(listed.body.rows[0]).toMatchObject({
      providerId: 'openai',
      complete: true,
      keyHint: '6789',
      has: { apiKey: true },
    });
    expect(listed.body).toMatchObject({ canManage: true, masterKey: 'ok' });
    expect(routes.currentSnapshot().config.providers.openai).toMatchObject({
      apiKey: SECRET,
      baseUrl: 'https://gw.example/v1',
    });
    const audit = await db!.query('SELECT reason FROM account_admin_audit WHERE action = $1', [
      'provider:set',
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(SECRET);
  });

  it('refuses a stale form with 409 and an unknown provider or field with 400', async () => {
    const { routes, root } = await arrange();
    await routes.save(
      jsonRequest('PUT', { expectedVersion: 0, secret: { apiKey: SECRET } }, root),
      target('tts', 'openai-tts'),
    );
    const stale = await json(
      await routes.save(
        jsonRequest('PUT', { expectedVersion: 0, enabled: false }, root),
        target('tts', 'openai-tts'),
      ),
    );
    expect(stale).toMatchObject({ status: 409, body: { errorCode: 'VERSION_CONFLICT' } });
    for (const [section, id, body] of [
      ['tts', 'no-such-provider', { expectedVersion: 0 }],
      ['nope', 'openai', { expectedVersion: 0 }],
      ['providers', 'openai', { expectedVersion: 0, secret: { password: 'x' } }],
      ['providers', 'openai', { expectedVersion: 0, baseUrl: 'ftp://x' }],
      ['providers', 'openai', { expectedVersion: 0, baseUrl: 'http://169.254.169.254/latest' }],
      ['providers', 'openai', { expectedVersion: 0, secret: { apiKey: 'a\nb' } }],
      ['providers', 'openai', { expectedVersion: 0, secret: { proxy: 'not a url' } }],
      ['providers', 'openai', { expectedVersion: 0, enabled: false }],
      ['providers', 'openai', {}],
    ] as const) {
      expect(
        (await json(await routes.save(jsonRequest('PUT', body, root), target(section, id)))).status,
        `${section}/${id} ${JSON.stringify(body)}`,
      ).toBe(400);
    }
  });

  it('accepts a compose-network base URL for a local provider', async () => {
    const { routes, root } = await arrange();
    const saved = await json(
      await routes.save(
        jsonRequest('PUT', { expectedVersion: 0, baseUrl: 'http://ollama:11434' }, root),
        target('providers', 'ollama'),
      ),
    );
    expect(saved.status).toBe(200);
    expect(routes.currentSnapshot().config.providers.ollama.baseUrl).toBe('http://ollama:11434');
  });

  it('answers 500 MASTER_KEY_MISSING when a secret cannot be encrypted', async () => {
    const { routes, root } = await arrange();
    vi.stubEnv('PROVIDER_SECRET_KEY', '');
    const response = await json(
      await routes.save(
        jsonRequest('PUT', { expectedVersion: 0, secret: { apiKey: SECRET } }, root),
        target('providers', 'openai'),
      ),
    );
    expect(response).toMatchObject({ status: 500, body: { errorCode: 'MASTER_KEY_MISSING' } });
    expect((await json(await routes.list(getRequest(root)))).body.masterKey).toBe('missing');
  });

  it('removes a provider and stops serving it', async () => {
    const { routes, root } = await arrange();
    await routes.save(
      jsonRequest('PUT', { expectedVersion: 0, secret: { apiKey: SECRET } }, root),
      target('providers', 'openai'),
    );
    const removed = await json(
      await routes.remove(
        new Request(`${ORIGIN}/x`, { method: 'DELETE', headers: { cookie: root } }),
        target('providers', 'openai'),
      ),
    );
    expect(removed.status).toBe(200);
    expect(routes.currentSnapshot().config.providers.openai).toBeUndefined();
    const again = await json(
      await routes.remove(
        new Request(`${ORIGIN}/x`, { method: 'DELETE', headers: { cookie: root } }),
        target('providers', 'openai'),
      ),
    );
    expect(again.status).toBe(404);
  });
});

describe('provider admin routes: access and edge cases', () => {
  it('lets operators read but not change, and hides the base URL from them', async () => {
    const { routes, root, alice } = await arrange();
    await routes.save(
      jsonRequest(
        'PUT',
        { expectedVersion: 0, baseUrl: 'https://gw.internal/v1', secret: { apiKey: SECRET } },
        root,
      ),
      target('providers', 'openai'),
    );
    await db!.query("UPDATE accounts SET role = 'operator' WHERE username = 'alice'");

    const asAdmin = await json(await routes.list(getRequest(root)));
    expect(asAdmin.body.rows[0].baseUrl).toBe('https://gw.internal/v1');

    const asOperator = await json(await routes.list(getRequest(alice)));
    expect(asOperator.status).toBe(200);
    expect(asOperator.body).toMatchObject({ canManage: false });
    expect(asOperator.body.rows[0].baseUrl).toBeUndefined();
    expect(JSON.stringify(asOperator.body)).not.toContain(SECRET);

    const write = await json(
      await routes.save(
        jsonRequest('PUT', { expectedVersion: 1, enabled: false }, alice),
        target('tts', 'openai-tts'),
      ),
    );
    expect(write.status).toBe(403);
  });

  it('refuses a cross-site write', async () => {
    const { routes, root } = await arrange();
    const request = new Request(`${ORIGIN}/x`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: root, 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ expectedVersion: 0, secret: { apiKey: SECRET } }),
    });
    expect((await json(await routes.save(request, target('providers', 'openai')))).status).toBe(
      403,
    );
    expect((await db!.query('SELECT 1 FROM provider_credentials')).rows).toHaveLength(0);
  });

  it('refuses an oversize body and a version beyond the column', async () => {
    const { routes, root } = await arrange();
    const big = await json(
      await routes.save(
        jsonRequest('PUT', { expectedVersion: 0, models: ['x'.repeat(70_000)] }, root),
        target('providers', 'openai'),
      ),
    );
    expect([400, 413]).toContain(big.status);
    const huge = await json(
      await routes.save(
        jsonRequest('PUT', { expectedVersion: 2 ** 40 }, root),
        target('providers', 'openai'),
      ),
    );
    expect(huge.status).toBe(400);
    const deleteHuge = await routes.remove(
      new Request(`${ORIGIN}/x?version=${2 ** 40}`, {
        method: 'DELETE',
        headers: { cookie: root },
      }),
      target('providers', 'openai'),
    );
    expect(deleteHuge.status).toBe(400);
  });

  it('answers 409 SECRET_UNREADABLE for an edit that would drop a key it cannot read', async () => {
    const { routes, root } = await arrange();
    await routes.save(
      jsonRequest('PUT', { expectedVersion: 0, secret: { apiKey: SECRET } }, root),
      target('providers', 'openai'),
    );
    vi.stubEnv('PROVIDER_SECRET_KEY', randomBytes(32).toString('base64'));
    const response = await json(
      await routes.save(
        jsonRequest('PUT', { expectedVersion: 1, baseUrl: 'https://x.example' }, root),
        target('providers', 'openai'),
      ),
    );
    expect(response).toMatchObject({ status: 409, body: { errorCode: 'SECRET_UNREADABLE' } });
  });

  it('keeps what is known about a route when a card saves the same model, and drops it for another', async () => {
    const { routes, root } = await arrange();
    const known = {
      model: 'omniroute:auto/best-vision',
      vision: true,
      tools: true,
      contextWindow: 131072,
    };
    await routes.routePut(
      jsonRequest('PUT', { stage: 'scene-content', value: known, expectedVersion: 0 }, root),
    );
    expect(routes.currentSnapshot().routing.routes['scene-content']).toEqual(known);
    await routes.routePut(
      jsonRequest(
        'PUT',
        { stage: 'scene-content', value: 'omniroute:auto/best-vision', expectedVersion: 1 },
        root,
      ),
    );
    expect(routes.currentSnapshot().routing.routes['scene-content']).toEqual(known);
    await routes.routePut(
      jsonRequest(
        'PUT',
        { stage: 'scene-content', value: 'omniroute:auto/best-chat', expectedVersion: 2 },
        root,
      ),
    );
    expect(routes.currentSnapshot().routing.routes['scene-content']).toBe(
      'omniroute:auto/best-chat',
    );
  });

  it('refuses a stale route delete', async () => {
    const { routes, root } = await arrange();
    await routes.routePut(
      jsonRequest('PUT', { stage: 'pbl-chat', value: 'openai:gpt-4o', expectedVersion: 0 }, root),
    );
    await routes.routePut(
      jsonRequest('PUT', { stage: 'pbl-chat', value: 'openai:gpt-5', expectedVersion: 1 }, root),
    );
    const stale = await json(
      await routes.routeDelete(
        jsonRequest('DELETE', { stage: 'pbl-chat', expectedVersion: 1 }, root),
      ),
    );
    expect(stale.status).toBe(404);
    expect(routes.currentSnapshot().routing.routes['pbl-chat']).toBe('openai:gpt-5');
  });
});

describe('model routing routes', () => {
  it('sets the default model and stage routes, and rejects bad ones', async () => {
    const { routes, root, alice } = await arrange();
    expect(
      (
        await json(
          await routes.routePut(
            jsonRequest(
              'PUT',
              { stage: 'default', value: 'openai:gpt-4o', expectedVersion: 0 },
              alice,
            ),
          ),
        )
      ).status,
    ).toBe(403);
    const ok = await json(
      await routes.routePut(
        jsonRequest('PUT', { stage: 'default', value: 'openai:gpt-4o', expectedVersion: 0 }, root),
      ),
    );
    expect(ok.status).toBe(200);
    await routes.routePut(
      jsonRequest(
        'PUT',
        {
          stage: 'scene-content',
          value: { model: 'openai:gpt-5', thinking: { enabled: false } },
          expectedVersion: 0,
        },
        root,
      ),
    );
    const snap = routes.currentSnapshot();
    expect(snap.routing.defaultModel).toBe('openai:gpt-4o');
    expect(snap.routing.routes['scene-content']).toEqual({
      model: 'openai:gpt-5',
      thinking: { enabled: false },
    });

    for (const body of [
      { stage: 'default', value: 'gpt-4o', expectedVersion: 0 },
      { stage: 'default', value: 'nosuch:model', expectedVersion: 0 },
      { stage: 'not-a-stage', value: 'openai:gpt-4o', expectedVersion: 0 },
      { stage: 'pbl-chat', value: 42, expectedVersion: 0 },
    ]) {
      expect(
        (await json(await routes.routePut(jsonRequest('PUT', body, root)))).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    expect(
      (
        await json(
          await routes.routePut(
            jsonRequest(
              'PUT',
              { stage: 'default', value: 'openai:gpt-4o-mini', expectedVersion: 0 },
              root,
            ),
          ),
        )
      ).status,
    ).toBe(409);

    const removed = await json(
      await routes.routeDelete(jsonRequest('DELETE', { stage: 'scene-content' }, root)),
    );
    expect(removed.status).toBe(200);
    expect(routes.currentSnapshot().routing.routes['scene-content']).toBeUndefined();
  });
});
