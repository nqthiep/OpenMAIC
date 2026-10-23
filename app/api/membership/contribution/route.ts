import { apiError, apiSuccess } from '@/lib/server/api-response';
import { learningRoute } from '@/lib/server/learning/http';
import {
  countDistinctReaders,
  listCourseTags,
  listSharesByOwner,
  MONTHLY_REWARD_CAP_TOKENS,
  nextBadge,
  readBadges,
  readBonusTokens,
} from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/**
 * What the signed-in learner has given and earned: their shared courses with readers, the reward
 * tokens of the running cycle against the cap, their badges, and how far the next badge is. It
 * is the learner's own data, so no membership is needed: a lapsed member still sees their badges.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const { viewer } = ctx;
    if (viewer.accountId === undefined || viewer.ownerId === undefined) {
      return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
    }
    // Rewards belong to a cycle of a plan, so a lapsed member has none to show.
    const cycleKey = viewer.membership?.cycle?.key;
    const [shares, readers, bonus, badges] = await Promise.all([
      listSharesByOwner(ctx.db, viewer.ownerId),
      countDistinctReaders(ctx.db, viewer.ownerId),
      cycleKey === undefined ? 0 : readBonusTokens(ctx.db, viewer.ownerId, cycleKey),
      readBadges(ctx.db, viewer.ownerId),
    ]);
    // The tags staff gave the courses, so the owner sees where each one is filed.
    const tags = await listCourseTags(
      ctx.db,
      shares.map((share) => share.courseId),
    );
    return apiSuccess({
      shares: shares.map((share) => {
        const own = tags.get(share.courseId);
        return own ? { ...share, tags: own } : share;
      }),
      readers,
      bonus: {
        cycleStart: viewer.membership?.cycle?.start ?? null,
        tokens: bonus,
        cap: MONTHLY_REWARD_CAP_TOKENS,
      },
      badges,
      next: nextBadge(readers),
    });
  });
}
