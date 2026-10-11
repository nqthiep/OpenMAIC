import type { MigrationQueryable } from '@openmaic/storage/pg-migrations';
import type { Pool } from 'pg';

import { THROTTLE_WINDOW_MS } from './throttle';

/** What the accounts code needs from a connection: one statement per call. */
export type Db = MigrationQueryable;

export type AccountRole = 'user' | 'admin';
export type AccountStatus = 'active' | 'disabled' | 'deleted';

/** A stored account. The password hash stays here; responses use {@link PublicUser}. */
export interface AccountRow {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AccountRole;
  status: AccountStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  status: AccountStatus;
  mustChangePassword: boolean;
}

export function publicUser(account: Pick<AccountRow, keyof PublicUser>): PublicUser {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    mustChangePassword: account.mustChangePassword,
  };
}

export interface SessionLookup {
  id: string;
  userId: string;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  username: string;
  displayName: string;
  role: AccountRole;
  status: AccountStatus;
  mustChangePassword: boolean;
}

interface RawAccount extends Record<string, unknown> {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: AccountRole;
  status: AccountStatus;
  must_change_password: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  deleted_at: Date | null;
}

interface RawSession extends Record<string, unknown> {
  id: string;
  user_id: string;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  username: string;
  display_name: string;
  role: AccountRole;
  status: AccountStatus;
  must_change_password: boolean;
}

const ACCOUNT_COLUMNS = `id, username, display_name, password_hash, role, status,
  must_change_password, created_at, updated_at, last_login_at, deleted_at`;

function toAccount(row: RawAccount): AccountRow {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    deletedAt: row.deleted_at,
  };
}

export async function findAccountByUsername(
  db: Db,
  username: string,
  options: { lock?: boolean } = {},
): Promise<AccountRow | undefined> {
  const result = await db.query<RawAccount>(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts_users WHERE username = $1${options.lock ? ' FOR UPDATE' : ''}`,
    [username],
  );
  const row = result.rows[0];
  return row ? toAccount(row) : undefined;
}

export async function findAccountById(
  db: Db,
  id: string,
  options: { lock?: boolean } = {},
): Promise<AccountRow | undefined> {
  const result = await db.query<RawAccount>(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts_users WHERE id = $1${options.lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  const row = result.rows[0];
  return row ? toAccount(row) : undefined;
}

export interface NewAccount {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AccountRole;
  mustChangePassword: boolean;
  now: Date;
}

export async function insertAccount(db: Db, account: NewAccount): Promise<void> {
  await db.query(
    `INSERT INTO accounts_users
       (id, username, display_name, password_hash, role, status, must_change_password, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $7)`,
    [
      account.id,
      account.username,
      account.displayName,
      account.passwordHash,
      account.role,
      account.mustChangePassword,
      account.now,
    ],
  );
}

/** The ids of the active admins, locked for the rest of the transaction, in a fixed order. */
export async function lockActiveAdmins(db: Db): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM accounts_users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE`,
  );
  return result.rows.map((row) => row.id);
}

export async function updateAccountFields(
  db: Db,
  id: string,
  fields: { displayName: string; role: AccountRole; status: AccountStatus; deletedAt: Date | null },
  now: Date,
): Promise<void> {
  await db.query(
    `UPDATE accounts_users
        SET display_name = $2, role = $3, status = $4, deleted_at = $5, updated_at = $6
      WHERE id = $1`,
    [id, fields.displayName, fields.role, fields.status, fields.deletedAt, now],
  );
}

/**
 * Replace the password hash. With `expectedHash`, only when the stored hash is
 * still that one (a compare-and-set). Returns whether a row changed.
 */
export async function setPasswordHash(
  db: Db,
  id: string,
  passwordHash: string,
  mustChangePassword: boolean,
  now: Date,
  expectedHash?: string,
): Promise<boolean> {
  const result =
    expectedHash === undefined
      ? await db.query<{ id: string }>(
          `UPDATE accounts_users
              SET password_hash = $2, must_change_password = $3, updated_at = $4
            WHERE id = $1 AND status <> 'deleted'
           RETURNING id`,
          [id, passwordHash, mustChangePassword, now],
        )
      : await db.query<{ id: string }>(
          `UPDATE accounts_users
              SET password_hash = $2, must_change_password = $3, updated_at = $4
            WHERE id = $1 AND password_hash = $5 AND status <> 'deleted'
           RETURNING id`,
          [id, passwordHash, mustChangePassword, now, expectedHash],
        );
  return result.rows.length === 1;
}

export async function recordLastLogin(db: Db, id: string, at: Date): Promise<void> {
  await db.query(`UPDATE accounts_users SET last_login_at = $2 WHERE id = $1`, [id, at]);
}

export interface NewSession {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export async function insertSession(db: Db, session: NewSession): Promise<void> {
  await db.query(
    `INSERT INTO accounts_sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $3, $4, $5, $6)`,
    [
      session.id,
      session.userId,
      session.createdAt,
      session.expiresAt,
      session.userAgent,
      session.ip,
    ],
  );
}

export async function findSession(db: Db, id: string): Promise<SessionLookup | undefined> {
  const result = await db.query<RawSession>(
    `SELECT s.id, s.user_id, s.last_seen_at, s.expires_at, s.revoked_at,
            u.username, u.display_name, u.role, u.status, u.must_change_password
       FROM accounts_sessions s
       JOIN accounts_users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.user_id,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
  };
}

export async function touchSession(db: Db, id: string, at: Date): Promise<void> {
  await db.query(`UPDATE accounts_sessions SET last_seen_at = $2 WHERE id = $1`, [id, at]);
}

export async function revokeSession(db: Db, id: string, at: Date): Promise<void> {
  await db.query(
    `UPDATE accounts_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`,
    [id, at],
  );
}

/** Revoke every live session of an account, except `keepSessionId` when given. */
export async function revokeAccountSessions(
  db: Db,
  userId: string,
  at: Date,
  keepSessionId?: string,
): Promise<void> {
  if (keepSessionId === undefined) {
    await db.query(
      `UPDATE accounts_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, at],
    );
    return;
  }
  await db.query(
    `UPDATE accounts_sessions SET revoked_at = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND id <> $3`,
    [userId, at, keepSessionId],
  );
}

