/**
 * Postgres storage for accounts and their sessions. Every statement is
 * parameterized; timestamps travel as ISO-8601 strings and are cast in SQL so
 * the same code runs on `pg` and on the in-process PGlite used by tests.
 */

/** The subset of a pg Pool or client this module needs. */
export interface AccountQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export const ACCOUNT_SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON account_sessions (account_id);

CREATE INDEX IF NOT EXISTS account_sessions_expires_idx ON account_sessions (expires_at);

CREATE TABLE IF NOT EXISTS account_admin_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function ensureAccountSchema(queryable: AccountQueryable): Promise<void> {
  for (const sql of ACCOUNT_SCHEMA.split(';')) {
    const statement = sql.trim();
    if (statement !== '') await queryable.query(statement);
  }
}

export interface AccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  disabled: boolean;
}

export interface SessionAccount {
  accountId: string;
  username: string;
}

interface AccountRow {
  id: string;
  username: string;
  password_hash: string;
  disabled: boolean;
}

interface SessionAccountRow {
  account_id: string;
  username: string;
}

/**
 * Inserts an account. Returns false when the username is already taken; the
 * unique constraint, not a prior read, decides the race between two registrations.
 */
export async function insertAccount(
  db: AccountQueryable,
  account: { id: string; username: string; passwordHash: string; createdAt: Date },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO accounts (id, username, password_hash, created_at)
     VALUES ($1, $2, $3, $4::timestamptz)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    [account.id, account.username, account.passwordHash, account.createdAt.toISOString()],
  );
  return result.rows.length === 1;
}

export async function findAccountByUsername(
  db: AccountQueryable,
  username: string,
): Promise<AccountRecord | undefined> {
  const result = await db.query(
    `SELECT id, username, password_hash, (disabled_at IS NOT NULL) AS disabled
       FROM accounts
      WHERE username = $1`,
    [username],
  );
  const row = result.rows[0] as AccountRow | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    disabled: row.disabled === true,
  };
}

export async function insertSession(
  db: AccountQueryable,
  session: { tokenHash: string; accountId: string; createdAt: Date; expiresAt: Date },
): Promise<void> {
  await db.query(
    `INSERT INTO account_sessions (token_hash, account_id, created_at, expires_at)
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz)`,
    [
      session.tokenHash,
      session.accountId,
      session.createdAt.toISOString(),
      session.expiresAt.toISOString(),
    ],
  );
}

/**
 * The account behind a live session. A session is live when it is unrevoked,
 * unexpired, and its account is not disabled.
 */
export async function findSessionAccount(
  db: AccountQueryable,
  tokenHash: string,
  now: Date,
): Promise<SessionAccount | undefined> {
  const result = await db.query(
    `SELECT s.account_id, a.username
       FROM account_sessions s
       JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > $2::timestamptz
        AND a.disabled_at IS NULL`,
    [tokenHash, now.toISOString()],
  );
  const row = result.rows[0] as SessionAccountRow | undefined;
  return row ? { accountId: row.account_id, username: row.username } : undefined;
}

export async function revokeSession(
  db: AccountQueryable,
  tokenHash: string,
  now: Date,
): Promise<void> {
  await db.query(
    `UPDATE account_sessions
        SET revoked_at = $2::timestamptz
      WHERE token_hash = $1
        AND revoked_at IS NULL`,
    [tokenHash, now.toISOString()],
  );
}

/** Removes sessions that can no longer authenticate. Safe to run at any time. */
export async function deleteExpiredSessions(db: AccountQueryable, now: Date): Promise<void> {
  await db.query(`DELETE FROM account_sessions WHERE expires_at <= $1::timestamptz`, [
    now.toISOString(),
  ]);
}

export interface AccountListRow {
  id: string;
  username: string;
  createdAt: string;
  disabledAt: string | null;
}

interface AccountListDbRow {
  id: string;
  username: string;
  created_at: Date | string;
  disabled_at: Date | string | null;
}

/** One page of accounts in id order, starting after `afterId`. No password material. */
export async function listAccounts(
  db: AccountQueryable,
  afterId: string | undefined,
  limit: number,
): Promise<AccountListRow[]> {
  const result = await db.query(
    `SELECT id, username, created_at, disabled_at
       FROM accounts
      WHERE ($1::text IS NULL OR id > $1::text)
      ORDER BY id
      LIMIT $2::int`,
    [afterId ?? null, limit],
  );
  return (result.rows as AccountListDbRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    createdAt: new Date(row.created_at).toISOString(),
    disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
  }));
}

/**
 * Disables or enables an account and writes its audit row in one statement, so the
 * change and the record of who made it succeed or fail together. Disabling also
 * revokes the account's live sessions, so enabling the account later does not
 * bring them back. Returns false when no account has that id.
 */
export async function setAccountDisabled(
  db: AccountQueryable,
  input: {
    actorId: string;
    targetId: string;
    disable: boolean;
    reason: string | undefined;
    now: Date;
  },
): Promise<boolean> {
  const result = await db.query(
    `WITH target AS (
       UPDATE accounts
          SET disabled_at = CASE WHEN $3::boolean THEN $4::timestamptz ELSE NULL END
        WHERE id = $2::text
        RETURNING id
     ), revoked AS (
       UPDATE account_sessions
          SET revoked_at = $4::timestamptz
        WHERE $3::boolean
          AND account_id = $2::text
          AND revoked_at IS NULL
        RETURNING token_hash
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $1::text, id, $5::text, $6::text, $4::timestamptz FROM target
       RETURNING id
     )
     SELECT id FROM target`,
    [
      input.actorId,
      input.targetId,
      input.disable,
      input.now.toISOString(),
      input.disable ? 'disable' : 'enable',
      input.reason ?? null,
    ],
  );
  return result.rows.length > 0;
}

/** Records an administrator read, such as a page of the account list. */
export async function recordAdminRead(
  db: AccountQueryable,
  input: { actorId: string; action: string; reason: string | undefined; now: Date },
): Promise<void> {
  await db.query(
    `INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
     VALUES ($1::text, '*', $2::text, $3::text, $4::timestamptz)`,
    [input.actorId, input.action, input.reason ?? null, input.now.toISOString()],
  );
}

/**
 * Revokes every live session of the account except the one whose token hash is kept.
 * Returns how many were revoked, so the caller can say what happened.
 */
export async function revokeOtherSessions(
  db: AccountQueryable,
  input: { accountId: string; keepTokenHash: string; now: Date },
): Promise<number> {
  const result = await db.query(
    `UPDATE account_sessions
        SET revoked_at = $3::timestamptz
      WHERE account_id = $1::text
        AND token_hash <> $2::text
        AND revoked_at IS NULL
        AND expires_at > $3::timestamptz
      RETURNING token_hash`,
    [input.accountId, input.keepTokenHash, input.now.toISOString()],
  );
  return result.rows.length;
}
