import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { omnirouteConfig } from '@/lib/server/omniroute/config';
import { mintToken, TICKET_TTL_MS } from '@/lib/server/omniroute/token';

export const runtime = 'nodejs';

/**
 * Hands an administrator the address of the OmniRoute dashboard with a one-time ticket in it.
 * The popup opens that address in a new tab; `enter` turns the ticket into the gate cookie. A POST
 * from this site only, and an audit row names who asked.
 */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      const config = omnirouteConfig();
      if (!config) return apiError('NOT_FOUND', 404, 'OmniRoute is not set up on this server.');
      const accountId = ctx.viewer.accountId!;
      await ctx.db.query(
        `INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
         VALUES ($1::text, 'omniroute', 'omniroute:open', NULL, $2::timestamptz)`,
        [accountId, ctx.now.toISOString()],
      );
      const ticket = mintToken('ticket', accountId, TICKET_TTL_MS, config.gateSecret);
      return apiSuccess({ url: `${config.publicUrl}/__enter?t=${ticket}` });
    },
    { mutating: true },
  );
}
