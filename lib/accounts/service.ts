import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import {
  dummyPasswordHash,
  generateTemporaryPassword,
  hashPassword,
  normalizePassword,
  passwordProblem,
  verifyPassword,
} from './password';
import { createSession, revokeSessionToken } from './session';
import {
  type AccountRole,
  type AccountStatus,
  type Db,
  findAccountById,
  findAccountByUsername,
  inTransaction,
  insertAccount,
  insertAttempt,
  insertAudit,
  lockActiveAdmins,
  publicUser,
  type PublicUser,
  recentFailures,
  recordLastLogin,
  revokeAccountSessions,
  setPasswordHash,
  updateAccountFields,
} from './repository';
import {
  ADDRESS_FAILURE_LIMIT,
  PAIR_FAILURE_LIMIT,
  THROTTLE_WINDOW_MS,
  throttleVerdict,
  USERNAME_FAILURE_LIMIT,
} from './throttle';
import { isUsernameShape, normalizeUsername, usernameProblem } from './username';

export type AccountErrorCode =
  | 'INVALID_USERNAME'
  | 'INVALID_DISPLAY_NAME'
  | 'WEAK_PASSWORD'
  | 'USERNAME_TAKEN'
  | 'NOT_FOUND'
  | 'DELETED'
  | 'LAST_ADMIN';

/** A refused administrative change. `reason` names the rule, never a secret. */
export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    readonly reason: string,
  ) {
    super(`${code}: ${reason}`);
    this.name = 'AccountError';
  }
}

interface Scope {
  scope: string;
  limit: number;
}

/** The longest a refusal can last for these scopes, or `undefined` when none is refused. */
async function refusalFor(
  db: Db,
  scopes: readonly Scope[],
  now: number,
): Promise<number | undefined> {
  let refusal: number | undefined;
  for (const { scope, limit } of scopes) {
    const failures = await recentFailures(db, scope, new Date(now - THROTTLE_WINDOW_MS), limit);
    const verdict = throttleVerdict(failures, limit, now);
    if (verdict.locked) refusal = Math.max(refusal ?? 0, verdict.retryAfterMs);
  }
  return refusal;
}

/** The throttle scopes of one attempt: the name, the name from this address, and the address. */
function scopesFor(username: string | undefined, address: string | undefined): Scope[] {
  const scopes: Scope[] = [];
  if (username !== undefined) {
    scopes.push({ scope: `user:${username}`, limit: USERNAME_FAILURE_LIMIT });
    if (address !== undefined) {
      scopes.push({ scope: `pair:${username}@${address}`, limit: PAIR_FAILURE_LIMIT });
    }
  }
  if (address !== undefined) scopes.push({ scope: `ip:${address}`, limit: ADDRESS_FAILURE_LIMIT });
  return scopes;
}

export interface LoginInput {
  username: string;
  password: string;
  address?: string;
  userAgent?: string;
  /** The session the request already carries, replaced by the new one. */
  presentedToken?: string;
  now: number;
}

export type LoginResult =
  | { outcome: 'ok'; token: string; expiresAt: Date; user: PublicUser }
  | { outcome: 'invalid' }
  | { outcome: 'locked'; retryAfterMs: number };

/**
 * Sign in. Every failure (unknown username, wrong password, disabled account)
 * is `invalid`, and a miss runs the same hash as a hit. A new session is always
 * issued, and the one presented is revoked (no fixation).
 */
export async function login(pool: Pool, input: LoginInput): Promise<LoginResult> {
  const username = normalizeUsername(input.username);
  const shaped = isUsernameShape(username);
  const scopes = scopesFor(shaped ? username : undefined, input.address);
  const refusal = await refusalFor(pool, scopes, input.now);
  if (refusal !== undefined) return { outcome: 'locked', retryAfterMs: refusal };

  const account = shaped ? await findAccountByUsername(pool, username) : undefined;
  const matches = await verifyPassword(
    input.password,
    account?.passwordHash ?? (await dummyPasswordHash()),
  );
  const ok = matches && account !== undefined && account.status === 'active';
  const at = new Date(input.now);
  for (const { scope } of scopes) await insertAttempt(pool, scope, at, ok);
  if (!ok || account === undefined) return { outcome: 'invalid' };

  await revokeSessionToken(pool, input.presentedToken, input.now);
  const { token, expiresAt } = await createSession(pool, {
    userId: account.id,
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
    ...(input.address === undefined ? {} : { ip: input.address }),
    now: input.now,
  });
  await recordLastLogin(pool, account.id, at);
  return { outcome: 'ok', token, expiresAt, user: publicUser(account) };
}

