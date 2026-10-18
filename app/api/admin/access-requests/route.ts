import { apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { listPendingAccessRequests } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/** The membership requests waiting for a decision, oldest first. Operators and administrators only. */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'membership.manage');
    if (refusal) return refusal;
    return apiSuccess({ requests: await listPendingAccessRequests(ctx.db, ctx.now) });
  });
}
