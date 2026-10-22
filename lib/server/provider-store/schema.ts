/**
 * Schema for the AI provider settings. Created with IF NOT EXISTS from `ensureLearningSchema`, so
 * it runs on every pool start. Statements are split on semicolons: keep them out of comments.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

export const PROVIDER_SCHEMA = `
CREATE TABLE IF NOT EXISTS provider_credentials (
  section TEXT NOT NULL CHECK (section IN ('providers', 'tts', 'asr', 'pdf', 'image', 'video', 'webSearch')),
  provider_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  base_url TEXT,
  models TEXT[],
  secret_enc BYTEA,
  key_id SMALLINT NOT NULL DEFAULT 1,
  key_hint TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section, provider_id)
);

CREATE TABLE IF NOT EXISTS model_routing (
  stage TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function ensureProviderSchema(queryable: AccountQueryable): Promise<void> {
  for (const sql of PROVIDER_SCHEMA.split(';')) {
    const statement = sql.trim();
    if (statement !== '') await queryable.query(statement);
  }
}