export interface ChangePasswordInput {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
  address?: string;
  now: number;
}

export type ChangePasswordResult =
  | { outcome: 'ok' }
  | { outcome: 'invalid' }
  | { outcome: 'locked'; retryAfterMs: number };

/**
 * Change the signed-in account's own password. The current password is verified
 * first, under the same throttle as sign-in, and each guess counts. The reuse
 * check and the policy run only after that, so a guess never learns anything
 * about the new password: a wrong current password is `invalid` whatever the new
 * one is, and a new password equal to the current one is `invalid` as well. Every
 * other session of the account is revoked; the calling session stays.
 */
export async function changeOwnPassword(
  pool: Pool,
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const account = await findAccountById(pool, input.userId);
  if (!account || account.status !== 'active') return { outcome: 'invalid' };
  const scopes = scopesFor(account.username, input.address);
  const refusal = await refusalFor(pool, scopes, input.now);
  if (refusal !== undefined) return { outcome: 'locked', retryAfterMs: refusal };

  const matches = await verifyPassword(input.currentPassword, account.passwordHash);
  const at = new Date(input.now);
  for (const { scope } of scopes) await insertAttempt(pool, scope, at, matches);
  if (!matches) return { outcome: 'invalid' };
  if (normalizePassword(input.newPassword) === normalizePassword(input.currentPassword)) {
    return { outcome: 'invalid' };
  }
  const problem = passwordProblem(input.newPassword, account.username);
  if (problem) throw new AccountError('WEAK_PASSWORD', problem);

  const passwordHash = await hashPassword(input.newPassword);
  return inTransaction<ChangePasswordResult>(pool, async (tx) => {
    const changed = await setPasswordHash(
      tx,
      account.id,
      passwordHash,
      false,
      at,
      account.passwordHash,
    );
    if (!changed) return { outcome: 'invalid' };
    await revokeAccountSessions(tx, account.id, at, input.sessionId);
    await insertAudit(tx, {
      at,
      actorId: account.id,
      action: 'user.password_change',
      targetId: account.id,
      detail: {},
    });
    return { outcome: 'ok' };
  });
}

/** End every session of the account, the calling one included. */
export async function signOutEverywhere(
  pool: Pool,
  input: { userId: string; now: number },
): Promise<void> {
  await revokeAccountSessions(pool, input.userId, new Date(input.now));
}

/** A display name: trimmed, 1 to 80 characters, no control characters. */
export function normalizeDisplayName(input: string): string {
  const value = input.trim();
  if ([...value].length < 1 || [...value].length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new AccountError('INVALID_DISPLAY_NAME', 'display name must be 1 to 80 characters');
  }
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '23505';
}

export interface CreateAccountInput {
  actorId: string | null;
  username: string;
  displayName: string;
  role: AccountRole;
  /** Omitted: a temporary password is generated and returned once. */
  password?: string;
  mustChangePassword: boolean;
  now: number;
}

export interface CreatedAccount {
  user: PublicUser;
  temporaryPassword?: string;
}

