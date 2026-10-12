/**
 * Account roles. The stored value lives in `accounts.role`. The effective role for a
 * request also honours ADMIN_USERNAMES, which always grants `admin`, so the
 * environment is the floor: an account listed there cannot be demoted from the UI.
 */
import { normalizeUsername } from '@/lib/server/accounts/validation';

export const ACCOUNT_ROLES = ['learner', 'operator', 'admin'] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

/** Usernames listed in ADMIN_USERNAMES (comma-separated). An unset list means no environment admins. */
export function administratorUsernames(): ReadonlySet<string> {
  const names = (process.env.ADMIN_USERNAMES ?? '').split(',');
  const normalized = names
    .map((name) => normalizeUsername(name))
    .filter((name): name is string => name !== undefined);
  return new Set(normalized);
}

/** The role a request acts with: `admin` for an environment administrator, otherwise the stored role. */
export function effectiveRole(username: string, stored: AccountRole): AccountRole {
  return administratorUsernames().has(username) ? 'admin' : stored;
}
