import { apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { decideCourseShare } from '@/lib/server/learning/store';
import { isValidClassroomId } from '@/lib/server/classroom-storage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Approves or rejects a pending share request. Body: { decision: 'approve' | 'reject' }. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'share.decide');
      if (refusal) return refusal;
      if (!isValidClassroomId(id)) return invalid('Invalid course id');
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const { decision } = body.body;
      if (decision !== 'approve' && decision !== 'reject') {
        return invalid('decision must be approve or reject');
      }
      const decided = await decideCourseShare(ctx.db, {
        actorId: ctx.viewer.accountId!,
        courseId: id,
        decision,
        now: ctx.now,
      });
      if (!decided) return invalid('No pending request for this course');
      return apiSuccess({ id, decision });
    },
    { mutating: true },
  );
}
