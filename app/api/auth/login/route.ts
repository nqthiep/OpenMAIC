import { apiSuccess } from '@/lib/server/api-response';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  readJsonObject,
  runAccountRoute,
} from '@/lib/server/accounts/http';
import { withClientBudget, trustedClientKey } from '@/lib/server/accounts/client-budget';
import { accountServiceDeps, accountsEnabled } from '@/lib/server/accounts/runtime';
import { loginAccount } from '@/lib/server/accounts/service';
import { sessionCookieHeader } from '@/lib/server/accounts/session';

export const runtime = 'nodejs';

/** Signs in with a username and password, issuing a fresh session token. */
export async function POST(request: Request): Promise<Response> {
  const clientKey = trustedClientKey(request.headers);
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();

    const body = await readJsonObject(request);
    if (!body.ok) return body.response;

    const session = await withClientBudget(clientKey, 'INVALID_CREDENTIALS', async () =>
      loginAccount(await accountServiceDeps(), {
        username: body.body.username,
        password: body.body.password,
      }),
    );
    const response = apiSuccess({ account: { username: session.username } });
    response.headers.append('Set-Cookie', sessionCookieHeader(session.token));
    return response;
  });
}
