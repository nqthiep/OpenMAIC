import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId } from '@/lib/server/classroom-storage';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { isTaggableCourse, setCourseTags } from '@/lib/server/learning/store';
import { validateTags } from '@/lib/learning/taxonomy';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * Sets the subject, grade and topic tags of a course, replacing the old ones. Body:
 * { tags: string[] }; an empty list clears them. Staff only, and only for a course that has a
 * share record or a preview mark, since those are the courses the catalog lists.
 */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'share.decide');
      if (refusal) return refusal;
      if (!isValidClassroomId(id)) return invalid('Invalid course id');
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const { tags } = body.body;
      if (!Array.isArray(tags)) return invalid('tags must be a list');
      const checked = validateTags(tags);
      if (!checked.ok) return invalid(checked.error);
      if (!(await isTaggableCourse(ctx.db, id))) {
        return apiError('NOT_FOUND', 404, 'The course is neither shared nor a preview');
      }
      await setCourseTags(ctx.db, {
        courseId: id,
        tags: checked.tags,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      return apiSuccess({ courseId: id, tags: checked.tags });
    },
    { mutating: true },
  );
}
