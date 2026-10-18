import { apiError, apiSuccess } from '@/lib/server/api-response';
import { trustedClientKey, withClientBudget } from '@/lib/server/accounts/client-budget';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  readJsonObject,
  runAccountRoute,
} from '@/lib/server/accounts/http';
import { hashPassword, verifyPassword } from '@/lib/server/accounts/password';
import { updatePassword } from '@/lib/server/accounts/password-change';
import {
  accountServiceDeps,
  accountsEnabled,
  resolveRequestAccount,
} from '@/lib/server/accounts/runtime';
import { AccountError } from '@/lib/server/accounts/service';
import { hashSessionToken, readSessionCookie } from '@/lib/server/accounts/session';
import { findAccountByUsername } from '@/lib/server/accounts/store';
import { isAcceptablePassword } from '@/lib/server/accounts/validation';

export const runtime = 'nodejs';

/**
 * Changes the signed-in account's password. Body: { currentPassword, newPassword }. A wrong
 * current password counts against the same throttles as a failed sign-in, so this is not a way
 * around them. Every other session of the account is signed out; this one stays.
 */
export async function POST(request: Request): Promise<Response> {
  const clientKey = trustedClientKey(request.headers);
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();

    const account = await resolveRequestAccount(request.headers);
    const token = readSessionCookie(request.headers);
    if (!account || !token) return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');

    const body = await readJsonObject(request);
    if (!body.ok) return body.response;
    const { currentPassword, newPassword } = body.body;
    if (!isAcceptablePassword(newPassword)) {
      return apiError('PASSWORD_INVALID', 400, 'The new password does not meet the rules.');
    }

    const deps = await accountServiceDeps();
    await withClientBudget(clientKey, 'INVALID_CREDENTIALS', async () => {
      const wrong = () => new AccountError('INVALID_CREDENTIALS', 'The current password is wrong.');
      const retryAfter = deps.throttle.retryAfterSeconds(account.username);
      if (retryAfter !== undefined) {
        throw new AccountError(
          'RATE_LIMITED',
          'Too many failed attempts. Try again later.',
          retryAfter,
        );
      }
      const failure = deps.throttle.recordFailure(account.username);
      if (failure === undefined) {
        throw new AccountError(
          'RATE_LIMITED',
          'Too many failed attempts. Try again later.',
          deps.throttle.retryAfterSeconds(account.username),
        );
      }
      const record = await findAccountByUsername(deps.db, account.username);
      if (
        !record ||
        !isAcceptablePassword(currentPassword) ||
        !(await verifyPassword(currentPassword, record.passwordHash))
      ) {
        throw wrong();
      }
      deps.throttle.reset(account.username);
    });

    await updatePassword(deps.db, {
      accountId: account.accountId,
      passwordHash: await hashPassword(newPassword),
      keepTokenHash: hashSessionToken(token),
      now: new Date(),
    });
    return apiSuccess({ changed: true });
  });
}
