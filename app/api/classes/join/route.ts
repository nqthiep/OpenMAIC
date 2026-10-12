import { apiError, apiSuccess } from '@/lib/server/api-response';
import { hashJoinCode } from '@/lib/server/learning/join-code';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { findClassByJoinCodeHash, joinClass } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/** Joins a class with its code. An active membership is needed. Body: { code }. */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'spend');
      if (refusal) return refusal;
      if (!ctx.viewer.memberActive) {
        return apiError(
          'MEMBERSHIP_REQUIRED',
          403,
          'An active membership is needed to join a class.',
        );
      }
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const code = typeof body.body.code === 'string' ? body.body.code.trim().toUpperCase() : '';
      if (code === '') return invalid('Enter the join code');
      const found = await findClassByJoinCodeHash(ctx.db, hashJoinCode(code));
      if (!found) return apiError('NOT_FOUND', 404, 'No class has this code');
      await joinClass(ctx.db, {
        classId: found.id,
        accountId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      return apiSuccess({ class: { id: found.id, name: found.name } });
    },
    { mutating: true },
  );
}
