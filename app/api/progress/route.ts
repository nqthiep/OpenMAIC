import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId } from '@/lib/server/classroom-storage';
import { canReadClassroom } from '@/lib/server/authz/viewer';
import { bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { listOwnProgress, saveProgress } from '@/lib/server/learning/progress';

export const runtime = 'nodejs';

const MAX_COURSE_IDS = 100;
const MAX_SCENES = 10_000;
const MAX_SCENE_ID = 200;

const unauthenticated = () => apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

/**
 * The caller's own progress. `?courseIds=a,b` names the courses; without it the courses studied
 * last come back. Nobody else's rows are ever returned here.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    if (ctx.viewer.accountId === undefined) return unauthenticated();
    const raw = new URL(request.url).searchParams.get('courseIds');
    let courseIds: string[] | undefined;
    if (raw !== null) {
      courseIds = raw.split(',').filter((id) => id !== '');
      if (courseIds.length > MAX_COURSE_IDS || !courseIds.every(isValidClassroomId)) {
        return invalid('Invalid course ids');
      }
    }
    return apiSuccess({ progress: await listOwnProgress(ctx.db, ctx.viewer.accountId, courseIds) });
  });
}

/**
 * Records the scene the caller is on. Body: { courseId, sceneId, sceneIndex (1-based),
 * sceneCount, quizScore? (0 to 100) }. Only for a course the caller may read; anything else is
 * 404, like the classroom itself.
 */
export async function PUT(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const accountId = ctx.viewer.accountId;
      if (accountId === undefined) return unauthenticated();
      const parsed = await bodyOf(request, 4096);
      if (!parsed.ok) return parsed.response;
      const { courseId, sceneId, sceneIndex, sceneCount, quizScore } = parsed.body;
      const count = integer(sceneCount, 1, MAX_SCENES);
      const index = integer(sceneIndex, 1, count ?? 0);
      const score = quizScore === undefined ? undefined : integer(quizScore, 0, 100);
      if (
        typeof courseId !== 'string' ||
        !isValidClassroomId(courseId) ||
        typeof sceneId !== 'string' ||
        sceneId === '' ||
        sceneId.length > MAX_SCENE_ID ||
        count === undefined ||
        index === undefined ||
        (quizScore !== undefined && score === undefined)
      ) {
        return invalid('Invalid progress');
      }
      if (!(await canReadClassroom(request.headers, courseId))) {
        return apiError('NOT_FOUND', 404, 'Course not found');
      }
      await saveProgress(ctx.db, {
        accountId,
        courseId,
        sceneId,
        sceneIndex: index,
        sceneCount: count,
        quizScore: score,
        now: ctx.now,
      });
      return apiSuccess({});
    },
    { mutating: true },
  );
}
