import { apiSuccess } from '@/lib/server/api-response';
import { runAccountRoute } from '@/lib/server/accounts/http';
import {
  accountsEnabled,
  membershipTrial,
  registrationOpen,
  resolveRequestAccount,
} from '@/lib/server/accounts/runtime';
import { accountOwnerId } from '@/lib/server/accounts/service';
import { capabilitiesFor, singleUserCapabilities } from '@/lib/server/authz/capabilities';
import { resolveViewer } from '@/lib/server/authz/viewer';

export const runtime = 'nodejs';

/**
 * Reports whether accounts are available, who (if anyone) is signed in, and what that visitor may
 * do. `capabilities` is the one list the interface reads for gating. `learnerKey`, `role`,
 * `administrator` and `membership` are returned only to the account's own session.
 */
export async function GET(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) {
      return apiSuccess({
        enabled: false,
        registrationOpen: false,
        authenticated: false,
        capabilities: singleUserCapabilities(),
      });
    }
    const viewer = await resolveViewer(request.headers);
    const account = await resolveRequestAccount(request.headers);
    return apiSuccess({
      enabled: true,
      registrationOpen: registrationOpen(),
      // Days of free membership a new account gets; 0 when none. The sign-up text reads it.
      trialDays: membershipTrial()?.days ?? 0,
      authenticated: Boolean(account),
      capabilities: capabilitiesFor(viewer),
      ...(account
        ? {
            account: { username: account.username },
            learnerKey: accountOwnerId(account.accountId),
            role: account.role,
            administrator: account.role === 'admin',
            membership: viewer.membership ?? null,
          }
        : {}),
    });
  });
}
