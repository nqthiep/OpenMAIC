import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { listClassesForAccount } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/** The classes the signed-in member belongs to. */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'spend');
    if (refusal) return refusal;
    if (!ctx.viewer.memberActive) {
      return apiError('MEMBERSHIP_REQUIRED', 403, 'An active membership is needed to use classes.');
    }
    return apiSuccess({ classes: await listClassesForAccount(ctx.db, ctx.viewer.accountId!) });
  });
}
