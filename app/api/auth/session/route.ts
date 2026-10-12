import { apiSuccess } from '@/lib/server/api-response';
import { runAccountRoute } from '@/lib/server/accounts/http';
import {
  accountServiceDeps,
  accountsEnabled,
  registrationOpen,
  resolveRequestAccount,
} from '@/lib/server/accounts/runtime';
import { accountOwnerId } from '@/lib/server/accounts/service';
import { readMembership } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/**
 * Reports whether accounts are available and who, if anyone, is signed in.
 * `learnerKey` is the account's partition key. `role` is the effective role, and
 * `administrator` is kept for the admin panel. All are returned only to the account's own session.
 */
export async function GET(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) {
      return apiSuccess({ enabled: false, registrationOpen: false, authenticated: false });
    }
    const account = await resolveRequestAccount(request.headers);
    const membership = account
      ? await readMembership((await accountServiceDeps()).db, account.accountId, new Date())
      : undefined;
    return apiSuccess({
      enabled: true,
      registrationOpen: registrationOpen(),
      authenticated: Boolean(account),
      ...(account
        ? {
            account: { username: account.username },
            learnerKey: accountOwnerId(account.accountId),
            role: account.role,
            administrator: account.role === 'admin',
            membership: membership ?? null,
          }
        : {}),
    });
  });
}
