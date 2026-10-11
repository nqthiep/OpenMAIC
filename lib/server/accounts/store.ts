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
