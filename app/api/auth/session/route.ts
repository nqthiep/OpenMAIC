import { apiSuccess } from '@/lib/server/api-response';
import { administratorUsernames } from '@/lib/server/accounts/admin';
import { runAccountRoute } from '@/lib/server/accounts/http';
import {
  accountsEnabled,
  registrationOpen,
  resolveRequestAccount,
} from '@/lib/server/accounts/runtime';
import { accountOwnerId } from '@/lib/server/accounts/service';

export const runtime = 'nodejs';

/**
 * Reports whether accounts are available and who, if anyone, is signed in.
 * `learnerKey` is the account's partition key, and `administrator` says whether the admin
 * routes accept this account. Both are returned only to the account's own session.
 */
export async function GET(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) {
      return apiSuccess({ enabled: false, registrationOpen: false, authenticated: false });
    }
    const account = await resolveRequestAccount(request.headers);
    return apiSuccess({
      enabled: true,
      registrationOpen: registrationOpen(),
      authenticated: Boolean(account),
      ...(account
        ? {
            account: { username: account.username },
            learnerKey: accountOwnerId(account.accountId),
            administrator: administratorUsernames().has(account.username),
          }
        : {}),
    });
  });
}
