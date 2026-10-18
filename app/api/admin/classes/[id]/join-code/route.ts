import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { hashJoinCode, newJoinCode } from '@/lib/server/learning/join-code';
import { rotateClassJoinCode } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * Gives a class a new join code and returns it once. Only hashes are stored, so this is the way
 * back when the code shown at creation is lost. The old code stops working. Logged as `class:code`.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'class.manage');
      if (refusal) return refusal;
      const joinCode = newJoinCode();
      const rotated = await rotateClassJoinCode(ctx.db, {
        classId: id,
        joinCodeHash: hashJoinCode(joinCode),
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!rotated) return apiError('NOT_FOUND', 404, 'Class not found');
      return apiSuccess({ id, joinCode });
    },
    { mutating: true },
  );
}
