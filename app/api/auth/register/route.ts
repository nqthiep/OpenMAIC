import { apiSuccess } from '@/lib/server/api-response';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  readJsonObject,
  runAccountRoute,
} from '@/lib/server/accounts/http';
import { accountServiceDeps, accountsEnabled } from '@/lib/server/accounts/runtime';
import { registerAccount } from '@/lib/server/accounts/service';
import { sessionCookieHeader } from '@/lib/server/accounts/session';

export const runtime = 'nodejs';

/** Creates an account and signs the new account in. */
export async function POST(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();

    const body = await readJsonObject(request);
    if (!body.ok) return body.response;

    const session = await registerAccount(await accountServiceDeps(), {
      username: body.body.username,
      password: body.body.password,
    });
    const response = apiSuccess({ account: { username: session.username } }, 201);
    response.headers.append('Set-Cookie', sessionCookieHeader(session.token));
    return response;
  });
}
