import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  runAccountRoute,
} from '@/lib/server/accounts/http';
import {
  accountServiceDeps,
  accountsEnabled,
  resolveRequestAccount,
} from '@/lib/server/accounts/runtime';
import { hashSessionToken, readSessionCookie } from '@/lib/server/accounts/session';
import { revokeOtherSessions } from '@/lib/server/accounts/store';

export const runtime = 'nodejs';

/**
 * Signs out every other session of the signed-in account. The session that makes the
 * request stays signed in. Answers the number of sessions revoked.
 */
export async function POST(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();

    const account = await resolveRequestAccount(request.headers);
    const token = readSessionCookie(request.headers);
    if (!account || !token) return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');

    const deps = await accountServiceDeps();
    const revoked = await revokeOtherSessions(deps.db, {
      accountId: account.accountId,
      keepTokenHash: hashSessionToken(token),
      now: new Date(),
    });
    return apiSuccess({ revoked });
  });
}