/**
 * Record one verified attempt for `scope`, and drop every attempt older than the
 * throttle window (all scopes, so the table holds only what the throttle reads).
 */
export async function insertAttempt(
  db: Db,
  scope: string,
  at: Date,
  success: boolean,
): Promise<void> {
  await db.query(`INSERT INTO accounts_login_attempts (scope, at, success) VALUES ($1, $2, $3)`, [
    scope,
    at,
    success,
  ]);
  // ponytail: no index on `at` alone (the index is (scope, at)). The table holds about one window
  // of attempts, so this scan stays small; add an index on (at) if the login rate grows.
  await db.query(`DELETE FROM accounts_login_attempts WHERE at <= $1`, [
    new Date(at.getTime() - THROTTLE_WINDOW_MS),
  ]);
}

/** Failure times (epoch ms, newest first) of a scope since `since`, at most `limit` of them. */
export async function recentFailures(
  db: Db,
  scope: string,
  since: Date,
  limit: number,
): Promise<number[]> {
  const result = await db.query<{ at: Date }>(
    `SELECT at FROM accounts_login_attempts
      WHERE scope = $1 AND success = false AND at > $2
      ORDER BY at DESC
      LIMIT $3`,
    [scope, since, limit],
  );
  return result.rows.map((row) => new Date(row.at).getTime());
}

export interface AuditEntry {
  at: Date;
  actorId: string | null;
  action: string;
  targetId: string | null;
  /** Never a secret: no password, hash or token. */
  detail: Record<string, unknown>;
}

export async function insertAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO accounts_audit_log (at, actor_id, action, target_id, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [entry.at, entry.actorId, entry.action, entry.targetId, JSON.stringify(entry.detail)],
  );
}

export interface AccountListRow extends PublicUser {
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface AccountQuery {
  /** Matches the username or the display name, case-insensitively. */
  q?: string;
  status?: AccountStatus;
  role?: AccountRole;
  /** Only usernames after this one: the last username of the previous page. */
  after?: string;
  limit: number;
}

interface RawListRow extends Record<string, unknown> {
  id: string;
  username: string;
  display_name: string;
  role: AccountRole;
  status: AccountStatus;
  must_change_password: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

/** Accounts in username order, filtered. The password hash is never selected. */
export async function listAccounts(db: Db, query: AccountQuery): Promise<AccountListRow[]> {
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const where: string[] = [];
  if (query.q) {
    const pattern = bind(`%${query.q.replace(/[!%_]/g, (char) => `!${char}`)}%`);
    where.push(
      `(username ILIKE ${pattern} ESCAPE '!' OR display_name ILIKE ${pattern} ESCAPE '!')`,
    );
  }
  if (query.status) where.push(`status = ${bind(query.status)}`);
  if (query.role) where.push(`role = ${bind(query.role)}`);
  if (query.after !== undefined) where.push(`username > ${bind(query.after)}`);
  const limit = bind(query.limit);
  const result = await db.query<RawListRow>(
    `SELECT id, username, display_name, role, status, must_change_password, created_at, last_login_at
       FROM accounts_users
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY username
      LIMIT ${limit}`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }));
}

export interface AuditRow {
  /** The bigserial id as text: the cursor of the next page. */
  id: string;
  at: Date;
  action: string;
  actor: { id: string; username: string | null } | null;
  target: { id: string; username: string | null } | null;
  detail: Record<string, unknown>;
}

interface RawAuditRow extends Record<string, unknown> {
  id: string;
  at: Date;
  action: string;
  detail: Record<string, unknown> | null;
  actor_id: string | null;
  actor_username: string | null;
  target_id: string | null;
  target_username: string | null;
}

/** Audit entries, newest first, starting below `before` when given. Joins usernames, never a hash. */
export async function listAudit(db: Db, limit: number, before?: string): Promise<AuditRow[]> {
  const result = await db.query<RawAuditRow>(
    `SELECT l.id, l.at, l.action, l.detail,
            l.actor_id, actor.username AS actor_username,
            l.target_id, target.username AS target_username
       FROM accounts_audit_log l
       LEFT JOIN accounts_users actor ON actor.id = l.actor_id
       LEFT JOIN accounts_users target ON target.id = l.target_id
      ${before === undefined ? '' : 'WHERE l.id < $2'}
      ORDER BY l.id DESC
      LIMIT $1`,
    before === undefined ? [limit] : [limit, before],
  );
  return result.rows.map((row) => ({
    id: row.id,
    at: row.at,
    action: row.action,
    actor: row.actor_id === null ? null : { id: row.actor_id, username: row.actor_username },
    target: row.target_id === null ? null : { id: row.target_id, username: row.target_username },
    detail: row.detail ?? {},
  }));
}

/** Run `body` on one pooled connection inside BEGIN/COMMIT, rolling back when it throws. */
export async function inTransaction<T>(pool: Pool, body: (tx: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await body(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
