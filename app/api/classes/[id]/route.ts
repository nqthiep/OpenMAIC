import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { leaveClass } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** The signed-in member leaves a class; they can join again with its code. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'join.class');
      if (refusal) return refusal;
      const left = await leaveClass(ctx.db, {
        classId: id,
        accountId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!left) return apiError('NOT_FOUND', 404, 'You are not in this class');
      return apiSuccess({ classId: id });
    },
    { mutating: true },
  );
}
