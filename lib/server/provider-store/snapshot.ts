/**
 * The in-memory copy of the provider settings that every synchronous provider lookup reads.
 *
 * It is loaded from the database (see `refreshProviderSnapshot`) and kept on `globalThis`, because
 * the instrumentation hook, route handlers and dev-mode reloads may not share module instances
 * (the login throttle does the same). Reads never touch the database.
 *
 * Two rules decide what a read returns:
 *  - No database configured: there are no managed providers, so the snapshot is empty and a
 *    visitor's or administrator's own key is used, as in the upstream project.
 *  - A database is configured but nothing is loaded yet: reading throws `ProviderConfigNotReady`.
 *    An empty config here would turn every managed provider into an unmanaged one, so it fails
 *    closed and the routes answer 503 with a retry hint.
 */
import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { createLogger } from '@/lib/logger';
import { registerLogSecret } from '@/lib/log-secrets';
import type { AccountQueryable } from '@/lib/server/accounts/store';

import { buildSnapshot, type RoutingRow } from './build-config';
import { loadKeyRing, open, ProviderKeyError, type KeyRing } from './crypto';
import {
  emptySnapshot,
  isProviderSection,
  SECRET_FIELDS,
  type CredentialRecord,
  type ProviderSnapshot,
} from './types';

const log = createLogger('ProviderSnapshot');

/** Seconds a client is told to wait before asking again. */
export const PROVIDER_CONFIG_RETRY_AFTER_SECONDS = 5;

export class ProviderConfigNotReady extends Error {
  readonly code = 'PROVIDER_CONFIG_NOT_READY';
  readonly httpStatus = 503;
  readonly retryAfterSeconds = PROVIDER_CONFIG_RETRY_AFTER_SECONDS;

  constructor() {
    super('The AI provider settings are not loaded yet. Try again in a few seconds.');
    this.name = 'ProviderConfigNotReady';
  }
}

interface Slot {
  snapshot?: ProviderSnapshot;
  /** What the database looked like when `snapshot` was loaded; see `readFingerprint`. */
  fingerprint?: string;
  /** Loads started, and the newest start whose result is installed: an older load never overwrites a newer one. */
  started?: number;
  installed?: number;
}

const SLOT_KEY = Symbol.for('openmaic.providerSnapshot');
const globalState = globalThis as typeof globalThis & { [key: symbol]: Slot | undefined };
const slot: Slot = (globalState[SLOT_KEY] ??= {});

const EMPTY: ProviderSnapshot = Object.freeze(emptySnapshot()) as ProviderSnapshot;

/** The current snapshot. Throws `ProviderConfigNotReady` while a configured database is not loaded. */
export function currentSnapshot(): ProviderSnapshot {
  if (slot.snapshot) return slot.snapshot;
  if (!isServerPersistenceConfigured()) return EMPTY;
  throw new ProviderConfigNotReady();
}

export function isProviderSnapshotLoaded(): boolean {
  return slot.snapshot !== undefined;
}

/** Installs a snapshot directly. For tests. */
export function setProviderSnapshot(snapshot: ProviderSnapshot, fingerprint?: string): void {
  slot.snapshot = snapshot;
  slot.fingerprint = fingerprint;
  slot.installed = slot.started;
}

/** Forgets the loaded snapshot. For tests. */
export function resetProviderSnapshot(): void {
  slot.snapshot = undefined;
  slot.fingerprint = undefined;
  slot.installed = slot.started;
}

/** A cheap digest of both tables: it changes whenever a row is added, changed or removed. */
export async function readFingerprint(db: AccountQueryable): Promise<string> {
  const result = await db.query(
    `SELECT md5(
       COALESCE((SELECT string_agg(section || '/' || provider_id || ':' || version::text || ':' || updated_at::text, ',' ORDER BY section, provider_id) FROM provider_credentials), '')
       || '|' ||
       COALESCE((SELECT string_agg(stage || ':' || version::text || ':' || updated_at::text, ',' ORDER BY stage) FROM model_routing), '')
     ) AS fingerprint`,
  );
  return String((result.rows[0] as { fingerprint: string }).fingerprint);
}

export interface CredentialDbRow {
  section: string;
  provider_id: string;
  enabled: boolean;
  base_url: string | null;
  models: string[] | null;
  secret_enc: Uint8Array | null;
  key_id: number;
  key_hint: string | null;
  version: number;
  updated_by: string;
  updated_at: Date | string;
}

