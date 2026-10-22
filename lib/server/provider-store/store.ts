/**
 * Reads and writes the provider settings tables for the admin API. Every write checks the version
 * the caller last saw (a stale form is refused, not merged over), is encrypted before it reaches
 * the database, and writes one audit row in the same statement. The audit row names the fields
 * that changed, never their values.
 *
 * Callers refresh the in-memory snapshot after a write (`refreshProviderSnapshot`).
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

import { isCredentialComplete } from './build-config';
import { keyHint, loadKeyRing, seal } from './crypto';
import {
  CREDENTIAL_COLUMNS,
  decodeCredentialRow,
  ringOrUndefined,
  type CredentialDbRow,
} from './snapshot';
import {
  SECRET_FIELDS,
  type CredentialRecord,
  type ProviderSection,
  type ProviderSecret,
} from './types';

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';

  constructor() {
    super('This setting was changed by someone else. Reload and try again.');
    this.name = 'VersionConflictError';
  }
}

export class SecretUnreadableError extends Error {
  readonly code = 'SECRET_UNREADABLE';

  constructor() {
    super(
      'The stored key cannot be read with the current PROVIDER_SECRET_KEY. Enter a new key, restore the previous master key, or remove the provider.',
    );
    this.name = 'SecretUnreadableError';
  }
}

export class MasterKeyMissingError extends Error {
  readonly code = 'MASTER_KEY_MISSING';

  constructor() {
    super('PROVIDER_SECRET_KEY is not set on the server, so secrets cannot be stored.');
    this.name = 'MasterKeyMissingError';
  }
}

/** What an administrator sees of a stored row: never the secret itself. */
export interface CredentialView {
  section: ProviderSection;
  providerId: string;
  enabled: boolean;
  baseUrl?: string;
  models?: string[];
  /** Which secret fields are set. */
  has: Record<(typeof SECRET_FIELDS)[number], boolean>;
  /** The last four characters of the key, when it is long enough to show them. */
  keyHint?: string;
  /** False when the secret is stored but this server cannot decrypt it. */
  readable: boolean;
  /** Whether the row has what its provider needs to be served (a draft or a switch-off is not). */
  complete: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

function toView(
  record: CredentialRecord,
  readable: boolean,
  storedSecret: boolean,
): CredentialView {
  return {
    section: record.section,
    providerId: record.providerId,
    enabled: record.enabled,
    baseUrl: record.baseUrl,
    models: record.models,
    // An unreadable secret is still "set": say so, so the form does not offer an empty key box.
    has: Object.fromEntries(
      SECRET_FIELDS.map((field) => [field, readable ? !!record.secret[field] : storedSecret]),
    ) as CredentialView['has'],
    keyHint: record.keyHint,
    readable,
    complete: readable && isCredentialComplete(record),
    version: record.version,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
  };
}

export async function listCredentialViews(db: AccountQueryable): Promise<CredentialView[]> {
  const ring = ringOrUndefined();
  const result = await db.query(
    `SELECT ${CREDENTIAL_COLUMNS} FROM provider_credentials ORDER BY section, provider_id`,
  );
  const views: CredentialView[] = [];
  for (const row of result.rows as CredentialDbRow[]) {
    const decoded = decodeCredentialRow(row, ring);
    if (decoded) views.push(toView(decoded.record, decoded.readable, row.secret_enc !== null));
  }
  return views;
}

export interface CredentialSave {
  section: ProviderSection;
  providerId: string;
  /** Left out: keep the stored value. */
  enabled?: boolean;
  /** Left out: keep. `null` or empty: clear. */
  baseUrl?: string | null;
  models?: string[] | null;
  /** Per field: left out keeps the stored value, `null` or empty clears it, text sets it. */
  secret?: { [K in keyof ProviderSecret]?: string | null };
  /** The version the caller last saw. `0` for a row that does not exist yet. */
  expectedVersion: number;
  actorId: string;
  now: Date;
}

function applyField(
  current: string | undefined,
  next: string | null | undefined,
): string | undefined {
  if (next === undefined) return current;
  const text = next === null ? '' : next.trim();
  return text === '' ? undefined : text;
}

/** Saves one provider row. Throws `VersionConflictError` for a stale `expectedVersion`. */
export async function saveCredential(
  db: AccountQueryable,
  input: CredentialSave,
): Promise<{ version: number }> {
  const result = await db.query(
    `SELECT ${CREDENTIAL_COLUMNS} FROM provider_credentials WHERE section = $1::text AND provider_id = $2::text`,
    [input.section, input.providerId],
  );
  const row = result.rows[0] as CredentialDbRow | undefined;
  const existing = row ? decodeCredentialRow(row, ringOrUndefined()) : undefined;
  if ((existing?.record.version ?? 0) !== input.expectedVersion) throw new VersionConflictError();

  const before = existing?.record;
  const secret: ProviderSecret = {};
  for (const field of SECRET_FIELDS) {
    const value = applyField(before?.secret[field], input.secret?.[field]);
    if (value !== undefined) secret[field] = value;
  }
  const enabled = input.enabled ?? before?.enabled ?? true;
  const baseUrl = applyField(before?.baseUrl, input.baseUrl);
  const models =
    input.models === undefined
      ? before?.models
      : (input.models?.map((model) => model.trim()).filter(Boolean) ?? []);

  const hasSecret = SECRET_FIELDS.some((field) => secret[field] !== undefined);
  // A stored secret that does not decrypt must not be overwritten by a partial edit (one that
  // leaves the key alone, or sets only a proxy): a restored master key could still open it.
  // Replacing it needs a new primary credential, and removing it is a delete.
  if (
    existing &&
    !existing.readable &&
    row?.secret_enc &&
    !secret.apiKey &&
    !(secret.accessKeyId && secret.accessKeySecret)
  ) {
    throw new SecretUnreadableError();
  }
  let sealed: { enc: Buffer; keyId: number } | undefined;
  if (hasSecret) {
    const ring = loadKeyRing();
    if (!ring) throw new MasterKeyMissingError();
    sealed = seal(secret, `${input.section}/${input.providerId}`, ring);
  }

  const changed = [
    ...SECRET_FIELDS.filter((field) => secret[field] !== before?.secret[field]),
    ...(baseUrl !== before?.baseUrl ? ['baseUrl'] : []),
    ...(JSON.stringify(models ?? null) !== JSON.stringify(before?.models ?? null)
      ? ['models']
      : []),
    ...(enabled !== (before?.enabled ?? true) ? ['enabled'] : []),
  ];

  // Compare-and-set in one statement. Version 0 means "create" and only inserts; a higher version
  // only updates the row at that version. A row deleted or changed since the form was loaded
  // matches neither branch, so the save is refused instead of recreating or overwriting it.
  const saved = await db.query(
    `WITH updated AS (
       UPDATE provider_credentials SET
         enabled = $3::boolean, base_url = $4::text, models = $5::text[], secret_enc = $6::bytea,
         key_id = $7::smallint, key_hint = $8::text, version = version + 1,
         updated_by = $9::text, updated_at = $10::timestamptz
       WHERE section = $1::text AND provider_id = $2::text
         AND $11::integer > 0 AND version = $11::integer
       RETURNING section, provider_id, version
     ),
     inserted AS (
       INSERT INTO provider_credentials
         (section, provider_id, enabled, base_url, models, secret_enc, key_id, key_hint, version, updated_by, updated_at)
       SELECT $1::text, $2::text, $3::boolean, $4::text, $5::text[], $6::bytea, $7::smallint, $8::text, 1, $9::text, $10::timestamptz
       WHERE $11::integer = 0
       ON CONFLICT (section, provider_id) DO NOTHING
       RETURNING section, provider_id, version
     ),
     saved AS (SELECT * FROM updated UNION ALL SELECT * FROM inserted),
     audited AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $9::text, section || '/' || provider_id, 'provider:set', $12::text, $10::timestamptz FROM saved
     )
     SELECT version FROM saved`,
    [
      input.section,
      input.providerId,
      enabled,
      baseUrl ?? null,
      models && models.length > 0 ? models : null,
      sealed?.enc ?? null,
      sealed?.keyId ?? 1,
      sealed ? (keyHint(secret) ?? null) : null,
      input.actorId,
      input.now.toISOString(),
      input.expectedVersion,
      changed.join(',') || 'unchanged',
    ],
  );
  const version = (saved.rows[0] as { version: number } | undefined)?.version;
  if (version === undefined) throw new VersionConflictError();
  return { version };
}

/** Removes one provider row. Returns false when there was none (or the version was stale). */
export async function deleteCredential(
  db: AccountQueryable,
  input: {
    section: ProviderSection;
    providerId: string;
    expectedVersion?: number;
    actorId: string;
    now: Date;
  },
): Promise<boolean> {
  const result = await db.query(
    `WITH removed AS (
       DELETE FROM provider_credentials
       WHERE section = $1::text AND provider_id = $2::text
         AND ($3::integer IS NULL OR version = $3::integer)
       RETURNING section, provider_id
     ),
     audited AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $4::text, section || '/' || provider_id, 'provider:delete', NULL, $5::timestamptz FROM removed
     )
     SELECT 1 AS removed FROM removed`,
    [
      input.section,
      input.providerId,
      input.expectedVersion ?? null,
      input.actorId,
      input.now.toISOString(),
    ],
  );
  return result.rows.length > 0;
}

export interface RoutingView {
  stage: string;
  value: unknown;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export async function listRouting(db: AccountQueryable): Promise<RoutingView[]> {
  const result = await db.query(
    'SELECT stage, value, version, updated_by, updated_at FROM model_routing ORDER BY stage',
  );
  return (
    result.rows as {
      stage: string;
      value: unknown;
      version: number;
      updated_by: string;
      updated_at: Date | string;
    }[]
  ).map((row) => ({
    stage: row.stage,
    value: row.value,
    version: row.version,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }));
}

/** Sets the model for one stage (or the default). Throws `VersionConflictError` for a stale version. */
export async function saveRouting(
  db: AccountQueryable,
  input: { stage: string; value: unknown; expectedVersion: number; actorId: string; now: Date },
): Promise<{ version: number }> {
  const saved = await db.query(
    `WITH updated AS (
       UPDATE model_routing SET value = $2::jsonb, version = version + 1, updated_by = $3::text, updated_at = $4::timestamptz
       WHERE stage = $1::text AND $5::integer > 0 AND version = $5::integer
       RETURNING stage, version
     ),
     inserted AS (
       INSERT INTO model_routing (stage, value, version, updated_by, updated_at)
       SELECT $1::text, $2::jsonb, 1, $3::text, $4::timestamptz
       WHERE $5::integer = 0
       ON CONFLICT (stage) DO NOTHING
       RETURNING stage, version
     ),
     saved AS (SELECT * FROM updated UNION ALL SELECT * FROM inserted),
     audited AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $3::text, 'routing/' || stage, 'provider:route', NULL, $4::timestamptz FROM saved
     )
     SELECT version FROM saved`,
    [
      input.stage,
      JSON.stringify(input.value),
      input.actorId,
      input.now.toISOString(),
      input.expectedVersion,
    ],
  );
  const version = (saved.rows[0] as { version: number } | undefined)?.version;
  if (version === undefined) throw new VersionConflictError();
  return { version };
}

export async function deleteRouting(
  db: AccountQueryable,
  input: { stage: string; expectedVersion?: number; actorId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH removed AS (
       DELETE FROM model_routing
       WHERE stage = $1::text AND ($4::integer IS NULL OR version = $4::integer)
       RETURNING stage
     ),
     audited AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, 'routing/' || stage, 'provider:route-delete', NULL, $3::timestamptz FROM removed
     )
     SELECT 1 AS removed FROM removed`,
    [input.stage, input.actorId, input.now.toISOString(), input.expectedVersion ?? null],
  );
  return result.rows.length > 0;
}
