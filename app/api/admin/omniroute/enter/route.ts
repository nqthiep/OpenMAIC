import { accountServiceDeps, accountsEnabled } from '@/lib/server/accounts/runtime';
import { omnirouteConfig } from '@/lib/server/omniroute/config';
import { isActiveAdminSession, refusal, signInToOmniRoute } from '@/lib/server/omniroute/gate';
import {
  GATE_TTL_MS,
  gateCookieHeader,
  mintToken,
  redeemOnce,
  verifyToken,
} from '@/lib/server/omniroute/token';

export const runtime = 'nodejs';

/**
 * Reached by the browser, on the dashboard's own origin, through the gate's `/__enter` path. It
 * trades a one-time ticket from `open` for two cookies: the gate cookie that `check` will accept,
 * and OmniRoute's own `auth_token`, obtained here with the dashboard password so the administrator
 * signs in once. Nothing is set unless every step succeeds.
 */
export async function GET(request: Request): Promise<Response> {
  const config = omnirouteConfig();
  if (!config || !accountsEnabled()) return refusal(404, 'OmniRoute is not set up on this server.');
  const expired = 'This link has expired. Open OmniRoute again from the Settings popup.';

  const claim = verifyToken(
    'ticket',
    new URL(request.url).searchParams.get('t') ?? '',
    config.gateSecret,
  );
  if (!claim || !redeemOnce(claim.nonce, claim.expiresAt)) return refusal(403, expired);

  try {
    const { db } = await accountServiceDeps();
    if (!(await isActiveAdminSession(db, claim.accountId, claim.sessionKey))) {
      return refusal(403, 'Administrators only.');
    }
  } catch (error) {
    console.error(
      '[omniroute] account check failed:',
      error instanceof Error ? error.message : error,
    );
    return refusal(503, 'Try again in a moment.');
  }

  const omnirouteCookie = await signInToOmniRoute(config);
  if (!omnirouteCookie) {
    return refusal(502, 'OmniRoute did not accept the sign-in. See ops/omniroute/README.md.');
  }

  const gate = mintToken('gate', claim.accountId, claim.sessionKey, GATE_TTL_MS, config.gateSecret);
  const headers = new Headers({ location: `${config.publicUrl}/`, 'cache-control': 'no-store' });
  headers.append('set-cookie', gateCookieHeader(gate, config.publicUrl.startsWith('https:')));
  headers.append('set-cookie', omnirouteCookie);
  return new Response(null, { status: 302, headers });
}
