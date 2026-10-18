import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { isValidClassroomId, readClassroomAccess } from '@/lib/server/classroom-storage';
import { readCommunityCourse } from '@/lib/server/learning/community-course';
import {
  authorize,
  bodyOf,
  invalid,
  learningRoute,
  type LearningContext,
} from '@/lib/server/learning/http';
import {
  countRecentRemixes,
  listSharedRemixes,
  readRemixSource,
  recordRemix,
} from '@/lib/server/learning/remix';
import { readSetting } from '@/lib/server/learning/settings';
import { readCourseShare } from '@/lib/server/learning/store';
import { resolveStageAccess } from '@/lib/server/stage-access';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Who owns a course: the classroom's recorded owner, else the shared record's owner. */
async function sourceOwnerId(ctx: LearningContext, courseId: string): Promise<string | undefined> {
  return (
    (await readClassroomAccess(courseId))?.ownerId ??
    (await readCourseShare(ctx.db, courseId))?.ownerId
  );
}

/**
 * Why the viewer may not remix `courseId` now, or undefined when they may: a member (or staff),
 * on a preview or shared course they do not own, under the daily remix limit.
 */
async function remixRefusal(ctx: LearningContext, courseId: string): Promise<string | undefined> {
  if (!can(ctx.viewer, 'generate')) return 'MEMBERSHIP_REQUIRED';
  if (!(await readCommunityCourse(ctx.db, courseId))) return 'FORBIDDEN';
  if ((await sourceOwnerId(ctx, courseId)) === ctx.viewer.ownerId) return 'OWN_COURSE';
  const limit = await readSetting(ctx.db, 'remix.dailyLimit');
  if ((await countRecentRemixes(ctx.db, ctx.viewer.accountId!, ctx.now)) >= limit) {
    return 'RATE_LIMITED';
  }
  return undefined;
}

/**
 * What the classroom shows about remixes of this course: where it was remixed from, its shared
 * remixes, and whether the viewer may remix it now (and if not, why).
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    if (!isValidClassroomId(id)) return apiError('NOT_FOUND', 404, 'Course not found');
    const refusal = authorize(ctx, 'community.read');
    if (refusal) return refusal;
    const [remixOf, remixes, refused] = await Promise.all([
      readRemixSource(ctx.db, id),
      listSharedRemixes(ctx.db, id),
      remixRefusal(ctx, id),
    ]);
    return apiSuccess({
      remixOf: remixOf
        ? { courseId: remixOf.sourceId, title: remixOf.sourceTitle, author: remixOf.sourceAuthor }
        : null,
      remixes,
      canRemix: refused === undefined,
      ...(refused ? { reason: refused } : {}),
    });
  });
}

/**
 * Records that the viewer's new course `id` is a remix of `sourceId`. Body: { sourceId }. The
 * browser copies the course first (export, then import as a new course); this call checks the
 * copy is the viewer's own document and the source may be remixed, and counts toward the limit.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      if (!isValidClassroomId(id)) return apiError('NOT_FOUND', 404, 'Course not found');
      const signedIn = authorize(ctx, 'community.read');
      if (signedIn) return signedIn;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      const sourceId = read.body.sourceId;
      if (typeof sourceId !== 'string' || !isValidClassroomId(sourceId) || sourceId === id) {
        return invalid('sourceId must be another course id');
      }
      let copyOwner: string | undefined;
      try {
        copyOwner = (await resolveStageAccess(id))?.ownerId;
      } catch {
        copyOwner = undefined;
      }
      if (copyOwner !== ctx.viewer.ownerId) return apiError('NOT_FOUND', 404, 'Course not found');

      const refused = await remixRefusal(ctx, sourceId);
      if (refused === 'RATE_LIMITED') {
        return apiError('RATE_LIMITED', 429, 'Daily remix limit reached.');
      }
      if (refused === 'MEMBERSHIP_REQUIRED') {
        return apiError('MEMBERSHIP_REQUIRED', 403, 'An active membership is needed to remix.');
      }
      if (refused) return apiError('FORBIDDEN', 403, 'This course cannot be remixed.');

      const source = (await readCommunityCourse(ctx.db, sourceId))!;
      const recorded = await recordRemix(ctx.db, {
        courseId: id,
        sourceId,
        sourceTitle: source.title,
        sourceOwnerId: (await sourceOwnerId(ctx, sourceId)) ?? null,
        remixerId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!recorded) return apiError('INVALID_REQUEST', 409, 'This course is already a remix.');
      return apiSuccess({ id, sourceId }, 201);
    },
    { mutating: true },
  );
}
