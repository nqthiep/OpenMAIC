import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomAccess } from '@/lib/server/classroom-storage';
import { attachableCourseIds } from '@/lib/server/learning/attachable';
import { courseExists } from '@/lib/server/learning/course-exists';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { attachCourseToClass, detachCourseFromClass } from '@/lib/server/learning/store';
import { resolveStageAccess } from '@/lib/server/stage-access';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * Attaches a course to a class, so its members can open it. Body: { courseId }. Only a shared,
 * preview or staff-owned course qualifies; a learner's private course must be shared first.
 */
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
      if (!(await courseExists(courseId)))
        return apiError('COURSE_NOT_FOUND', 404, 'Course not found');
      const ownerId =
        (await readClassroomAccess(courseId))?.ownerId ??
        (await resolveStageAccess(courseId).catch(() => null))?.ownerId;
      if (!(await attachableCourseIds(ctx.db, [{ courseId, ownerId }])).has(courseId)) {
        return apiError(
          'COURSE_NOT_ATTACHABLE',
          403,
          'Only a shared, preview or staff-owned course can be attached',
        );
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

/** Detaches a course from a class. Query: ?courseId=. Logged as `class:detach:<classId>`. */
export async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'class.manage');
      if (refusal) return refusal;
      const courseId = request.nextUrl.searchParams.get('courseId');
      if (courseId === null || !isValidClassroomId(courseId)) return invalid('Invalid course id');
      const detached = await detachCourseFromClass(ctx.db, {
        classId: id,
        courseId,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!detached) return apiError('NOT_FOUND', 404, 'The course is not attached to this class');
      return apiSuccess({ classId: id, courseId });
    },
    { mutating: true },
  );
}
