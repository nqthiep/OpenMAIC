import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_LOGIN_THROTTLE, LoginThrottle } from '@/lib/server/accounts/login-throttle';
import {
  AccountError,
  accountOwnerId,
  loginAccount,
  logoutAccount,
  pruneExpiredSessions,
  registerAccount,
  resolveAccountSession,
  type AccountServiceDeps,
} from '@/lib/server/accounts/service';
import { ensureAccountSchema, type AccountQueryable } from '@/lib/server/accounts/store';

const PASSWORD = 'Tangerine-Waffle-2026';
const WRONG_PASSWORD = 'Tangerine-Waffle-2027';
const START = Date.parse('2026-10-11T12:00:00.000Z');
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** Each scrypt computation at the production cost takes roughly 50-150 ms. */
const SCRYPT_TIMEOUT_MS = 30_000;

let db: PGlite;
let queryable: AccountQueryable;
let nowMs: number;
let deps: AccountServiceDeps;

/** Service dependencies over PGlite, with a clock that only moves when a test moves it. */
function depsWith(overrides: Partial<AccountServiceDeps> = {}): AccountServiceDeps {
  return {
    db: queryable,
    throttle: new LoginThrottle({ ...DEFAULT_LOGIN_THROTTLE, now: () => nowMs }),
    registrationOpen: true,
    now: () => new Date(nowMs),
    ...overrides,
  };
}

beforeEach(async () => {
  db = new PGlite();
  await db.waitReady;
  queryable = { query: (text, params) => db.query(text, params) };
  await ensureAccountSchema(queryable);
  nowMs = START;
  deps = depsWith();
}, SCRYPT_TIMEOUT_MS);

afterEach(async () => {
  await db.close();
});

function credentials(username: string, password: string) {
  return { username, password };
}

async function captureError(promise: Promise<unknown>): Promise<AccountError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AccountError) return error;
    throw error;
  }
  throw new Error('expected the operation to fail with an AccountError');
}

/** The error code, or "OK" when the operation succeeded. */
async function outcomeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof AccountError) return error.code;
    throw error;
  }
}

async function countRows(table: 'accounts' | 'account_sessions'): Promise<number> {
  const result = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return result.rows[0]!.n;
}

async function storedHashFor(username: string): Promise<string> {
  const result = await db.query<{ password_hash: string }>(
    `SELECT password_hash FROM accounts WHERE username = $1`,
    [username],
  );
  return result.rows[0]!.password_hash;
}

/** Every 12-character window of a value, so a leaked hash fragment of that length is caught. */
function windowsOf(value: string, size = 12): string[] {
  const windows: string[] = [];
  for (let index = 0; index + size <= value.length; index += 1) {
    windows.push(value.slice(index, index + size));
  }
  return windows;
}

