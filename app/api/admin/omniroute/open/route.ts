import { apiError, apiSuccess } from '@/lib/server/api-response';
import { hashSessionToken, readSessionCookie } from '@/lib/server/accounts/session';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { dashboardOrigin, omnirouteConfig } from '@/lib/server/omniroute/config';
import { allowedDeepLink } from '@/lib/server/omniroute/links';
import { mintToken, TICKET_TTL_MS } from '@/lib/server/omniroute/token';

export const runtime = 'nodejs';

/**
 * Hands an administrator the address of the OmniRoute dashboard with a one-time ticket in it.
 * The popup opens that address in a new tab; `enter` turns the ticket into the gate cookie. The
 * ticket names the current OpenMAIC session, so the gate lasts only as long as that session. A POST
 * from this site only, and an audit row names who asked.
 */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      // The body is optional: `{ path }` names one of OmniRoute's own pages to land on.
      let path: string | undefined;
      if (
        (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')
      ) {
        const body = await bodyOf(request, 1024);
        if (!body.ok) return body.response;
        if (body.body.path !== undefined) {
          path = allowedDeepLink(body.body.path);
          if (!path) return invalid('path is not a page this panel can open');
        }
      }
      const config = omnirouteConfig();
      if (!config) return apiError('NOT_FOUND', 404, 'OmniRoute is not set up on this server.');
      const origin = dashboardOrigin(config, request.headers.get('origin'));
      if (!origin) {
        return invalid('The address of this page is unknown; set OMNIROUTE_PUBLIC_URL.');
      }
      const accountId = ctx.viewer.accountId!;
      const sessionToken = readSessionCookie(request.headers);
      if (!sessionToken) return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
      const sessionKey = hashSessionToken(sessionToken).slice(0, 32);
      await ctx.db.query(
        `INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
         VALUES ($1::text, 'omniroute', 'omniroute:open', NULL, $2::timestamptz)`,
        [accountId, ctx.now.toISOString()],
      );
      const ticket = mintToken('ticket', accountId, sessionKey, TICKET_TTL_MS, config.gateSecret);
      const target = path ? `&to=${encodeURIComponent(path)}` : '';
      return apiSuccess({ url: `${origin}/__enter?t=${ticket}${target}` });
    },
    { mutating: true },
  );
}
