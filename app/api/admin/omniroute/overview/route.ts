import { apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { buildOverview } from '@/lib/server/omniroute/overview';

export const runtime = 'nodejs';

/**
 * Where OmniRoute setup stands, for the Settings panel: the environment, whether OmniRoute answers,
 * its provider connections, whether OpenMAIC has a key there, and the models chosen per role.
 * Never returns a key. Administrators only.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'provider.manage');
    if (refusal) return refusal;
    return apiSuccess({ overview: await buildOverview(ctx.db) });
  });
}
