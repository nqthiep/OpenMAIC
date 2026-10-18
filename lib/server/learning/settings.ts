/**
 * Deployment settings staff change at runtime, without a restart. Each setting is either one of a
 * fixed set of values or a whole number in a range, has a default, and names who may change it:
 * only administrators, or any staff. A stored value that is not valid reads as the default. Every
 * change is written to the audit table in the same statement.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { can, type Viewer } from '@/lib/server/authz/policy';

type SettingSpec =
  | { kind: 'enum'; values: readonly string[]; default: string; changedBy: 'admin' | 'staff' }
  | { kind: 'int'; min: number; max: number; default: number; changedBy: 'admin' | 'staff' };

export const APP_SETTINGS = {
  /** Who pays for the AI pre-grading of a challenge entry: the submitter's quota, or the system. */
  'challenge.aiGradingPaidBy': {
    kind: 'enum',
    values: ['submitter', 'system'],
    default: 'submitter',
    changedBy: 'admin',
  },
  /** Share of a reader reward that also goes to the author of the course a remix came from. */
  'remix.royaltyPercent': { kind: 'int', min: 0, max: 100, default: 25, changedBy: 'staff' },
  /** Remixes one member may create per day. */
  'remix.dailyLimit': { kind: 'int', min: 0, max: 100, default: 5, changedBy: 'staff' },
} as const satisfies Record<string, SettingSpec>;

export type AppSettingKey = keyof typeof APP_SETTINGS;
type ValueOf<S> = S extends { kind: 'int' }
  ? number
  : S extends { values: readonly (infer V)[] }
    ? V
    : never;
export type AppSettingValue<K extends AppSettingKey> = ValueOf<(typeof APP_SETTINGS)[K]>;

export function isAppSettingKey(key: unknown): key is AppSettingKey {
  return typeof key === 'string' && Object.hasOwn(APP_SETTINGS, key);
}

/** The value as the setting's type, or undefined when it is not allowed. Accepts stored text too. */
export function parseSettingValue<K extends AppSettingKey>(
  key: K,
  value: unknown,
): AppSettingValue<K> | undefined {
  const spec: SettingSpec = APP_SETTINGS[key];
  if (spec.kind === 'enum') {
    return spec.values.includes(value as string) ? (value as AppSettingValue<K>) : undefined;
  }
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(number) &&
    (number as number) >= spec.min &&
    (number as number) <= spec.max
    ? (number as AppSettingValue<K>)
    : undefined;
}

/** Whether `viewer` may change `key`: administrators for admin settings, any staff otherwise. */
export function canChangeSetting(viewer: Viewer, key: AppSettingKey): boolean {
  return APP_SETTINGS[key].changedBy === 'admin'
    ? can(viewer, 'settings.manage')
    : can(viewer, 'community.moderate');
}

export async function readSetting<K extends AppSettingKey>(
  db: AccountQueryable,
  key: K,
): Promise<AppSettingValue<K>> {
  const result = await db.query(`SELECT value FROM app_settings WHERE key = $1::text`, [key]);
  const stored = (result.rows[0] as { value: string } | undefined)?.value;
  return parseSettingValue(key, stored) ?? (APP_SETTINGS[key].default as AppSettingValue<K>);
}

/** Every setting with its current value. */
export async function readAllSettings(
  db: AccountQueryable,
): Promise<Record<AppSettingKey, string | number>> {
  const entries = await Promise.all(
    (Object.keys(APP_SETTINGS) as AppSettingKey[]).map(
      async (key) => [key, await readSetting(db, key)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<AppSettingKey, string | number>;
}

export async function writeSetting<K extends AppSettingKey>(
  db: AccountQueryable,
  input: { key: K; value: AppSettingValue<K>; actorId: string; now: Date },
): Promise<void> {
  await db.query(
    `WITH saved AS (
       INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1::text, $2::text, $3::text, $4::timestamptz)
       ON CONFLICT (key) DO UPDATE SET value = $2::text, updated_by = $3::text, updated_at = $4::timestamptz
       RETURNING key
     )
     INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
     SELECT $3::text, key, 'settings:update', $2::text, $4::timestamptz FROM saved`,
    [input.key, String(input.value), input.actorId, input.now.toISOString()],
  );
}
