import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

const pool = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@/lib/accounts/db', () => ({
  accountsPool: async () => pool.current,
}));

import { accountsAuthMethod, accountOwnerId, accountUserIdOf } from '@/lib/accounts/owner';
import { OWNER_ROLES } from '@/lib/server/identity/types';

const TOKEN = 'a'.repeat(43);
const NOW = Date.now();

/** A fake pool that answers `findSession` with one row, or with none. */
function fakePool(row: Record<string, unknown> | undefined) {
  return {
    query: async () => ({ rows: row ? [row] : [] }),
  };
}

function sessionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'session-id',
    user_id: '6f1f2a4e-0000-4000-8000-000000000001',
    last_seen_at: new Date(NOW),
    expires_at: new Date(NOW + 24 * 3600 * 1000),
    revoked_at: null,
    username: 'alice',
    display_name: 'Alice',
    role: 'user',
    status: 'active',
    must_change_password: false,
    ...overrides,
  };
}

function headersWith(cookie: string | undefined): Headers {
  return new Headers(cookie === undefined ? {} : { cookie: `openmaic_session=${cookie}` });
}

afterEach(() => {
  pool.current = undefined;
  vi.unstubAllEnvs();
});

describe('the accounts owner method: its four outcomes', () => {
  it('is not applicable without a session cookie, and touches no database', async () => {
    pool.current = { query: () => Promise.reject(new Error('no query expected')) };
    expect(await accountsAuthMethod.authenticate({ headers: headersWith(undefined) })).toEqual({
      status: 'not-applicable',
    });
  });

  it('is invalid for a malformed cookie', async () => {
    pool.current = fakePool(undefined);
    expect(await accountsAuthMethod.authenticate({ headers: headersWith('short') })).toMatchObject({
      status: 'invalid',
    });
  });

  it('is invalid for an unknown, revoked or expired session', async () => {
    pool.current = fakePool(undefined);
    expect(await accountsAuthMethod.authenticate({ headers: headersWith(TOKEN) })).toMatchObject({
      status: 'invalid',
    });
    pool.current = fakePool(sessionRow({ revoked_at: new Date(NOW) }));
    expect(await accountsAuthMethod.authenticate({ headers: headersWith(TOKEN) })).toMatchObject({
      status: 'invalid',
    });
    pool.current = fakePool(sessionRow({ expires_at: new Date(NOW - 1000) }));
    expect(await accountsAuthMethod.authenticate({ headers: headersWith(TOKEN) })).toMatchObject({
      status: 'invalid',
    });
  });

  it('is invalid while the account must change its password', async () => {
    pool.current = fakePool(sessionRow({ must_change_password: true }));
    expect(await accountsAuthMethod.authenticate({ headers: headersWith(TOKEN) })).toMatchObject({
      status: 'invalid',
      reason: 'password change required',
    });
  });

  it('authenticates a live session as the account owner, with the publish role', async () => {
    const userId = '6f1f2a4e-0000-4000-8000-000000000001';
    pool.current = fakePool(sessionRow({ user_id: userId }));
    const result = await accountsAuthMethod.authenticate({ headers: headersWith(TOKEN) });
    expect(result.status).toBe('authenticated');
    if (result.status !== 'authenticated') return;
    expect(result.principal).toMatchObject({
      ownerId: `acct_${userId}`,
      kind: 'user',
      assurance: 'verified',
      channel: 'web',
    });
    expect(result.principal.roles.has(OWNER_ROLES.coursePublish)).toBe(true);
    expect(result.principal.roles.has(OWNER_ROLES.admin)).toBe(false);
  });

  it('gives an administrator the admin role as well', async () => {
    pool.current = fakePool(sessionRow({ role: 'admin' }));
    const result = await accountsAuthMethod.authenticate({ headers: headersWith(TOKEN) });
    expect(result.status === 'authenticated' && result.principal.roles.has(OWNER_ROLES.admin)).toBe(
      true,
    );
  });

  it('throws on a database error, so the request is never answered as anonymous', async () => {
    pool.current = { query: () => Promise.reject(new Error('connection refused')) };
    await expect(accountsAuthMethod.authenticate({ headers: headersWith(TOKEN) })).rejects.toThrow(
      'connection refused',
    );
  });
});

describe('stored owner ids of accounts', () => {
  it('builds acct_<uuid> and recognizes only that shape', () => {
    const id = randomUUID();
    expect(accountOwnerId(id)).toBe(`acct_${id}`);
    expect(accountUserIdOf(`acct_${id}`)).toBe(id);
    expect(accountUserIdOf('anon:' + id)).toBeUndefined();
    expect(accountUserIdOf('acct_not-a-uuid')).toBeUndefined();
    expect(accountUserIdOf('local')).toBeUndefined();
  });

  it('describes an account owner as a user with the publish role, and others as unknown', () => {
    const id = randomUUID();
    expect(accountsAuthMethod.describeStoredOwner?.(`acct_${id}`)).toEqual({
      kind: 'user',
      roles: new Set([OWNER_ROLES.coursePublish]),
    });
    expect(accountsAuthMethod.describeStoredOwner?.('local')).toBeUndefined();
  });
});
