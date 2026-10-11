import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as adminUsage } from '@/app/api/admin/usage/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { GET as usageRoute } from '@/app/api/usage/route';
import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import { accountOwnerId } from '@/lib/accounts/owner';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount } from '@/lib/accounts/service';
import { handleAdminUsage } from '@/lib/accounts/usage';
import { resetOwnerAuthenticationForTests } from '@/lib/server/identity/registry';
import { readUsageRecords, type UsageRecord } from '@/lib/server/usage-storage';

import {
  accountsTestUrl,
  makeRequest,
  openTestSchema,
  send,
  sessionCookieOf,
  type TestSchema,
} from './_pg';

vi.mock('@/lib/server/usage-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/usage-storage')>();
  return { ...actual, readUsageRecords: vi.fn(async () => []) };
});

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';
const uniq = () => randomUUID().slice(0, 8);
const OCTOBER = Date.UTC(2026, 9, 10, 12);

function record(overrides: Partial<UsageRecord>): UsageRecord {
  return {
    id: randomUUID(),
    createdAt: OCTOBER,
    kind: 'llm',
    source: 'chat',
    providerId: 'openai',
    modelId: 'gpt-x',
    modelString: 'openai:gpt-x',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    ...overrides,
  };
}

describe.skipIf(!accountsTestUrl)('usage routes with accounts on', () => {
  let schema: TestSchema;
  let pool: Pool;
  let admin: { id: string; username: string; displayName: string };
  let user: { id: string; username: string; displayName: string };
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    schema = await openTestSchema('usage');
    vi.stubEnv('DATABASE_URL', schema.url);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    pool = (await getServerPersistenceProvider(schema.url)).pool;
    await ensureAccountsSchema(pool);
    resetOwnerAuthenticationForTests();
    configureAccountsAuthentication();

    admin = await account('admin');
    user = await account('user');
    adminCookie = await signIn(admin.username);
    userCookie = await signIn(user.username);
  });

  afterAll(async () => {
    resetOwnerAuthenticationForTests();
    vi.unstubAllEnvs();
    await pool.end();
    await schema.close();
  });

  beforeEach(() => {
    vi.mocked(readUsageRecords).mockReset();
    vi.mocked(readUsageRecords).mockResolvedValue(rows());
  });

  async function account(role: 'user' | 'admin') {
    const username = `us${uniq()}`;
    const displayName = `Tên ${username}`;
    const created = await createAccount(pool, {
      actorId: null,
      username,
      displayName,
      role,
      password: PASSWORD,
      mustChangePassword: false,
      now: Date.now(),
    });
    return { id: created.user.id, username, displayName };
  }

  async function signIn(username: string): Promise<string> {
    const response = await send(
      makeRequest('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } }),
      loginRoute,
    );
    const cookie = sessionCookieOf(response);
    if (cookie === undefined) throw new Error('sign-in did not set a session');
    return cookie;
  }

  /** The log as the mocked reader returns it: two accounts, and rows that no account owns. */
  function rows(): UsageRecord[] {
    return [
      record({ id: 'a1', ownerId: accountOwnerId(user.id), inputTokens: 100, outputTokens: 20 }),
      record({
        id: 'a2',
        ownerId: accountOwnerId(user.id),
        kind: 'image',
        unit: 'image',
        quantity: 1,
      }),
      record({ id: 'b1', ownerId: accountOwnerId(admin.id), inputTokens: 30, outputTokens: 5 }),
      record({ id: 'u1', inputTokens: 7, outputTokens: 3 }),
      record({ id: 'u2', ownerId: 'anon-7f3c', inputTokens: 1, outputTokens: 1 }),
    ];
  }

  describe('GET /api/usage, the deployment-wide total', () => {
    it('answers no one without a session', async () => {
      const response = await send(makeRequest('/api/usage'), usageRoute);
      expect(response.status).toBe(401);
    });

    it('refuses an ordinary account with 403', async () => {
      const response = await send(makeRequest('/api/usage', { cookie: userCookie }), usageRoute);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.errorCode).toBe('FORBIDDEN');
      expect(body).not.toHaveProperty('totals');
    });

    it('answers an administrator', async () => {
      const response = await send(makeRequest('/api/usage', { cookie: adminCookie }), usageRoute);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.totals).toEqual({ requests: 5, llmTokens: 167 });
    });
  });

  describe('GET /api/admin/usage', () => {
    it('answers no one without a session, at the proxy and in the handler', async () => {
      const viaProxy = await send(makeRequest('/api/admin/usage'), adminUsage);
      expect(viaProxy.status).toBe(401);
      const direct = await handleAdminUsage(makeRequest('/api/admin/usage'));
      expect(direct.status).toBe(401);
      expect((await direct.json()).errorCode).toBe('UNAUTHENTICATED');
    });

    it('refuses an ordinary account with 403', async () => {
      const response = await send(
        makeRequest('/api/admin/usage', { cookie: userCookie }),
        adminUsage,
      );
      expect(response.status).toBe(403);
      expect((await response.json()).errorCode).toBe('FORBIDDEN');
    });

    it('groups usage by account, and keeps the rows no account owns apart', async () => {
      const response = await send(
        makeRequest('/api/admin/usage', { cookie: adminCookie }),
        adminUsage,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.accounts.map((row: { username: string }) => row.username)).toEqual([
        user.username,
        admin.username,
      ]);
      expect(body.accounts[0]).toMatchObject({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        status: 'active',
        requests: 2,
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        byKind: { llm: 1, image: 1 },
      });
      expect(body.accounts[1]).toMatchObject({ requests: 1, inputTokens: 30, outputTokens: 5 });
      expect(body.unattributed).toMatchObject({
        requests: 2,
        inputTokens: 8,
        outputTokens: 4,
        totalTokens: 12,
      });
      expect(body.totals).toMatchObject({
        requests: 5,
        inputTokens: 138,
        outputTokens: 29,
        totalTokens: 167,
      });
    });

    it('reads only the asked-for days and months', async () => {
      vi.mocked(readUsageRecords).mockResolvedValueOnce([
        ...rows(),
        record({
          id: 'old',
          ownerId: accountOwnerId(user.id),
          createdAt: Date.UTC(2026, 8, 30, 12),
          inputTokens: 1000,
        }),
      ]);
      const response = await send(
        makeRequest('/api/admin/usage?from=2026-10-01&to=2026-10-31', { cookie: adminCookie }),
        adminUsage,
      );
      expect(readUsageRecords).toHaveBeenCalledWith({ months: ['2026-10'] });
      const body = await response.json();
      expect(body).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
      expect(body.totals).toMatchObject({ requests: 5, inputTokens: 138 });
    });

    it('refuses a range that is not days, or that runs backwards', async () => {
      for (const path of [
        '/api/admin/usage?from=2026-13-01',
        '/api/admin/usage?from=2026-10-10&to=2026-10-01',
      ]) {
        const response = await send(makeRequest(path, { cookie: adminCookie }), adminUsage);
        expect(response.status).toBe(400);
        expect((await response.json()).errorCode).toBe('INVALID_REQUEST');
      }
    });

    it('answers an empty report when nothing was logged', async () => {
      vi.mocked(readUsageRecords).mockResolvedValueOnce([]);
      const response = await send(
        makeRequest('/api/admin/usage', { cookie: adminCookie }),
        adminUsage,
      );
      const body = await response.json();
      expect(body.accounts).toEqual([]);
      expect(body.totals).toMatchObject({ requests: 0, totalTokens: 0 });
    });
  });
});
