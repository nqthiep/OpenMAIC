import type { MigrationQueryable, SchemaMigrationSet } from '@openmaic/storage/pg-migrations';

/**
 * The accounts tables. Sessions are keyed by the SHA-256 of the token, never the
 * token. Attempts back the throttle (`./throttle.ts`). Every admin-affecting
 * change writes `accounts_audit_log` in the same transaction.
 */
export const ACCOUNTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts_users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_login_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS accounts_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES accounts_users (id),
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS accounts_sessions_user_idx ON accounts_sessions (user_id);

CREATE TABLE IF NOT EXISTS accounts_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  success BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS accounts_login_attempts_scope_idx ON accounts_login_attempts (scope, at);

CREATE TABLE IF NOT EXISTS accounts_audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  target_id UUID,
  detail JSONB
);

CREATE INDEX IF NOT EXISTS accounts_audit_log_at_idx ON accounts_audit_log (at, id);
`;

export const ACCOUNTS_MIGRATIONS: SchemaMigrationSet = {
  store: 'accounts',
  migrations: [{ version: 1, name: 'baseline', up: ACCOUNTS_SCHEMA }],
};

export async function ensureAccountsSchema(queryable: MigrationQueryable): Promise<number[]> {
  // A dynamic import: scripts run by tsx load this package's subpath through
  // import(), since a CommonJS require cannot resolve it.
  const { applySchemaMigrations } = await import('@openmaic/storage/pg-migrations');
  return applySchemaMigrations(queryable, ACCOUNTS_MIGRATIONS);
}