export async function createAccount(
  pool: Pool,
  input: CreateAccountInput,
): Promise<CreatedAccount> {
  const username = normalizeUsername(input.username);
  const problem = usernameProblem(username);
  if (problem) throw new AccountError('INVALID_USERNAME', problem);
  const displayName = normalizeDisplayName(input.displayName);
  const generated = input.password === undefined;
  const password = input.password ?? generateTemporaryPassword(username);
  const weak = passwordProblem(password, username);
  if (weak) throw new AccountError('WEAK_PASSWORD', weak);

  const at = new Date(input.now);
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await inTransaction(pool, async (tx) => {
      await insertAccount(tx, {
        id,
        username,
        displayName,
        passwordHash,
        role: input.role,
        mustChangePassword: input.mustChangePassword,
        now: at,
      });
      await insertAudit(tx, {
        at,
        actorId: input.actorId,
        action: 'user.create',
        targetId: id,
        detail: { username, role: input.role, generatedPassword: generated },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountError('USERNAME_TAKEN', username);
    throw error;
  }
  return {
    user: publicUser({
      id,
      username,
      displayName,
      role: input.role,
      status: 'active',
      mustChangePassword: input.mustChangePassword,
    }),
    ...(generated ? { temporaryPassword: password } : {}),
  };
}

export interface UpdateAccountInput {
  actorId: string | null;
  targetId: string;
  displayName?: string;
  role?: AccountRole;
  status?: AccountStatus;
  now: number;
}

/**
 * Change an account's name, role or status. The active admins are locked first,
 * so the check that one active admin remains and the change are one step. A
 * change that deactivates an account revokes its sessions. Deleted is final.
 */
export async function updateAccount(pool: Pool, input: UpdateAccountInput): Promise<PublicUser> {
  const at = new Date(input.now);
  return inTransaction(pool, async (tx) => {
    const admins = await lockActiveAdmins(tx);
    const target = await findAccountById(tx, input.targetId, { lock: true });
    if (!target) throw new AccountError('NOT_FOUND', 'account not found');
    if (target.status === 'deleted')
      throw new AccountError('DELETED', 'deleted accounts cannot be changed');
    const next = {
      displayName:
        input.displayName === undefined
          ? target.displayName
          : normalizeDisplayName(input.displayName),
      role: input.role ?? target.role,
      status: input.status ?? target.status,
    };
    const wasActiveAdmin = target.role === 'admin' && target.status === 'active';
    const isActiveAdmin = next.role === 'admin' && next.status === 'active';
    if (wasActiveAdmin && !isActiveAdmin && admins.every((id) => id === target.id)) {
      throw new AccountError('LAST_ADMIN', 'at least one active admin must remain');
    }
    const deletedAt = next.status === 'deleted' ? (target.deletedAt ?? at) : null;
    await updateAccountFields(tx, target.id, { ...next, deletedAt }, at);
    if (next.status !== 'active') await revokeAccountSessions(tx, target.id, at);
    const changed = (['displayName', 'role', 'status'] as const).filter(
      (field) => next[field] !== target[field],
    );
    await insertAudit(tx, {
      at,
      actorId: input.actorId,
      action: 'user.update',
      targetId: target.id,
      detail: { changed },
    });
    return publicUser({ ...target, ...next });
  });
}

/** Set a new temporary password, which must be changed at next sign-in. Every session of the account ends. */
export async function resetAccountPassword(
  pool: Pool,
  input: { actorId: string | null; targetId: string; now: number },
): Promise<{ temporaryPassword: string }> {
  const at = new Date(input.now);
  return inTransaction(pool, async (tx) => {
    const target = await findAccountById(tx, input.targetId, { lock: true });
    if (!target) throw new AccountError('NOT_FOUND', 'account not found');
    if (target.status === 'deleted')
      throw new AccountError('DELETED', 'deleted accounts cannot be changed');
    const temporaryPassword = generateTemporaryPassword(target.username);
    await setPasswordHash(tx, target.id, await hashPassword(temporaryPassword), true, at);
    await revokeAccountSessions(tx, target.id, at);
    await insertAudit(tx, {
      at,
      actorId: input.actorId,
      action: 'user.password_reset',
      targetId: target.id,
      detail: {},
    });
    return { temporaryPassword };
  });
}

/** Make an existing account an active admin (the operator's recovery path, see scripts/accounts). */
export async function promoteAccount(
  pool: Pool,
  input: { username: string; now: number },
): Promise<PublicUser> {
  const username = normalizeUsername(input.username);
  const at = new Date(input.now);
  return inTransaction(pool, async (tx) => {
    const target = await findAccountByUsername(tx, username, { lock: true });
    if (!target) throw new AccountError('NOT_FOUND', 'account not found');
    if (target.status === 'deleted')
      throw new AccountError('DELETED', 'deleted accounts cannot be changed');
    await updateAccountFields(
      tx,
      target.id,
      { displayName: target.displayName, role: 'admin', status: 'active', deletedAt: null },
      at,
    );
    await insertAudit(tx, {
      at,
      actorId: null,
      action: 'user.promote',
      targetId: target.id,
      detail: { previousRole: target.role, previousStatus: target.status },
    });
    return publicUser({ ...target, role: 'admin', status: 'active' });
  });
}
