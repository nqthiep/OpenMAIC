import { apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId } from '@/lib/server/classroom-storage';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { attachCourseToClass } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Attaches a course to a class, so its members can open it. Body: { courseId }. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'class.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const { courseId } = body.body;
      if (typeof courseId !== 'string' || !isValidClassroomId(courseId)) {
        return invalid('Invalid course id');
      }
      const attached = await attachCourseToClass(ctx.db, {
        classId: id,
        courseId,
        attachedBy: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!attached) return invalid('Class not found, or the course is already attached');
      return apiSuccess({ classId: id, courseId });
    },
    { mutating: true },
  );
}
