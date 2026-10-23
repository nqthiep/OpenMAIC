/**
 * Checks the client against a REAL OmniRoute, not the stand-in. Skipped unless both variables are
 * set, so it never runs in the normal suite:
 *
 *   docker run -d --rm --name omni-live -p 127.0.0.1:20150:20128 -v /app/data \
 *     -e DATA_DIR=/app/data -e DASHBOARD_PORT=20128 -e API_PORT=20129 -e API_HOST=0.0.0.0 \
 *     -e AUTH_COOKIE_SECURE=false -e REQUIRE_API_KEY=true \
 *     -e INITIAL_PASSWORD=... -e JWT_SECRET=... -e API_KEY_SECRET=... diegosouzapw/omniroute:3.8.52
 *   OMNIROUTE_LIVE_URL=http://127.0.0.1:20150 OMNIROUTE_LIVE_PASSWORD=... \
 *     pnpm vitest run tests/omniroute/live.test.ts
 *
 * Run it only against a throwaway container: it deletes the API key named OpenMAIC if there is one.
 * It needs no upstream provider: it adds a connection with a made-up key (OmniRoute marks it
 * inactive), which is enough to give a key something to be limited to.
 */
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';

import {
  createKey,
  deleteKey,
  findKey,
  isReachable,
  listConnections,
  listModels,
  listNodePrefixes,
  openSession,
  OmniRouteError,
  readHealth,
  regenerateKey,
  updateKey,
  KEY_NAME,
} from '@/lib/server/omniroute/client';
import type { OmniRouteConfig } from '@/lib/server/omniroute/config';
import { buildItems, buildPresets } from '@/lib/server/omniroute/models';
import { buildOverview } from '@/lib/server/omniroute/overview';
import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const URL_ = process.env.OMNIROUTE_LIVE_URL;
const PASSWORD = process.env.OMNIROUTE_LIVE_PASSWORD;

const config: OmniRouteConfig = {
  publicUrl: 'https://omniroute.example.test',
  gateSecret: 'g'.repeat(48),
  adminPassword: PASSWORD ?? '',
  internalUrl: URL_ ?? '',
  apiUrl: URL_ ?? '',
};

describe.skipIf(!URL_ || !PASSWORD)('the client against a real OmniRoute', () => {
  it('signs in, reads health and connections, and refuses a wrong password', async () => {
    expect(await isReachable(config)).toBe(true);
    const session = await openSession(config);
    const health = await readHealth(session);
    expect(health.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(health.configured).toBeGreaterThanOrEqual(0);
    await expect(
      openSession({ ...config, adminPassword: 'not the password' }),
    ).rejects.toMatchObject({
      failure: 'login-failed',
    });
    await expect(isReachable({ ...config, internalUrl: 'http://127.0.0.1:9' })).resolves.toBe(
      false,
    );
    expect(await listConnections(session)).toBeInstanceOf(Array);
    expect(await listNodePrefixes(session)).toBeInstanceOf(Map);
  });

  it('creates, limits, regenerates, lists models with and deletes the key', async () => {
    const session = await openSession(config);
    // A connection to be limited to; OmniRoute leaves it inactive because the key is made up.
    const added = await fetch(`${URL_}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session.cookie },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-made-up-for-the-test',
        name: 'live-test',
      }),
    });
    expect(added.status).toBe(201);
    const connection = (await listConnections(session)).find((c) => c.name === 'live-test');
    expect(connection).toMatchObject({
      provider: 'openai',
      authType: 'apikey',
      subscription: false,
    });

    const leftover = await findKey(session);
    if (leftover) await deleteKey(session, leftover.id);

    const created = await createKey(session, {
      connectionIds: [connection!.id],
      noLog: true,
      dailyLimitUsd: 3,
    });
    expect(created.secret).toMatch(/^sk-/);
    expect(created.record.name).toBe(KEY_NAME);

    const found = await findKey(session);
    expect(found).toMatchObject({
      name: KEY_NAME,
      noLog: true,
      dailyLimitUsd: 3,
      connectionIds: [connection!.id],
    });
    expect(found?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    await updateKey(session, found!.id, {
      connectionIds: [connection!.id],
      noLog: false,
      dailyLimitUsd: null,
    });
    expect(await findKey(session)).toMatchObject({ noLog: false, dailyLimitUsd: null });

    const raw = await listModels(config, created.secret);
    expect(raw.length).toBeGreaterThan(0);
    const items = buildItems(raw, new Set(['openai']));
    expect(items.some((item) => item.group === 'auto')).toBe(true);
    expect(items.every((item) => item.group !== 'model' || item.owner === 'openai')).toBe(true);
    expect(Object.keys(buildPresets(items)).length).toBeGreaterThan(0);

    const fresh = await regenerateKey(session, found!.id);
    expect(fresh).not.toBe(created.secret);
    await expect(listModels(config, created.secret)).rejects.toBeInstanceOf(OmniRouteError);
    expect((await listModels(config, fresh)).length).toBeGreaterThan(0);

    await deleteKey(session, found!.id);
    expect(await findKey(session)).toBeUndefined();
  });

  it('reads the overview: reachable, signed in, and not yet connected by OpenMAIC', async () => {
    const pglite = new PGlite();
    await pglite.waitReady;
    const pool = { query: (text: string, params?: unknown[]) => pglite.query(text, params) };
    await ensureAccountSchema(pool);
    await ensureLearningSchema(pool);
    vi.stubEnv('OMNIROUTE_PUBLIC_URL', config.publicUrl);
    vi.stubEnv('OMNIROUTE_GATE_SECRET', config.gateSecret);
    vi.stubEnv('OMNIROUTE_ADMIN_PASSWORD', config.adminPassword);
    vi.stubEnv('OMNIROUTE_INTERNAL_URL', config.internalUrl);
    vi.stubEnv('OMNIROUTE_API_URL', config.apiUrl);
    try {
      const overview = await buildOverview(pool);
      expect(['no-providers', 'no-key']).toContain(overview.state);
      expect(overview.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(overview.key).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      await pglite.close();
    }
  });
});
