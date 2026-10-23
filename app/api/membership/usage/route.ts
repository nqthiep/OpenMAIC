import { apiSuccess } from '@/lib/server/api-response';
import { learningRoute } from '@/lib/server/learning/http';
import { readBonusTokens } from '@/lib/server/learning/store';
import { llmTokensBetween } from '@/lib/server/usage-storage';

export const runtime = 'nodejs';

/**
 * The signed-in member's allowance for the cycle of their plan that is running: what the plan
 * grants, the reader rewards added to it, what has been used, and when the cycle ends and the
 * allowance comes back. A visitor without an active membership gets `active: false`.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const { viewer } = ctx;
    const cycle = viewer.membership?.cycle;
    if (viewer.ownerId === undefined || viewer.memberActive !== true || !cycle) {
      return apiSuccess({ active: false });
    }
    const used = await llmTokensBetween(viewer.ownerId, new Date(cycle.start), new Date(cycle.end));
    const bonus = await readBonusTokens(ctx.db, viewer.ownerId, cycle.key);
    return apiSuccess({
      active: true,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      quota: viewer.monthlyQuota ?? 0,
      bonus,
      used,
    });
  });
}
