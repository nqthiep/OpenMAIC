import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sessionCookieName } from '@/lib/accounts/gate';
import { handlePassword } from '@/lib/accounts/routes';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount, login } from '@/lib/accounts/service';
import { createSession, resolveSession } from '@/lib/accounts/session';
import { USERNAME_FAILURE_LIMIT } from '@/lib/accounts/throttle';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

// An in-memory PostgreSQL starts slowly under a loaded test run.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new password';
const REFUSED = {
  success: false,
  errorCode: 'INVALID_CREDENTIALS',
  error: 'the current password is incorrect, or the new one matches it',
};

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
  vi.stubEnv('DATABASE_URL', `postgres://password-change-${randomUUID()}`);
  vi.stubEnv('ASSET_S3_BUCKET', '');
  vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
  vi.stubEnv('OWNER_SINGLE_USER', '');
  db = new PGlite();
  await db.waitReady;
  adapter = new PGlitePool(db);
  pool = adapter as unknown as Pool;
  await getServerPersistenceProvider(process.env.DATABASE_URL!, () => pool);
  await ensureAccountsSchema(pool);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await adapter.end();
});

/** A new account with a signed-in session, as a browser holds after sign-in. */
async function signedIn() {
  const username = `c${randomUUID().slice(0, 8)}`;
  const created = await createAccount(pool, {
    actorId: null,
    username,
    displayName: username,
    role: 'user',
    password: PASSWORD,
    mustChangePassword: false,
    now: Date.now(),
  });
  const { token } = await createSession(pool, { userId: created.user.id, now: Date.now() });
  return { ...created.user, token };
}

/** The route's answer: status and JSON body, so two answers can be compared whole. */
async function changePassword(
  user: { token: string },
  body: { currentPassword: string; newPassword: string },
) {
  const response = await handlePassword(
    new NextRequest('http://localhost/api/auth/password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${sessionCookieName()}=${user.token}`,
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('changing the password answers a guess the same way', () => {
  it('answers a wrong current password once, whatever the new password is', async () => {
    const user = await signedIn();
    const guess = 'wrong guess here';
    const answers = [];
    for (const newPassword of [NEW_PASSWORD, 'short', guess]) {
      answers.push(await changePassword(user, { currentPassword: guess, newPassword }));
    }
    expect(answers[0]).toEqual({ status: 403, body: REFUSED });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it('answers a new password equal to the current one as it answers a wrong current one', async () => {
    const user = await signedIn();
    const wrong = await changePassword(user, {
      currentPassword: 'wrong guess here',
      newPassword: NEW_PASSWORD,
    });
    const same = await changePassword(user, { currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same).toEqual(wrong);
  });

  it('gives the policy reason only to someone who knows the current password', async () => {
    const user = await signedIn();
    const weak = await changePassword(user, { currentPassword: PASSWORD, newPassword: 'short' });
    expect(weak).toEqual({
      status: 400,
      body: {
        success: false,
        errorCode: 'INVALID_REQUEST',
        error: 'the new password does not meet the policy',
        reason: 'length',
      },
    });
    const guessedWeak = await changePassword(user, {
      currentPassword: 'wrong guess here',
      newPassword: 'short',
    });
    expect(guessedWeak).toEqual({ status: 403, body: REFUSED });
  });

  it('counts every wrong current password toward the lock on the name', async () => {
    const user = await signedIn();
    for (let i = 0; i < USERNAME_FAILURE_LIMIT; i += 1) {
      const answer = await changePassword(user, {
        currentPassword: `wrong guess ${i}`,
        newPassword: NEW_PASSWORD,
      });
      expect(answer.status).toBe(403);
    }
    const locked = await changePassword(user, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(locked.status).toBe(429);
  });

  it('changes the password once the current one is right, and ends the other sessions', async () => {
    const user = await signedIn();
    const other = await createSession(pool, { userId: user.id, now: Date.now() });
    const changed = await changePassword(user, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(changed).toEqual({ status: 200, body: { success: true } });

    expect((await resolveSession(pool, other.token, Date.now())).state).not.toBe('valid');
    const signIn = await login(pool, {
      username: user.username,
      password: NEW_PASSWORD,
      now: Date.now(),
    });
    expect(signIn.outcome).toBe('ok');
  });
});
