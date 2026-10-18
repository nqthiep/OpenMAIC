/**
 * Schema for membership, access requests, course sharing, classes, reader rewards, badges, the
 * support inbox and the community questions. Created with
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

CREATE TABLE IF NOT EXISTS access_requests (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  note TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_from_staff BOOLEAN NOT NULL,
  learner_read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS support_threads_account_idx ON support_threads (account_id);

CREATE TABLE IF NOT EXISTS support_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES support_threads (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  from_staff BOOLEAN NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON support_messages (thread_id, id);

CREATE TABLE IF NOT EXISTS course_questions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  course_title TEXT NOT NULL,
  scene_id TEXT,
  scene_title TEXT,
  author_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  best_answer_id BIGINT,
  rewarded BOOLEAN NOT NULL DEFAULT false,
  answer_count INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_questions_course_idx ON course_questions (course_id, scene_id);
CREATE INDEX IF NOT EXISTS course_questions_activity_idx ON course_questions (last_activity_at DESC);

CREATE TABLE IF NOT EXISTS course_answers (
  id BIGSERIAL PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES course_questions (id) ON DELETE CASCADE,
  author_id TEXT REFERENCES accounts (id) ON DELETE CASCADE,
  from_ai BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  votes INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_answers_question_idx ON course_answers (question_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS course_answers_one_ai_idx ON course_answers (question_id) WHERE from_ai;

CREATE TABLE IF NOT EXISTS answer_votes (
  answer_id BIGINT NOT NULL REFERENCES course_answers (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  PRIMARY KEY (answer_id, account_id)
);

CREATE TABLE IF NOT EXISTS community_reports (
  id BIGSERIAL PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('question', 'answer')),
  target_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  UNIQUE (target_kind, target_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS community_bans (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  banned_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  reference_solution TEXT NOT NULL DEFAULT '',
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  voting_ends_at TIMESTAMPTZ NOT NULL,
  reward_1 BIGINT NOT NULL DEFAULT 0 CHECK (reward_1 >= 0),
  reward_2 BIGINT NOT NULL DEFAULT 0 CHECK (reward_2 >= 0),
  reward_3 BIGINT NOT NULL DEFAULT 0 CHECK (reward_3 >= 0),
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  CHECK (opens_at < closes_at AND closes_at <= voting_ends_at)
);

CREATE TABLE IF NOT EXISTS challenge_entries (
  id BIGSERIAL PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  ai_score INT CHECK (ai_score BETWEEN 0 AND 10),
  ai_feedback TEXT,
  votes INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false,
  rank INT,
  reward BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, account_id)
);

CREATE TABLE IF NOT EXISTS entry_votes (
  entry_id BIGINT NOT NULL REFERENCES challenge_entries (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, account_id)
);

CREATE TABLE IF NOT EXISTS course_snapshots (
  course_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_remixes (
  course_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_owner_id TEXT,
  remixer_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_remixes_source_idx ON course_remixes (source_id);
CREATE INDEX IF NOT EXISTS course_remixes_remixer_idx ON course_remixes (remixer_id, created_at);

CREATE TABLE IF NOT EXISTS render_jobs (
  job_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The last refused share request of a course, so its owner learns it was refused and why.
-- Cleared when the owner asks again.
CREATE TABLE IF NOT EXISTS course_share_rejections (
  course_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  rejected_at TIMESTAMPTZ NOT NULL
);

-- Why the last access request was refused, shown to the learner. NULL after approval or a new request.
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS decision_reason TEXT;
`;

export async function ensureLearningSchema(queryable: AccountQueryable): Promise<void> {
  for (const sql of LEARNING_SCHEMA.split(';')) {
    const statement = sql.trim();
    if (statement !== '') await queryable.query(statement);
  }
}
