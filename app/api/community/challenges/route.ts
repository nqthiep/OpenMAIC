import { randomUUID } from 'node:crypto';

import { apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { currentMonth } from '@/lib/server/authz/viewer';
import {
  createChallenge,
  listChallenges,
  monthlyLeaderboard,
  parseChallengeInput,
  settleChallenge,
} from '@/lib/server/learning/challenge';
import { COMMUNITY_REQUEST_BYTES } from '@/lib/server/learning/community';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';

export const runtime = 'nodejs';

/**
 * Challenges, newest first, with this month's leaderboard. Finished challenges that are not
 * settled yet are settled here, so results never wait for a scheduler.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'community.read');
    if (refusal) return refusal;
    const staff = can(ctx.viewer, 'community.moderate');
    let challenges = await listChallenges(ctx.db, { staff, now: ctx.now });
    const due = challenges.filter((c) => c.phase === 'finished' && !c.settled);
    if (due.length > 0) {
      for (const challenge of due)
        await settleChallenge(ctx.db, { id: challenge.id, now: ctx.now });
      challenges = await listChallenges(ctx.db, { staff, now: ctx.now });
    }
    const leaderboard = await monthlyLeaderboard(ctx.db, { month: currentMonth(ctx.now) });
    return apiSuccess({ challenges, leaderboard, staff });
  });
}

/**
 * Posts a challenge. Body: { title, statement, referenceSolution, opensAt, submissionDays,
 * votingDays, rewards: [first, second, third] }. Staff only.
 */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.moderate');
      if (refusal) return refusal;
      const read = await bodyOf(request, COMMUNITY_REQUEST_BYTES);
      if (!read.ok) return read.response;
      const parsed = parseChallengeInput(read.body);
      if (!parsed.ok) return invalid(parsed.message);
      const id = randomUUID();
      await createChallenge(ctx.db, {
        ...parsed.input,
        id,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      return apiSuccess({ id }, 201);
    },
    { mutating: true },
  );
}
