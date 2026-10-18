import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { requireSpender } from '@/lib/server/authz/viewer';
import { createLogger } from '@/lib/logger';
import {
  ENTRY_BODY_MAX,
  listEntries,
  parseChallengeInput,
  readChallenge,
  saveEntry,
  saveGrade,
  settleChallenge,
  updateChallenge,
} from '@/lib/server/learning/challenge';
import { gradeEntry } from '@/lib/server/learning/challenge-grade';
import { COMMUNITY_REQUEST_BYTES, isBanned } from '@/lib/server/learning/community';
import {
  authorize,
  bodyOf,
  communityPostRefusal,
  invalid,
  learningRoute,
  type LearningContext,
} from '@/lib/server/learning/http';
import { readSetting } from '@/lib/server/learning/settings';

export const runtime = 'nodejs';

const log = createLogger('ChallengeGrade');

type Params = { params: Promise<{ id: string }> };

const CHALLENGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The challenge when the viewer may see it, settled first when its voting is over. */
async function challengeFor(ctx: LearningContext, id: string) {
  const refusal = authorize(ctx, 'community.read');
  if (refusal) return { refusal };
  const staff = can(ctx.viewer, 'community.moderate');
  if (!CHALLENGE_ID_PATTERN.test(id)) {
    return { refusal: apiError('NOT_FOUND', 404, 'No such challenge.') };
  }
  let challenge = await readChallenge(ctx.db, { id, staff, now: ctx.now });
  if (challenge?.phase === 'finished' && !challenge.settled) {
    await settleChallenge(ctx.db, { id, now: ctx.now });
    challenge = await readChallenge(ctx.db, { id, staff, now: ctx.now });
  }
  if (!challenge) return { refusal: apiError('NOT_FOUND', 404, 'No such challenge.') };
  return { challenge, staff };
}

/** The challenge, the entries the viewer may see, and what the viewer may do. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    const { refusal, challenge, staff } = await challengeFor(ctx, id);
    if (refusal) return refusal;
    const entries = await listEntries(ctx.db, {
      challengeId: id,
      phase: challenge.phase,
      viewerId: ctx.viewer.accountId,
      staff,
    });
    const canPost =
      can(ctx.viewer, 'community.post') && !(await isBanned(ctx.db, ctx.viewer.accountId!));
    return apiSuccess({
      challenge,
      entries,
      viewer: { accountId: ctx.viewer.accountId, canPost, staff },
    });
  });
}

/** Changes the challenge until it is settled. Same body as creating, plus { hidden }. Staff only. */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.moderate');
      if (refusal) return refusal;
      if (!CHALLENGE_ID_PATTERN.test(id)) return apiError('NOT_FOUND', 404, 'No such challenge.');
      const read = await bodyOf(request, COMMUNITY_REQUEST_BYTES);
      if (!read.ok) return read.response;
      const parsed = parseChallengeInput(read.body);
      if (!parsed.ok) return invalid(parsed.message);
      const changed = await updateChallenge(ctx.db, {
        ...parsed.input,
        id,
        hidden: read.body.hidden === true,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!changed) {
        return apiError('NOT_FOUND', 404, 'No such challenge, or its results are already out.');
      }
      return apiSuccess({ id });
    },
    { mutating: true },
  );
}

/**
 * Submits or replaces the viewer's entry while the challenge is open, then asks the AI for a
 * grade. Who pays for the grade is the `challenge.aiGradingPaidBy` setting: with "submitter" a
 * learner without allowance left still submits, only without a grade.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const { refusal, challenge } = await challengeFor(ctx, id);
      if (refusal) return refusal;
      const blocked = await communityPostRefusal(ctx);
      if (blocked) return blocked;
      if (challenge.phase !== 'open') {
        return apiError('FORBIDDEN', 403, 'This challenge does not take entries now.');
      }
      const read = await bodyOf(request, COMMUNITY_REQUEST_BYTES);
      if (!read.ok) return read.response;
      const body = typeof read.body.body === 'string' ? read.body.body.trim() : '';
      if (body === '' || body.length > ENTRY_BODY_MAX) {
        return invalid(`body must be 1 to ${ENTRY_BODY_MAX} characters`);
      }
      const entryId = await saveEntry(ctx.db, {
        challengeId: id,
        accountId: ctx.viewer.accountId!,
        body,
        now: ctx.now,
      });

      const paidBy = await readSetting(ctx.db, 'challenge.aiGradingPaidBy');
      if (paidBy === 'submitter') {
        const denied = await requireSpender(request.headers);
        if (denied) {
          const { errorCode } = (await denied.json()) as { errorCode?: string };
          return apiSuccess({ id: entryId, graded: false, reason: errorCode ?? 'QUOTA_EXCEEDED' });
        }
      }
      try {
        // The reference solution is read here even before voting: the grader needs it.
        const full = await readChallenge(ctx.db, { id, staff: true, now: ctx.now });
        const grade = await gradeEntry({
          statement: challenge.statement,
          referenceSolution: full?.referenceSolution ?? '',
          body,
        });
        await saveGrade(ctx.db, { entryId, ...grade });
        return apiSuccess({ id: entryId, graded: true });
      } catch (error) {
        log.warn('Grading failed', error instanceof Error ? error.name : 'unknown error');
        return apiSuccess({ id: entryId, graded: false, reason: 'GENERATION_FAILED' });
      }
    },
    { mutating: true },
  );
}
