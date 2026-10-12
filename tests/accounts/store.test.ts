import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteExpiredSessions,
  ensureAccountSchema,
  findAccountByUsername,
  findSessionAccount,
  insertAccount,
  insertSession,
  revokeSession,
  type AccountQueryable,
} from '@/lib/server/accounts/store';

const NOW = new Date('2026-10-11T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

let db: PGlite;
let queryable: AccountQueryable;

beforeEach(async () => {
  db = new PGlite();
  await db.waitReady;
  queryable = { query: (text, params) => db.query(text, params) };
  await ensureAccountSchema(queryable);
}, 30_000);

afterEach(async () => {
  await db.close();
});

async function createAccount(username: string): Promise<string> {
  const id = `acct-${username}`;
  const inserted = await insertAccount(queryable, {
    id,
    username,
    passwordHash: 'stored-hash-placeholder',
    createdAt: NOW,
  });
  expect(inserted).toBe(true);
  return id;
}

async function createSession(accountId: string, tokenHash: string, expiresAt: Date) {
  await insertSession(queryable, { tokenHash, accountId, createdAt: NOW, expiresAt });
}

async function setDisabled(accountId: string, disabledAt: Date | null) {
  await db.query(`UPDATE accounts SET disabled_at = $2::timestamptz WHERE id = $1`, [
    accountId,
    disabledAt?.toISOString() ?? null,
  ]);
}

describe('ensureAccountSchema', () => {
  it('can run again without error and leaves existing rows in place', async () => {
    await createAccount('alice');
    await expect(ensureAccountSchema(queryable)).resolves.toBeUndefined();
    await expect(findAccountByUsername(queryable, 'alice')).resolves.toMatchObject({
      username: 'alice',
    });
  });
});

describe('accounts', () => {
  it('reports a duplicate username as false instead of throwing', async () => {
    await expect(
      insertAccount(queryable, { id: 'a1', username: 'alice', passwordHash: 'h1', createdAt: NOW }),
    ).resolves.toBe(true);
    await expect(
      insertAccount(queryable, { id: 'a2', username: 'alice', passwordHash: 'h2', createdAt: NOW }),
    ).resolves.toBe(false);
    const count = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM accounts`);
    expect(count.rows[0]?.n).toBe(1);
    await expect(findAccountByUsername(queryable, 'alice')).resolves.toMatchObject({
      id: 'a1',
      passwordHash: 'h1',
    });
  });

  it('returns undefined for an unknown username and reports a new account as enabled', async () => {
    await expect(findAccountByUsername(queryable, 'nobody')).resolves.toBeUndefined();
    await createAccount('alice');
    await expect(findAccountByUsername(queryable, 'alice')).resolves.toEqual({
      id: 'acct-alice',
      username: 'alice',
      passwordHash: 'stored-hash-placeholder',
      disabled: false,
    });
  });

  it('reports a disabled account as disabled', async () => {
    const accountId = await createAccount('alice');
    await setDisabled(accountId, NOW);
    await expect(findAccountByUsername(queryable, 'alice')).resolves.toMatchObject({
      disabled: true,
    });
  });
});

describe('sessions', () => {
  it('returns the account behind a live session and nothing for an unknown token', async () => {
    const accountId = await createAccount('alice');
    await createSession(accountId, 'hash-live', new Date(NOW.getTime() + HOUR_MS));
    await expect(findSessionAccount(queryable, 'hash-live', NOW)).resolves.toEqual({
      accountId,
      username: 'alice',
      role: 'learner',
    });
    await expect(findSessionAccount(queryable, 'hash-unknown', NOW)).resolves.toBeUndefined();
  });

  it('treats a session as expired once expires_at is not after now', async () => {
    const accountId = await createAccount('alice');
    await createSession(accountId, 'hash-past', new Date(NOW.getTime() - 1));
    await createSession(accountId, 'hash-boundary', new Date(NOW.getTime()));
    await expect(findSessionAccount(queryable, 'hash-past', NOW)).resolves.toBeUndefined();
    await expect(findSessionAccount(queryable, 'hash-boundary', NOW)).resolves.toBeUndefined();
  });

  it('refuses a revoked session', async () => {
    const accountId = await createAccount('alice');
    await createSession(accountId, 'hash-revoked', new Date(NOW.getTime() + HOUR_MS));
    await revokeSession(queryable, 'hash-revoked', NOW);
    await expect(findSessionAccount(queryable, 'hash-revoked', NOW)).resolves.toBeUndefined();
  });

  it('refuses sessions of a disabled account, and accepts them again once re-enabled', async () => {
    const accountId = await createAccount('alice');
    await createSession(accountId, 'hash-live', new Date(NOW.getTime() + HOUR_MS));
    await setDisabled(accountId, NOW);
    await expect(findSessionAccount(queryable, 'hash-live', NOW)).resolves.toBeUndefined();
    await setDisabled(accountId, null);
    await expect(findSessionAccount(queryable, 'hash-live', NOW)).resolves.toEqual({
      accountId,
      username: 'alice',
      role: 'learner',
    });
  });

  it('revokeSession is idempotent and keeps the first revocation time', async () => {
    const accountId = await createAccount('alice');
    await createSession(accountId, 'hash-x', new Date(NOW.getTime() + HOUR_MS));
    const first = new Date(NOW.getTime() + 1_000);
    const second = new Date(NOW.getTime() + 2_000);
    await revokeSession(queryable, 'hash-x', first);
    await expect(revokeSession(queryable, 'hash-x', second)).resolves.toBeUndefined();
    const row = await db.query<{ revoked_at: string | Date }>(
      `SELECT revoked_at FROM account_sessions WHERE token_hash = $1`,
      ['hash-x'],
    );
    expect(new Date(row.rows[0]!.revoked_at).getTime()).toBe(first.getTime());
  });

  it('deleteExpiredSessions removes only sessions that have expired', async () => {
    const accountId = await createAccount('alice');
    await createSession(accountId, 'hash-expired', new Date(NOW.getTime() - HOUR_MS));
    await createSession(accountId, 'hash-live', new Date(NOW.getTime() + HOUR_MS));
    await createSession(accountId, 'hash-revoked-live', new Date(NOW.getTime() + HOUR_MS));
    await revokeSession(queryable, 'hash-revoked-live', NOW);
    await deleteExpiredSessions(queryable, NOW);
    const remaining = await db.query<{ token_hash: string }>(
      `SELECT token_hash FROM account_sessions ORDER BY token_hash`,
    );
    expect(remaining.rows.map((row) => row.token_hash)).toEqual(['hash-live', 'hash-revoked-live']);
  });
});
