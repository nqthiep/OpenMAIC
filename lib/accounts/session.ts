import { createHash, randomBytes } from 'node:crypto';

import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, type SessionState } from './gate';
import {
  type AccountStatus,
  type Db,
  findSession,
  insertSession,
  publicUser,
  type PublicUser,
  revokeSession,
  touchSession,
} from './repository';

/** A session's last-seen time is written at most this often, so a busy session writes once a minute. */
const TOUCH_INTERVAL_MS = 60 * 1000;
/** 32 random bytes in base64url, unpadded. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function sessionIdOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionVerdict = 'valid' | 'revoked' | 'expired' | 'idle' | 'inactive';

/** The lifecycle rules as a pure function: absolute expiry, idle expiry, revocation, account status. */
export function sessionVerdict(
  session: { revokedAt: Date | null; expiresAt: Date; lastSeenAt: Date },
  status: AccountStatus,
  now: number,
): SessionVerdict {
  if (session.revokedAt !== null) return 'revoked';
  if (now >= session.expiresAt.getTime()) return 'expired';
  if (now - session.lastSeenAt.getTime() >= SESSION_IDLE_MS) return 'idle';
  if (status !== 'active') return 'inactive';
  return 'valid';
}

export interface ResolvedSession {
  state: SessionState;
  /** Present for `valid` and `password-change`. */
  user?: PublicUser;
  sessionId?: string;
}

/**
 * Resolve the session a token names. A missing token is `none`; a malformed or
 * unknown one, or one that fails {@link sessionVerdict}, is `invalid`; a valid
 * one is `valid`, or `password-change` while the account must change its password.
 * A database error throws: it is never answered as an anonymous request.
 */
export async function resolveSession(
  db: Db,
  token: string | undefined,
  now: number,
): Promise<ResolvedSession> {
  if (token === undefined) return { state: 'none' };
  if (!TOKEN_SHAPE.test(token)) return { state: 'invalid' };
  const sessionId = sessionIdOf(token);
  const row = await findSession(db, sessionId);
  if (!row) return { state: 'invalid', sessionId };
  const verdict = sessionVerdict(row, row.status, now);
  if (verdict !== 'valid') return { state: 'invalid', sessionId };
  if (now - row.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    await touchSession(db, sessionId, new Date(now));
  }
  return {
    state: row.mustChangePassword ? 'password-change' : 'valid',
    user: publicUser({
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      status: row.status,
      mustChangePassword: row.mustChangePassword,
    }),
    sessionId,
  };
}

/** Start a session for an account. The token is returned once; only its hash is stored. */
export async function createSession(
  db: Db,
  input: { userId: string; userAgent?: string; ip?: string; now: number },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(input.now + SESSION_ABSOLUTE_MS);
  await insertSession(db, {
    id: sessionIdOf(token),
    userId: input.userId,
    createdAt: new Date(input.now),
    expiresAt,
    userAgent: input.userAgent ? input.userAgent.slice(0, 200) : null,
    ip: input.ip ?? null,
  });
  return { token, expiresAt };
}

/** Revoke the session a token names. Unknown or malformed tokens are ignored. */
export async function revokeSessionToken(
  db: Db,
  token: string | undefined,
  now: number,
): Promise<void> {
  if (token === undefined || !TOKEN_SHAPE.test(token)) return;
  await revokeSession(db, sessionIdOf(token), new Date(now));
}
