import { accountServiceDeps, accountsEnabled } from '@/lib/server/accounts/runtime';
import { omnirouteConfig } from '@/lib/server/omniroute/config';
import { isActiveAdminSessionCached, refusal } from '@/lib/server/omniroute/gate';
import { readGateCookie, verifyToken } from '@/lib/server/omniroute/token';

export const runtime = 'nodejs';

/**
 * The gate's question, asked by Caddy (`forward_auth`) before every request to the dashboard: 204
 * lets it through, anything else is shown to the browser as it is. The answer depends on the gate
 * cookie only, and on the OpenMAIC session it was opened from still being live for an account that
 * is still an administrator. Any failure refuses.
 */
export async function GET(request: Request): Promise<Response> {
  const config = omnirouteConfig();
  if (!config || !accountsEnabled()) return refusal(404, 'OmniRoute is not set up on this server.');
  const claim = verifyToken('gate', readGateCookie(request.headers) ?? '', config.gateSecret);
  if (!claim) {
    return refusal(
      401,
      'Sign in to OpenMAIC as an administrator, then open OmniRoute from Settings.',
    );
  }
  try {
    const { db } = await accountServiceDeps();
    if (!(await isActiveAdminSessionCached(db, claim.accountId, claim.sessionKey))) {
      return refusal(403, 'Administrators only.');
    }
  } catch (error) {
    console.error(
      '[omniroute] account check failed:',
      error instanceof Error ? error.message : error,
    );
    return refusal(503, 'Try again in a moment.');
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
