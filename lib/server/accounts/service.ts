/**
 * Account operations: registration, sign-in, sign-out and session resolution.
 *
 * Dependencies are passed in so the same logic runs against the production
 * pool and against the in-process database used by tests.
 */
import { randomUUID } from 'node:crypto';

import type { LoginThrottle } from './login-throttle';
import { createSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from './session';
import {
  deleteExpiredSessions,
  findAccountByUsername,
  findSessionAccount,
  insertAccount,
  insertSession,
  revokeSession,
  type AccountQueryable,
  type AccountRecord,
  type SessionAccount,
} from './store';
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PasswordWorkBusyError,
  verifyAgainstDummyHash,
  verifyPassword,
} from './password';
import { isAcceptablePassword, normalizeUsername } from './validation';

export type AccountErrorCode =
  | 'ACCOUNTS_NOT_CONFIGURED'
  | 'REGISTRATION_DISABLED'
  | 'USERNAME_INVALID'
  | 'PASSWORD_INVALID'
  | 'USERNAME_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED';

/**
 * Failures carry a code and a fixed English message. Neither includes the
 * submitted password, a hash, or whether a username exists beyond what
 * registration inherently reveals.
 */
export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

export interface AccountServiceDeps {
  db: AccountQueryable;
  throttle: LoginThrottle;
  registrationOpen: boolean;
  now?: () => Date;
}

export interface IssuedSession {
  token: string;
  accountId: string;
  username: string;
  expiresAt: Date;
}

export interface CredentialsInput {
  username: unknown;
  password: unknown;
}

/**
 * Prefix of every signed-in owner and learner partition key. It is reserved for
 * partitions named by a verified session: no client-supplied header may select one.
 */
export const ACCOUNT_OWNER_PREFIX = 'acct:';

/** Owner and learner partition key for a signed-in account. */
export function accountOwnerId(accountId: string): string {
  return `${ACCOUNT_OWNER_PREFIX}${accountId}`;
}

function clock(deps: AccountServiceDeps): Date {
  return (deps.now ?? (() => new Date()))();
}

async function issueSession(
  deps: AccountServiceDeps,
  accountId: string,
  username: string,
  now: Date,
): Promise<IssuedSession> {
  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  // Expired rows can never authenticate. Removing them here keeps the table bounded
  // without a background job; the expires_at index makes the delete cheap.
  await deleteExpiredSessions(deps.db, now);
  await insertSession(deps.db, {
    tokenHash: hashSessionToken(token),
    accountId,
    createdAt: now,
    expiresAt,
  });
  return { token, accountId, username, expiresAt };
}

export async function registerAccount(
  deps: AccountServiceDeps,
  input: CredentialsInput,
): Promise<IssuedSession> {
  if (!deps.registrationOpen) {
    throw new AccountError('REGISTRATION_DISABLED', 'New account registration is disabled.');
  }
  const username = normalizeUsername(input.username);
  if (!username) {
    throw new AccountError(
      'USERNAME_INVALID',
      'Usernames are 3-32 characters: letters, digits, dots, underscores or hyphens, starting with a letter or digit.',
    );
  }
  if (!isAcceptablePassword(input.password)) {
    throw new AccountError(
      'PASSWORD_INVALID',
      `Passwords must be between 8 and ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }

  const now = clock(deps);
  const passwordHash = await hashPassword(input.password);
  const accountId = randomUUID();
  const inserted = await insertAccount(deps.db, {
    id: accountId,
    username,
    passwordHash,
    createdAt: now,
  });
  if (!inserted) {
    throw new AccountError('USERNAME_TAKEN', 'That username is already taken.');
  }
  return issueSession(deps, accountId, username, now);
}

async function checkCredentials(
  deps: AccountServiceDeps,
  username: string,
  password: string,
): Promise<{ account: AccountRecord | undefined; passwordMatches: boolean }> {
  const account = await findAccountByUsername(deps.db, username);
  // Unknown usernames verify against a placeholder hash so both branches spend
  // a full scrypt computation and the response time does not reveal existence.
  const passwordMatches = account
    ? await verifyPassword(password, account.passwordHash)
    : await verifyAgainstDummyHash(password);
  return { account, passwordMatches };
}

export async function loginAccount(
  deps: AccountServiceDeps,
  input: CredentialsInput,
): Promise<IssuedSession> {
  const invalid = () => new AccountError('INVALID_CREDENTIALS', 'Incorrect username or password.');

  const username = normalizeUsername(input.username);
  if (!username || !isAcceptablePassword(input.password)) throw invalid();

  const retryAfter = deps.throttle.retryAfterSeconds(username);
  if (retryAfter !== undefined) {
    throw new AccountError(
      'RATE_LIMITED',
      'Too many failed sign-in attempts. Try again later.',
      retryAfter,
    );
  }
  // Counted before the first await, so attempts that run concurrently see each
  // other and cannot all pass the check above. A successful sign-in clears the count.
  const failure = deps.throttle.recordFailure(username);

  const { account, passwordMatches } = await checkCredentials(deps, username, input.password).catch(
    (error: unknown) => {
      // A busy password queue means no password was checked, so this is not a guess.
      if (error instanceof PasswordWorkBusyError) deps.throttle.refund(username, failure);
      throw error;
    },
  );

  if (!account || account.disabled || !passwordMatches) {
    throw invalid();
  }

  deps.throttle.reset(username);
  return issueSession(deps, account.id, account.username, clock(deps));
}

export async function logoutAccount(
  deps: AccountServiceDeps,
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  await revokeSession(deps.db, hashSessionToken(token), clock(deps));
}

/** The account behind a session token, or undefined when the token is absent, unknown, expired or revoked. */
export async function resolveAccountSession(
  deps: AccountServiceDeps,
  token: string | undefined,
): Promise<SessionAccount | undefined> {
  if (!token) return undefined;
  return findSessionAccount(deps.db, hashSessionToken(token), clock(deps));
}

/** Removes sessions that have expired. Callers decide how often to run it. */
export async function pruneExpiredSessions(deps: AccountServiceDeps): Promise<void> {
  await deleteExpiredSessions(deps.db, clock(deps));
}
