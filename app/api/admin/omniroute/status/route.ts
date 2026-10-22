import { apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { omnirouteConfig } from '@/lib/server/omniroute/config';

export const runtime = 'nodejs';

/** Whether OmniRoute is set up on this server, so the Settings popup knows to offer its button. */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'provider.manage');
    if (refusal) return refusal;
    return apiSuccess({ enabled: omnirouteConfig() !== undefined });
  });
}
