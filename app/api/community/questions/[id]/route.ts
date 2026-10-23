import { accountOwnerId } from '@/lib/server/accounts/service';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import {
  ANSWER_BODY_MAX,
  BEST_ANSWER_REWARD_TOKENS,
  COMMUNITY_REQUEST_BYTES,
  addAnswer,
  isBanned,
  listAnswers,
  readQuestion,
  setBestAnswer,
  setQuestionFlags,
} from '@/lib/server/learning/community';
import {
  authorize,
  bodyOf,
  communityPostRefusal,
  invalid,
  learningRoute,
  type LearningContext,
} from '@/lib/server/learning/http';
import { creditBonusTokens } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const QUESTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The question when the viewer may see it. A hidden question is staff-only and reads as missing. */
async function questionFor(ctx: LearningContext, id: string) {
  const refusal = authorize(ctx, 'community.read');
  if (refusal) return { refusal };
  const question = QUESTION_ID_PATTERN.test(id) ? await readQuestion(ctx.db, id) : undefined;
  if (!question || (question.hidden && !can(ctx.viewer, 'community.moderate'))) {
    return { refusal: apiError('NOT_FOUND', 404, 'No such question.') };
  }
  return { question };
}

/** The question, its answers, and what the viewer may do with them. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    const { refusal, question } = await questionFor(ctx, id);
    if (refusal) return refusal;
    const moderator = can(ctx.viewer, 'community.moderate');
    const answers = await listAnswers(ctx.db, {
      questionId: id,
      viewerId: ctx.viewer.accountId,
      includeHidden: moderator,
    });
    const canPost =
      can(ctx.viewer, 'community.post') && !(await isBanned(ctx.db, ctx.viewer.accountId!));
    return apiSuccess({
      question,
      answers,
      viewer: {
        accountId: ctx.viewer.accountId,
        canPost,
        canAccept: question.authorId === ctx.viewer.accountId || moderator,
        moderator,
      },
    });
  });
}

/** Answers. Body: { body }. Members only, not on a locked question. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const { refusal, question } = await questionFor(ctx, id);
      if (refusal) return refusal;
      const blocked = await communityPostRefusal(ctx);
      if (blocked) return blocked;
      if (question.locked) return apiError('FORBIDDEN', 403, 'This question is locked.');
      const read = await bodyOf(request, COMMUNITY_REQUEST_BYTES);
      if (!read.ok) return read.response;
      const body = typeof read.body.body === 'string' ? read.body.body.trim() : '';
      if (body === '' || body.length > ANSWER_BODY_MAX) {
        return invalid(`body must be 1 to ${ANSWER_BODY_MAX} characters`);
      }
      const answerId = await addAnswer(ctx.db, {
        questionId: id,
        authorId: ctx.viewer.accountId!,
        fromAi: false,
        body,
        now: ctx.now,
      });
      return apiSuccess({ id: answerId }, 201);
    },
    { mutating: true },
  );
}

/**
 * Body: { bestAnswerId: number | null } from the asker or staff; { hidden?, locked? } from staff.
 * The first best answer by another member pays its author `BEST_ANSWER_REWARD_TOKENS`.
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const { refusal, question } = await questionFor(ctx, id);
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      const { bestAnswerId, hidden, locked } = read.body;
      const moderator = can(ctx.viewer, 'community.moderate');

      if (hidden !== undefined || locked !== undefined) {
        if (!moderator) return apiError('FORBIDDEN', 403, 'Staff only.');
        if (
          (hidden !== undefined && typeof hidden !== 'boolean') ||
          (locked !== undefined && typeof locked !== 'boolean')
        ) {
          return invalid('hidden and locked must be true or false');
        }
        await setQuestionFlags(ctx.db, id, { hidden, locked });
      }

      let reward = 0;
      if (bestAnswerId !== undefined) {
        if (question.authorId !== ctx.viewer.accountId && !moderator) {
          return apiError('FORBIDDEN', 403, 'Only the asker picks the best answer.');
        }
        if (bestAnswerId !== null && !Number.isSafeInteger(bestAnswerId)) {
          return invalid('bestAnswerId must be an answer id or null');
        }
        const marked = await setBestAnswer(ctx.db, {
          questionId: id,
          answerId: bestAnswerId as number | null,
        });
        if (!marked.ok) return apiError('NOT_FOUND', 404, 'No such answer on this question.');
        if (marked.rewardAuthorId) {
          reward = await creditBonusTokens(
            ctx.db,
            accountOwnerId(marked.rewardAuthorId),
            ctx.now,
            BEST_ANSWER_REWARD_TOKENS,
          );
        }
      }
      return apiSuccess({ id, reward });
    },
    { mutating: true },
  );
}
