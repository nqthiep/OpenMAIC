import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PATCH as updateUser } from '@/app/api/admin/users/[id]/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount, updateAccount } from '@/lib/accounts/service';
import { resetOwnerAuthenticationForTests } from '@/lib/server/identity/registry';

import {
  accountsTestUrl,
  makeRequest,
  openTestSchema,
  send,
  sessionCookieOf,
  type TestSchema,
} from './_pg';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * The tests share one schema and run in order: each step starts from the state
 * the step before left behind, so the counts are exact.
 */
describe.skipIf(!accountsTestUrl)('the last active administrator', () => {
  let schema: TestSchema;
  let pool: Pool;

  beforeAll(async () => {
    schema = await openTestSchema('lastadmin');
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

  async function admin(): Promise<{ id: string; cookie: string }> {
    const username = `adm${randomUUID().slice(0, 8)}`;
    const created = await createAccount(pool, {
      actorId: null,
      username,
      displayName: username,
      role: 'admin',
      password: PASSWORD,
      mustChangePassword: false,
      now: Date.now(),
    });
    const cookie = sessionCookieOf(
      await send(
        makeRequest('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } }),
        loginRoute,
      ),
    );
    if (cookie === undefined) throw new Error('sign-in did not set a session');
    return { id: created.user.id, cookie };
  }

  function patch(id: string, body: unknown, cookie: string) {
    return send(makeRequest(`/api/admin/users/${id}`, { method: 'PATCH', body, cookie }), (req) =>
      updateUser(req, params(id)),
    );
  }

  async function activeAdmins(): Promise<number> {
    const result = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM accounts_users WHERE role = 'admin' AND status = 'active'`,
    );
    return result.rows[0]?.n ?? 0;
  }

  let onlyId: string;
  let onlyCookie: string;
  let secondId: string;
  let secondCookie: string;

  it('refuses to demote, deactivate or delete the only active administrator, even on self', async () => {
    const only = await admin();
    onlyId = only.id;
    onlyCookie = only.cookie;
    expect(await activeAdmins()).toBe(1);

    for (const change of [{ role: 'user' }, { status: 'disabled' }, { status: 'deleted' }]) {
      const response = await patch(onlyId, change, onlyCookie);
      expect(response.status, JSON.stringify(change)).toBe(409);
      expect((await response.json()).errorCode).toBe('LAST_ADMIN');
    }
    expect(await activeAdmins()).toBe(1);

    const renamed = await patch(onlyId, { displayName: 'Quản trị chính' }, onlyCookie);
    expect(renamed.status).toBe(200);
    expect(await activeAdmins()).toBe(1);
  });

  it('lets an administrator step down while another active administrator remains, then refuses the last step', async () => {
    const second = await admin();
    secondId = second.id;
    secondCookie = second.cookie;
    expect(await activeAdmins()).toBe(2);

    const stepDown = await patch(onlyId, { role: 'user' }, onlyCookie);
    expect(stepDown.status).toBe(200);
    expect(await activeAdmins()).toBe(1);

    const lastStep = await patch(secondId, { role: 'user' }, secondCookie);
    expect(lastStep.status).toBe(409);
    expect((await lastStep.json()).errorCode).toBe('LAST_ADMIN');
    expect(await activeAdmins()).toBe(1);

    const disabling = await patch(secondId, { status: 'disabled' }, secondCookie);
    expect(disabling.status).toBe(409);
    expect(await activeAdmins()).toBe(1);
  });

  it('lets exactly one of two simultaneous demotions through, so an active administrator always remains', async () => {
    const third = await admin();
    expect(await activeAdmins()).toBe(2);

    for (let round = 0; round < 6; round += 1) {
      for (const id of [secondId, third.id]) {
        await updateAccount(pool, { actorId: null, targetId: id, role: 'admin', now: Date.now() });
      }
      expect(await activeAdmins()).toBe(2);

      const [first, other] = await Promise.all([
        patch(secondId, { role: 'user' }, third.cookie),
        patch(third.id, { role: 'user' }, secondCookie),
      ]);
      const statuses = [first.status, other.status];
      expect(
        statuses.filter((status) => status === 200),
        `round ${round}`,
      ).toHaveLength(1);
      const refused = statuses.find((status) => status !== 200);
      expect([403, 409], `round ${round}`).toContain(refused);
      expect(await activeAdmins(), `round ${round}`).toBe(1);
    }
  });
});