describe('registerAccount', () => {
  it(
    'normalizes the username and returns a session that resolves back to the account',
    async () => {
      const session = await registerAccount(deps, credentials('  Alice  ', PASSWORD));
      expect(session.username).toBe('alice');
      expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(session.expiresAt.getTime() - START).toBe(THIRTY_DAYS_MS);
      await expect(resolveAccountSession(deps, session.token)).resolves.toEqual({
        accountId: session.accountId,
        username: 'alice',
      });
      expect(accountOwnerId(session.accountId)).toBe(`acct:${session.accountId}`);
      await expect(resolveAccountSession(deps, undefined)).resolves.toBeUndefined();
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'refuses a duplicate username, compared after normalization',
    async () => {
      await registerAccount(deps, credentials('alice', PASSWORD));
      const error = await captureError(registerAccount(deps, credentials('ALICE ', PASSWORD)));
      expect(error.code).toBe('USERNAME_TAKEN');
      await expect(countRows('accounts')).resolves.toBe(1);
    },
    SCRYPT_TIMEOUT_MS,
  );

  it('refuses registration when it is closed, and creates no account', async () => {
    const closed = depsWith({ registrationOpen: false });
    const error = await captureError(registerAccount(closed, credentials('alice', PASSWORD)));
    expect(error.code).toBe('REGISTRATION_DISABLED');
    await expect(countRows('accounts')).resolves.toBe(0);
  });

  it('rejects invalid usernames and passwords with their own codes, creating no account', async () => {
    const outcomes = [
      await outcomeOf(registerAccount(deps, credentials('ab', PASSWORD))),
      await outcomeOf(registerAccount(deps, credentials('al ice', PASSWORD))),
      await outcomeOf(registerAccount(deps, credentials('alice', 'abcdefg'))),
      await outcomeOf(registerAccount(deps, credentials('alice', 'a'.repeat(257)))),
    ];
    expect(outcomes).toEqual([
      'USERNAME_INVALID',
      'USERNAME_INVALID',
      'PASSWORD_INVALID',
      'PASSWORD_INVALID',
    ]);
    await expect(countRows('accounts')).resolves.toBe(0);
  });
});

describe('loginAccount', () => {
  it(
    'issues a new token on every sign-in and never reuses an earlier token',
    async () => {
      const registered = await registerAccount(deps, credentials('alice', PASSWORD));
      const first = await loginAccount(deps, credentials('Alice', PASSWORD));
      const second = await loginAccount(deps, credentials('alice', PASSWORD));
      expect(first.username).toBe('alice');
      expect(new Set([registered.token, first.token, second.token]).size).toBe(3);
      await expect(resolveAccountSession(deps, first.token)).resolves.toMatchObject({
        username: 'alice',
      });
      await expect(resolveAccountSession(deps, second.token)).resolves.toMatchObject({
        username: 'alice',
      });
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'gives the same error for a wrong password and for an unknown username',
    async () => {
      await registerAccount(deps, credentials('alice', PASSWORD));
      const wrongPassword = await captureError(
        loginAccount(deps, credentials('alice', WRONG_PASSWORD)),
      );
      const unknownUser = await captureError(loginAccount(deps, credentials('mallory', PASSWORD)));
      expect(wrongPassword.code).toBe('INVALID_CREDENTIALS');
      expect(unknownUser.code).toBe('INVALID_CREDENTIALS');
      expect(unknownUser.message).toBe(wrongPassword.message);
      expect(unknownUser.retryAfterSeconds).toBeUndefined();
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'refuses a disabled account even with the right password',
    async () => {
      const session = await registerAccount(deps, credentials('alice', PASSWORD));
      await db.query(`UPDATE accounts SET disabled_at = $2::timestamptz WHERE id = $1`, [
        session.accountId,
        new Date(nowMs).toISOString(),
      ]);
      const error = await captureError(loginAccount(deps, credentials('alice', PASSWORD)));
      expect(error.code).toBe('INVALID_CREDENTIALS');
      await expect(resolveAccountSession(deps, session.token)).resolves.toBeUndefined();
    },
    SCRYPT_TIMEOUT_MS,
  );
});

describe('error messages', () => {
  it(
    'never echo the submitted password or any fragment of the stored hash',
    async () => {
      await registerAccount(deps, credentials('alice', PASSWORD));
      const fragments = [PASSWORD, ...windowsOf(await storedHashFor('alice'))];
      const closed = depsWith({ registrationOpen: false });

      // Sequential, so each failure is produced by exactly the call written here.
      const failures = [
        await captureError(loginAccount(deps, credentials('alice', WRONG_PASSWORD))),
        await captureError(loginAccount(deps, credentials('nobody', PASSWORD))),
        await captureError(registerAccount(deps, credentials('alice', PASSWORD))),
        await captureError(registerAccount(deps, credentials('bad name', PASSWORD))),
        await captureError(registerAccount(deps, credentials('carol', 'Pw1'))),
        await captureError(registerAccount(closed, credentials('dave', PASSWORD))),
      ];

      expect(failures.map((error) => error.code)).toEqual([
        'INVALID_CREDENTIALS',
        'INVALID_CREDENTIALS',
        'USERNAME_TAKEN',
        'USERNAME_INVALID',
        'PASSWORD_INVALID',
        'REGISTRATION_DISABLED',
      ]);
      const leaks = failures.flatMap((error) =>
        fragments
          .filter((fragment) => error.message.includes(fragment))
          .map((fragment) => `${error.code}: ${fragment}`),
      );
      expect(leaks).toEqual([]);
    },
    SCRYPT_TIMEOUT_MS,
  );
});

describe('login throttling', () => {
  it(
    'refuses every attempt after eight failures, including the right password, until the window passes',
    async () => {
      await registerAccount(deps, credentials('alice', PASSWORD));
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const error = await captureError(loginAccount(deps, credentials('alice', WRONG_PASSWORD)));
        expect(error.code).toBe('INVALID_CREDENTIALS');
      }
      const limited = await captureError(loginAccount(deps, credentials('alice', PASSWORD)));
      expect(limited.code).toBe('RATE_LIMITED');
      expect(limited.retryAfterSeconds).toBe(FIFTEEN_MINUTES_MS / 1000);
      expect(limited.message).not.toContain(PASSWORD);

      nowMs += FIFTEEN_MINUTES_MS;
      await expect(loginAccount(deps, credentials('alice', PASSWORD))).resolves.toMatchObject({
        username: 'alice',
      });
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'clears the failure count after a successful sign-in',
    async () => {
      const strict = depsWith({
        throttle: new LoginThrottle({
          maxFailures: 2,
          windowMs: FIFTEEN_MINUTES_MS,
          maxKeys: 100,
          now: () => nowMs,
        }),
      });
      await registerAccount(strict, credentials('alice', PASSWORD));
      const outcomes = [
        await outcomeOf(loginAccount(strict, credentials('alice', WRONG_PASSWORD))),
        await outcomeOf(loginAccount(strict, credentials('alice', PASSWORD))),
        await outcomeOf(loginAccount(strict, credentials('alice', WRONG_PASSWORD))),
        await outcomeOf(loginAccount(strict, credentials('alice', WRONG_PASSWORD))),
        await outcomeOf(loginAccount(strict, credentials('alice', WRONG_PASSWORD))),
      ];
      expect(outcomes).toEqual([
        'INVALID_CREDENTIALS',
        'OK',
        'INVALID_CREDENTIALS',
        'INVALID_CREDENTIALS',
        'RATE_LIMITED',
      ]);
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'bounds concurrent wrong-password attempts by the failure budget',
    async () => {
      await registerAccount(deps, credentials('alice', PASSWORD));
      // Ten attempts start before any of them records a failure. The budget is 8.
      const outcomes = await Promise.all(
        Array.from({ length: 10 }, () =>
          outcomeOf(loginAccount(deps, credentials('alice', WRONG_PASSWORD))),
        ),
      );
      expect(outcomes.filter((code) => code === 'INVALID_CREDENTIALS').length).toBeLessThanOrEqual(
        8,
      );
    },
    SCRYPT_TIMEOUT_MS,
  );
});

describe('logoutAccount and pruneExpiredSessions', () => {
  it(
    'revokes only the presented session',
    async () => {
      await registerAccount(deps, credentials('alice', PASSWORD));
      const first = await loginAccount(deps, credentials('alice', PASSWORD));
      const second = await loginAccount(deps, credentials('alice', PASSWORD));
      await logoutAccount(deps, first.token);
      await expect(resolveAccountSession(deps, first.token)).resolves.toBeUndefined();
      await expect(resolveAccountSession(deps, second.token)).resolves.toMatchObject({
        username: 'alice',
      });
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'does nothing when no token is presented',
    async () => {
      const session = await registerAccount(deps, credentials('alice', PASSWORD));
      await expect(logoutAccount(deps, undefined)).resolves.toBeUndefined();
      const revoked = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM account_sessions WHERE revoked_at IS NOT NULL`,
      );
      expect(revoked.rows[0]!.n).toBe(0);
      await expect(resolveAccountSession(deps, session.token)).resolves.toMatchObject({
        username: 'alice',
      });
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'pruneExpiredSessions removes sessions once they reach their expiry',
    async () => {
      const session = await registerAccount(deps, credentials('alice', PASSWORD));
      nowMs += THIRTY_DAYS_MS;
      await expect(resolveAccountSession(deps, session.token)).resolves.toBeUndefined();
      await pruneExpiredSessions(deps);
      await expect(countRows('account_sessions')).resolves.toBe(0);
    },
    SCRYPT_TIMEOUT_MS,
  );
});
