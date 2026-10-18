import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  authorize,
  bodyOf,
  communityPostRefusal,
  invalid,
  learningRoute,
} from '@/lib/server/learning/http';
import {
  readAnswer,
  readQuestion,
  setAnswerHidden,
  toggleVote,
} from '@/lib/server/learning/community';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

function answerIdOf(id: string): number | undefined {
  return /^\d{1,15}$/.test(id) ? Number(id) : undefined;
}

/** Votes for an answer, or takes the vote back. Members only; not on your own answer. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = await communityPostRefusal(ctx);
      if (refusal) return refusal;
      const answerId = answerIdOf(id);
      const answer = answerId === undefined ? undefined : await readAnswer(ctx.db, answerId);
      const question = answer ? await readQuestion(ctx.db, answer.questionId) : undefined;
      if (!answer || !question || question.hidden) {
        return apiError('NOT_FOUND', 404, 'No such answer.');
      }
      if (answer.authorId === ctx.viewer.accountId) {
        return apiError('FORBIDDEN', 403, 'You cannot vote for your own answer.');
      }
      return apiSuccess({
        ...(await toggleVote(ctx.db, { answerId: answerId!, accountId: ctx.viewer.accountId! })),
      });
    },
    { mutating: true },
  );
}

/** Hides or shows an answer. Body: { hidden }. Staff only. */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.moderate');
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      if (typeof read.body.hidden !== 'boolean') return invalid('hidden must be true or false');
      const answerId = answerIdOf(id);
      if (answerId === undefined || !(await setAnswerHidden(ctx.db, answerId, read.body.hidden))) {
        return apiError('NOT_FOUND', 404, 'No such answer.');
      }
      return apiSuccess({ id: answerId, hidden: read.body.hidden });
    },
    { mutating: true },
  );
}
