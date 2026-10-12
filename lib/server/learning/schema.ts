/**
 * Schema for membership, course sharing, classes, reader rewards and badges. Created with
 * IF NOT EXISTS like the account schema, so it runs on every pool start and is safe to repeat.
 * Owner keys follow the usage log: `acct:<id>` or `anon:<uuid>`. Memberships are keyed by
 * account id, because only a signed-in account can hold one.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

export const LEARNING_SCHEMA = `
CREATE TABLE IF NOT EXISTS memberships (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  expires_at TIMESTAMPTZ NOT NULL,
  monthly_token_quota BIGINT NOT NULL CHECK (monthly_token_quota >= 0),
  granted_by TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_shares (
  course_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'shared')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS course_previews (
  course_id TEXT PRIMARY KEY,
  marked_by TEXT NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  join_code_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_members (
  class_id TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, account_id)
);

CREATE TABLE IF NOT EXISTS class_courses (
  class_id TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  attached_by TEXT NOT NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, course_id)
);

CREATE INDEX IF NOT EXISTS class_courses_course_idx ON class_courses (course_id);

CREATE TABLE IF NOT EXISTS course_reads (
  course_id TEXT NOT NULL,
  reader_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  first_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, reader_id)
);

CREATE INDEX IF NOT EXISTS course_reads_author_idx ON course_reads (author_id);

CREATE TABLE IF NOT EXISTS quota_bonus (
  owner_id TEXT NOT NULL,
  month TEXT NOT NULL,
  tokens BIGINT NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  PRIMARY KEY (owner_id, month)
);

CREATE TABLE IF NOT EXISTS badges (
  owner_id TEXT NOT NULL,
  badge_code TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, badge_code)
);
`;

export async function ensureLearningSchema(queryable: AccountQueryable): Promise<void> {
  for (const sql of LEARNING_SCHEMA.split(';')) {
    const statement = sql.trim();
    if (statement !== '') await queryable.query(statement);
  }
}
