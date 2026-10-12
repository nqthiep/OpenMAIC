import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId } from '@/lib/server/classroom-storage';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { listCoursePreviews, setCoursePreview } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/** The courses marked as free previews. */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'preview.mark');
    if (refusal) return refusal;
    return apiSuccess({ previews: await listCoursePreviews(ctx.db) });
  });
}

/** Marks or unmarks a course as a free preview. Body: { courseId, on }. */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'preview.mark');
      if (refusal) return refusal;
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const { courseId, on } = body.body;
      if (typeof courseId !== 'string' || !isValidClassroomId(courseId)) {
        return invalid('Invalid course id');
      }
      if (typeof on !== 'boolean') return invalid('on must be true or false');
      await setCoursePreview(ctx.db, {
        actorId: ctx.viewer.accountId!,
        courseId,
        on,
        now: ctx.now,
      });
      return apiSuccess({ courseId, preview: on });
    },
    { mutating: true },
  );
}