export const CREDENTIAL_COLUMNS =
  'section, provider_id, enabled, base_url, models, secret_enc, key_id, key_hint, version, updated_by, updated_at';

export function ringOrUndefined(): KeyRing | undefined {
  try {
    return loadKeyRing();
  } catch (error) {
    log.error(error instanceof Error ? error.message : 'PROVIDER_SECRET_KEY is not valid.');
    return undefined;
  }
}

/**
 * One stored row as a record, with its secret decrypted. `readable` is false when the secret is
 * there but does not decrypt (missing or wrong master key); the record then carries no secret.
 * Undefined for a row of an unknown section.
 */
export function decodeCredentialRow(
  row: CredentialDbRow,
  ring: KeyRing | undefined,
): { record: CredentialRecord; readable: boolean } | undefined {
  if (!isProviderSection(row.section)) return undefined;
  let secret: CredentialRecord['secret'] = {};
  let readable = true;
  if (row.secret_enc) {
    try {
      if (!ring) throw new ProviderKeyError('PROVIDER_SECRET_KEY is not set.');
      secret = open(
        Buffer.from(row.secret_enc),
        row.key_id,
        `${row.section}/${row.provider_id}`,
        ring,
      );
    } catch {
      readable = false;
    }
  }
  return {
    readable,
    record: {
      section: row.section,
      providerId: row.provider_id,
      enabled: row.enabled,
      baseUrl: row.base_url ?? undefined,
      models: row.models ?? undefined,
      secret,
      keyHint: row.key_hint ?? undefined,
      version: row.version,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    },
  };
}

/** Reads and decrypts every provider row. A row that does not decrypt is reported, never thrown. */
export async function readCredentialRecords(
  db: AccountQueryable,
  ring: KeyRing | undefined = ringOrUndefined(),
): Promise<{ records: CredentialRecord[]; unreadable: ProviderSnapshot['unreadable'] }> {
  const result = await db.query(
    `SELECT ${CREDENTIAL_COLUMNS} FROM provider_credentials ORDER BY section, provider_id`,
  );
  const records: CredentialRecord[] = [];
  const unreadable: ProviderSnapshot['unreadable'] = [];
  for (const row of result.rows as CredentialDbRow[]) {
    const decoded = decodeCredentialRow(row, ring);
    if (!decoded) continue;
    records.push(decoded.record);
    if (!decoded.readable) {
      unreadable.push({ section: decoded.record.section, providerId: decoded.record.providerId });
    }
  }
  return { records, unreadable };
}

async function readRoutingRows(db: AccountQueryable): Promise<RoutingRow[]> {
  const result = await db.query('SELECT stage, value FROM model_routing ORDER BY stage');
  return (result.rows as { stage: string; value: unknown }[]).map((row) => ({
    stage: row.stage,
    value: row.value,
  }));
}

/** Keeps every stored secret out of log lines. */
function registerSecrets(records: readonly CredentialRecord[]): void {
  for (const record of records) {
    for (const field of SECRET_FIELDS) registerLogSecret(record.secret[field], 'operator');
  }
}

/**
 * Loads both tables into a new snapshot and installs it. Throws when the database cannot be read,
 * and then leaves the previous snapshot in place.
 */
export async function refreshProviderSnapshot(db: AccountQueryable): Promise<ProviderSnapshot> {
  const ticket = (slot.started = (slot.started ?? 0) + 1);
  const fingerprint = await readFingerprint(db);
  const [{ records, unreadable }, routing] = await Promise.all([
    readCredentialRecords(db),
    readRoutingRows(db),
  ]);
  registerSecrets(records);
  const snapshot = buildSnapshot(records, routing, unreadable);
  if (unreadable.length > 0) {
    log.error(
      `${unreadable.length} stored provider secret(s) cannot be decrypted and are not served: ${unreadable
        .map((row) => `${row.section}/${row.providerId}`)
        .join(', ')}. Check PROVIDER_SECRET_KEY.`,
    );
  }
  // Two loads can overlap (a save and the timer); the one that started later wins, whichever ends last.
  if (ticket > (slot.installed ?? 0)) {
    slot.installed = ticket;
    slot.snapshot = snapshot;
    slot.fingerprint = fingerprint;
  }
  return snapshot;
}

/** Reloads only when the database changed since the last load. Returns whether it reloaded. */
export async function refreshProviderSnapshotIfChanged(db: AccountQueryable): Promise<boolean> {
  if (slot.snapshot && (await readFingerprint(db)) === slot.fingerprint) return false;
  await refreshProviderSnapshot(db);
  return true;
}
