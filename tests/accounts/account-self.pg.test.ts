import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutAll } from '@/app/api/auth/logout-all/route';
import { GET as meRoute, PATCH as updateMe } from '@/app/api/auth/me/route';
import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount } from '@/lib/accounts/service';
import { resetOwnerAuthenticationForTests } from '@/lib/server/identity/registry';

import {
  accountsTestUrl,
  makeRequest,
  openTestSchema,
  send,
  sessionCookieOf,
  setCookies,
  type TestSchema,
} from './_pg';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';

describe.skipIf(!accountsTestUrl)('the signed-in account, on its own routes', () => {
  let schema: TestSchema;
  let pool: Pool;

  beforeAll(async () => {
    schema = await openTestSchema('self');
    vi.stubEnv('DATABASE_URL', schema.url);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    pool = (await getServerPersistenceProvider(schema.url)).pool;
    await ensureAccountsSchema(pool);
    resetOwnerAuthenticationForTests();
    configureAccountsAuthentication();
  });

  afterAll(async () => {
    resetOwnerAuthenticationForTests();
    vi.unstubAllEnvs();
    await pool.end();
    await schema.close();
  });

  async function account(mustChangePassword = false): Promise<string> {
    const username = `me${randomUUID().slice(0, 8)}`;
    await createAccount(pool, {
      actorId: null,
      username,
      displayName: username,
      role: 'user',
      password: PASSWORD,
      mustChangePassword,
      now: Date.now(),
    });
    return username;
  }

  async function signIn(username: string): Promise<string> {
    const cookie = sessionCookieOf(
      await send(
        makeRequest('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } }),
        loginRoute,
      ),
    );
    if (cookie === undefined) throw new Error('sign-in did not set a session');
    return cookie;
  }

  it('changes its display name, trimmed, and refuses an empty or a non-text one', async () => {
    const cookie = await signIn(await account());
    const changed = await send(
      makeRequest('/api/auth/me', {
        method: 'PATCH',
        cookie,
        body: { displayName: '  Lan Anh  ' },
      }),
      updateMe,
    );
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ user: { displayName: 'Lan Anh' } });

    const empty = await send(
      makeRequest('/api/auth/me', { method: 'PATCH', cookie, body: { displayName: '   ' } }),
      updateMe,
    );
    expect(empty.status).toBe(400);
    expect((await empty.json()).errorCode).toBe('INVALID_DISPLAY_NAME');

    const notText = await send(
      makeRequest('/api/auth/me', { method: 'PATCH', cookie, body: { displayName: 3 } }),
      updateMe,
    );
    expect(notText.status).toBe(400);
    expect((await notText.json()).errorCode).toBe('INVALID_REQUEST');
  });

  it('refuses the name change without a session, and while the password must change', async () => {
    const without = await send(
      makeRequest('/api/auth/me', { method: 'PATCH', body: { displayName: 'Nobody' } }),
      updateMe,
    );
    expect(without.status).toBe(401);

    const cookie = await signIn(await account(true));
    const pending = await send(
      makeRequest('/api/auth/me', { method: 'PATCH', cookie, body: { displayName: 'Pending' } }),
      updateMe,
    );
    expect(pending.status).toBe(401);
    expect((await pending.json()).errorCode).toBe('PASSWORD_CHANGE_REQUIRED');
    const me = (await (await send(makeRequest('/api/auth/me', { cookie }), meRoute)).json()) as {
      user: { displayName: string };
    };
    expect(me.user.displayName).not.toBe('Pending');
  });

  it('signs out of every device at once, and clears the cookie of the device that asked', async () => {
    const username = await account();
    const one = await signIn(username);
    const two = await signIn(username);
    const three = await signIn(username);

    const out = await send(
      makeRequest('/api/auth/logout-all', { method: 'POST', cookie: one }),
      logoutAll,
    );
    expect(out.status).toBe(200);
    expect(
      setCookies(out).some(
        (value) => value.startsWith('openmaic_session=') && value.includes('Max-Age=0'),
      ),
    ).toBe(true);
    for (const cookie of [one, two, three]) {
      expect((await send(makeRequest('/api/auth/me', { cookie }), meRoute)).status).toBe(401);
    }
  });

  it('refuses sign-out-everywhere without a session', async () => {
    const response = await send(makeRequest('/api/auth/logout-all', { method: 'POST' }), logoutAll);
    expect(response.status).toBe(401);
  });
});
