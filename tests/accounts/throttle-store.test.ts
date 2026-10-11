import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { insertAttempt, recentFailures } from '@/lib/accounts/repository';
import { handleLogin } from '@/lib/accounts/routes';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount, login } from '@/lib/accounts/service';
import {
  PAIR_FAILURE_LIMIT,
  THROTTLE_WINDOW_MS,
  USERNAME_FAILURE_LIMIT,
} from '@/lib/accounts/throttle';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

// An in-memory PostgreSQL starts slowly under a loaded test run.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';
const WRONG = 'wrong password 1';
const GENERIC = 'Tên đăng nhập hoặc mật khẩu không đúng';

/** PGlite behind the `pg` Pool surface the accounts code uses. One connection, so a client is the database. */
class PGlitePool {
  constructor(readonly db: PGlite) {}

  query(text: string, params?: unknown[]) {
    return this.db.query(text, params);
  }

  async connect() {
    return {
      query: (text: string, params?: unknown[]) => this.db.query(text, params),
      release() {},
    };
  }

  async end() {
    await this.db.close();
  }
}

let db: PGlite;
let adapter: PGlitePool;
let pool: Pool;

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', `postgres://throttle-store-${randomUUID()}`);
  vi.stubEnv('ASSET_S3_BUCKET', '');
  vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
  vi.stubEnv('OWNER_SINGLE_USER', '');
  db = new PGlite();
  await db.waitReady;
  adapter = new PGlitePool(db);
  pool = adapter as unknown as Pool;
  // The routes reach the database through the persistence provider, so it is given this pool.
  await getServerPersistenceProvider(process.env.DATABASE_URL!, () => pool);
  await ensureAccountsSchema(pool);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await adapter.end();
});

async function account() {
  const username = `t${randomUUID().slice(0, 8)}`;
  const created = await createAccount(pool, {
    actorId: null,
    username,
    displayName: username,
    role: 'user',
    password: PASSWORD,
    mustChangePassword: false,
    now: Date.now(),
  });
  return created.user;
}

function attempt(username: string, password: string, address?: string) {
  return login(pool, {
    username,
    password,
    ...(address === undefined ? {} : { address }),
    now: Date.now(),
  });
}

function loginRequest(username: string, password: string, address: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
    body: JSON.stringify({ username, password }),
  });
}

describe('sign-in throttle: a name from one address', () => {
  it('locks one name from one address after five failures, and not from another address', async () => {
    const user = await account();
    for (let i = 0; i < PAIR_FAILURE_LIMIT; i += 1) {
      expect((await attempt(user.username, WRONG, '198.51.100.7')).outcome).toBe('invalid');
    }
    expect((await attempt(user.username, PASSWORD, '198.51.100.7')).outcome).toBe('locked');
    expect((await attempt(user.username, PASSWORD, '198.51.100.8')).outcome).toBe('ok');
  });

  it('answers a locked name, a wrong password and an unknown name with the same message', async () => {
    const user = await account();
    const address = '198.51.100.20';
    const wrong = await handleLogin(loginRequest(user.username, WRONG, address));
    for (let i = 1; i < PAIR_FAILURE_LIMIT; i += 1) {
      await handleLogin(loginRequest(user.username, WRONG, address));
    }
    const locked = await handleLogin(loginRequest(user.username, PASSWORD, address));
    const unknown = await handleLogin(loginRequest(`n${randomUUID().slice(0, 8)}`, WRONG, address));

    expect([wrong.status, locked.status, unknown.status]).toEqual([401, 429, 401]);
    for (const response of [wrong, locked, unknown]) {
      expect((await response.json()).error).toBe(GENERIC);
    }
  });
});

describe('sign-in throttle: a name from many addresses', () => {
  it('locks a name after twenty failures from twenty addresses, and not before', async () => {
    const user = await account();
    for (let i = 0; i < USERNAME_FAILURE_LIMIT; i += 1) {
      const result = await attempt(user.username, WRONG, `198.51.100.${100 + i}`);
      expect(result.outcome).toBe('invalid');
    }
    expect((await attempt(user.username, PASSWORD, '203.0.113.200')).outcome).toBe('locked');
  });

  it('does not lock a name that has nineteen failures from many addresses', async () => {
    const user = await account();
    for (let i = 0; i < USERNAME_FAILURE_LIMIT - 1; i += 1) {
      await attempt(user.username, WRONG, `198.51.101.${100 + i}`);
    }
    expect((await attempt(user.username, PASSWORD, '203.0.113.201')).outcome).toBe('ok');
  });
});

describe('the attempt table keeps only the throttle window', () => {
  it('drops the attempts that left the window when the next one is written', async () => {
    const now = Date.now();
    const scope = `probe:${randomUUID()}`;
    await insertAttempt(pool, scope, new Date(now - 2 * THROTTLE_WINDOW_MS), false);
    await insertAttempt(pool, scope, new Date(now - THROTTLE_WINDOW_MS / 2), false);

    const rows = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM accounts_login_attempts WHERE scope = $1',
      [scope],
    );
    expect(rows.rows[0]?.n).toBe('1');
    expect(await recentFailures(pool, scope, new Date(now - THROTTLE_WINDOW_MS), 5)).toEqual([
      now - THROTTLE_WINDOW_MS / 2,
    ]);
  });

  it('leaves no attempt older than the window once a sign-in has been written', async () => {
    const user = await account();
    await attempt(user.username, WRONG, '198.51.102.1');
    const old = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM accounts_login_attempts WHERE at <= $1',
      [new Date(Date.now() - THROTTLE_WINDOW_MS)],
    );
    expect(old.rows[0]?.n).toBe('0');
  });
});
