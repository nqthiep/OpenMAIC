/**
 * Administrators. An administrator is a signed-in account whose username is listed
 * in ADMIN_USERNAMES (comma-separated). Nothing else grants the role, and an unset
 * or empty list means there are no administrators, so every admin route refuses.
 */
import type { PersistencePoolFactory } from '@/lib/persistence/server-provider';
import { apiError } from '@/lib/server/api-response';

import { resolveRequestAccount } from './runtime';
import type { SessionAccount } from './store';
import { normalizeUsername } from './validation';

export function administratorUsernames(): ReadonlySet<string> {
  const names = (process.env.ADMIN_USERNAMES ?? '').split(',');
  const normalized = names
    .map((name) => normalizeUsername(name))
    .filter((name): name is string => name !== undefined);
  return new Set(normalized);
}

/**
 * The signed-in administrator for these headers, or the refusal to send instead:
 * 401 without a live session, 403 for a signed-in account that is not listed.
 * Callers check that accounts are enabled first.
 */
export async function requireAdministrator(
  headers: Headers,
  poolFactory?: PersistencePoolFactory,
): Promise<SessionAccount | Response> {
  const account = await resolveRequestAccount(headers, poolFactory);
  if (!account) return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
  if (!administratorUsernames().has(account.username)) {
    return apiError('ADMIN_ONLY', 403, 'Administrators only.');
  }
  return account;
}
