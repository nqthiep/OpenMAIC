import { apiSuccess } from '@/lib/server/api-response';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  runAccountRoute,
} from '@/lib/server/accounts/http';
import { accountServiceDeps, accountsEnabled } from '@/lib/server/accounts/runtime';
import { logoutAccount } from '@/lib/server/accounts/service';
import { clearSessionCookieHeader, readSessionCookie } from '@/lib/server/accounts/session';

export const runtime = 'nodejs';

/** Revokes the current session on the server and clears the cookie in the browser. */
export async function POST(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();

    await logoutAccount(await accountServiceDeps(), readSessionCookie(request.headers));
    const response = apiSuccess({});
    response.headers.append('Set-Cookie', clearSessionCookieHeader());
    return response;
  });
}
