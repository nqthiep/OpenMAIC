/**
 * Role checks for the account routes. The role is the effective role of the signed-in
 * session (see authz/roles.ts): an environment administrator is always `admin`.
 * A request without a live session gets 401. A signed-in account without the role gets 403.
 */
import type { PersistencePoolFactory } from '@/lib/persistence/server-provider';
import { apiError, type ApiErrorCode } from '@/lib/server/api-response';
import { type AccountRole } from '@/lib/server/authz/roles';

import { resolveRequestAccount } from './runtime';
import type { SessionAccount } from './store';

export { administratorUsernames } from '@/lib/server/authz/roles';

async function requireRole(
  headers: Headers,
  allowed: readonly AccountRole[],
  refusal: { code: ApiErrorCode; message: string },
  poolFactory?: PersistencePoolFactory,
): Promise<SessionAccount | Response> {
  const account = await resolveRequestAccount(headers, poolFactory);
  if (!account) return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
  if (!allowed.includes(account.role)) return apiError(refusal.code, 403, refusal.message);
  return account;
}

/** The signed-in administrator, or the refusal to send instead. */
export function requireAdministrator(
  headers: Headers,
  poolFactory?: PersistencePoolFactory,
): Promise<SessionAccount | Response> {
  return requireRole(
    headers,
    ['admin'],
    { code: 'ADMIN_ONLY', message: 'Administrators only.' },
    poolFactory,
  );
}

/** The signed-in operator or administrator, or the refusal to send instead. */
export function requireStaff(
  headers: Headers,
  poolFactory?: PersistencePoolFactory,
): Promise<SessionAccount | Response> {
  return requireRole(
    headers,
    ['operator', 'admin'],
    { code: 'STAFF_ONLY', message: 'Operators and administrators only.' },
    poolFactory,
  );
}
