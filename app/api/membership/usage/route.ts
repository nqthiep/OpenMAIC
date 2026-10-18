import { apiSuccess } from '@/lib/server/api-response';
import { currentMonth } from '@/lib/server/authz/viewer';
import { learningRoute } from '@/lib/server/learning/http';
import { readBonusTokens } from '@/lib/server/learning/store';
import { monthlyLlmTokens } from '@/lib/server/usage-storage';

export const runtime = 'nodejs';

/**
 * The signed-in member's allowance for this month: what the membership grants, the reader rewards
 * added to it, and what has been used. A visitor without an active membership gets `active: false`.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const month = currentMonth(ctx.now);
    const { viewer } = ctx;
    if (viewer.ownerId === undefined || viewer.memberActive !== true) {
      return apiSuccess({ active: false, month });
    }
    const used = await monthlyLlmTokens(viewer.ownerId, month);
    const bonus = await readBonusTokens(ctx.db, viewer.ownerId, month);
    return apiSuccess({ active: true, month, quota: viewer.monthlyQuota ?? 0, bonus, used });
  });
}
