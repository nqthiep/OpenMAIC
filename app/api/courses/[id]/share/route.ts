import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import {
  readCourseShare,
  requestCourseShare,
  withdrawCourseShare,
} from '@/lib/server/learning/store';
import {
  isValidClassroomId,
  readClassroom,
  readClassroomAccess,
} from '@/lib/server/classroom-storage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** The share state of a course, and whether the caller owns it, so the owner's control can show it. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    if (!isValidClassroomId(id)) return apiError('NOT_FOUND', 404, 'Course not found');
    const access = await readClassroomAccess(id);
    const share = await readCourseShare(ctx.db, id);
    const owner = access !== undefined && access.ownerId === ctx.viewer.ownerId;
    return apiSuccess({ id, owner, state: share?.state ?? 'private' });
  });
}

/** The owner asks for a course to be shared. An operator approves it. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      if (!isValidClassroomId(id)) return apiError('NOT_FOUND', 404, 'Course not found');
      const access = await readClassroomAccess(id);
      const refusal = authorize(ctx, 'share.request', { ownerId: access?.ownerId });
      if (refusal) return refusal;
      const classroom = await readClassroom(id);
      const title = classroom?.stage?.name?.trim() || id;
      const state = await requestCourseShare(ctx.db, {
        courseId: id,
        ownerId: access!.ownerId,
        title,
        now: ctx.now,
      });
      return apiSuccess({ id, state });
    },
    { mutating: true },
  );
}

/** The owner withdraws a course. Learners who already read it keep their copy. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      if (!isValidClassroomId(id)) return apiError('NOT_FOUND', 404, 'Course not found');
      const access = await readClassroomAccess(id);
      const refusal = authorize(ctx, 'share.request', { ownerId: access?.ownerId });
      if (refusal) return refusal;
      await withdrawCourseShare(ctx.db, { courseId: id, ownerId: access!.ownerId });
      return apiSuccess({ id, state: 'private' });
    },
    { mutating: true },
  );
}
