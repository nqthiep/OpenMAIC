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
import { registerAccount } from '@/lib/server/accounts/service';
import { sessionCookieHeader } from '@/lib/server/accounts/session';

export const runtime = 'nodejs';

/** Creates an account and signs the new account in. */
export async function POST(request: Request): Promise<Response> {
  const clientKey = trustedClientKey(request.headers);
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();

    const body = await readJsonObject(request);
    if (!body.ok) return body.response;

    // Only a taken name is charged: it is the one failure a sign-up can repeat for free.
    const session = await withClientBudget(clientKey, 'USERNAME_TAKEN', async () =>
      registerAccount(await accountServiceDeps(), {
        username: body.body.username,
        password: body.body.password,
      }),
    );
    const response = apiSuccess({ account: { username: session.username } }, 201);
    response.headers.append('Set-Cookie', sessionCookieHeader(session.token));
    return response;
  });
}
