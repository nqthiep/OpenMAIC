import { apiError, apiSuccess } from '@/lib/server/api-response';
import { currentMonth } from '@/lib/server/authz/viewer';
import { learningRoute } from '@/lib/server/learning/http';
import {
  countDistinctReaders,
  listSharesByOwner,
  MONTHLY_REWARD_CAP_TOKENS,
  nextBadge,
  readBadges,
  readBonusTokens,
} from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/**
 * What the signed-in learner has given and earned: their shared courses with readers, the reward
 * tokens of this month against the monthly cap, their badges, and how far the next badge is. It
 * is the learner's own data, so no membership is needed: a lapsed member still sees their badges.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const { viewer } = ctx;
    if (viewer.accountId === undefined || viewer.ownerId === undefined) {
      return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
    }
    const month = currentMonth(ctx.now);
    const [shares, readers, bonus, badges] = await Promise.all([
      listSharesByOwner(ctx.db, viewer.ownerId),
      countDistinctReaders(ctx.db, viewer.ownerId),
      readBonusTokens(ctx.db, viewer.ownerId, month),
      readBadges(ctx.db, viewer.ownerId),
    ]);
    return apiSuccess({
      shares,
      readers,
      bonus: { month, tokens: bonus, cap: MONTHLY_REWARD_CAP_TOKENS },
      badges,
      next: nextBadge(readers),
    });
  });
}
