import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { decideCourseShare, readCourseShare, revokeCourseShare } from '@/lib/server/learning/store';
import {
  SnapshotError,
  applySnapshot,
  dropPendingSnapshot,
  readPendingSnapshot,
  readPendingSnapshotBytes,
} from '@/lib/server/learning/course-snapshot';
import { isValidClassroomId } from '@/lib/server/classroom-storage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const REASON_MAX = 200;

/**
 * Approves or rejects a pending share request, or the pending update of a shared course. Body:
 * { decision: 'approve' | 'reject', reason? }. Approving a request or an update that came with a
 * course package publishes that package as the version readers get. A rejection reason is shown
 * to the course's owner.
 */
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
      const { decision, reason } = body.body;
      if (decision !== 'approve' && decision !== 'reject') {
        return invalid('decision must be approve or reject');
      }
      if (reason !== undefined && (typeof reason !== 'string' || reason.length > REASON_MAX)) {
        return invalid(`reason must be text of at most ${REASON_MAX} characters`);
      }
      const trimmed = typeof reason === 'string' ? reason.trim() : '';
      const share = await readCourseShare(ctx.db, id);
      const snapshot = await readPendingSnapshot(ctx.db, id);
      const isUpdate = share?.state === 'shared' && snapshot !== undefined;
      if (!share || (share.state === 'shared' && !isUpdate)) {
        return invalid('No pending request for this course');
      }

      if (decision === 'approve' && snapshot) {
        const bytes = await readPendingSnapshotBytes(id);
        if (!bytes) return apiError('NOT_FOUND', 404, 'The course package is missing.');
        try {
          await applySnapshot({ courseId: id, bytes, ownerId: snapshot.ownerId, now: ctx.now });
        } catch (error) {
          if (error instanceof SnapshotError) {
            return apiError(
              'INVALID_REQUEST',
              400,
              `The course package cannot be used: ${error.message}`,
            );
          }
          throw error;
        }
        await dropPendingSnapshot(ctx.db, id);
      }

      if (isUpdate) {
        if (decision === 'reject') {
          await dropPendingSnapshot(ctx.db, id);
          await ctx.db.query(
            `INSERT INTO course_share_rejections (course_id, owner_id, title, reason, rejected_at)
             VALUES ($1::text, $2::text, $3::text, $4::text, $5::timestamptz)
             ON CONFLICT (course_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, title = EXCLUDED.title,
               reason = EXCLUDED.reason, rejected_at = EXCLUDED.rejected_at`,
            [id, share.ownerId, share.title, trimmed || null, ctx.now.toISOString()],
          );
        }
        await ctx.db.query(
          `INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
           VALUES ($1::text, $2::text, $3::text, $4::text, $5::timestamptz)`,
          [
            ctx.viewer.accountId!,
            id,
            `share:update-${decision}`,
            decision === 'reject' && trimmed ? trimmed : null,
            ctx.now.toISOString(),
          ],
        );
        return apiSuccess({ id, decision, update: true });
      }

      const decided = await decideCourseShare(ctx.db, {
        actorId: ctx.viewer.accountId!,
        courseId: id,
        decision,
        reason: decision === 'reject' && trimmed !== '' ? trimmed : undefined,
        now: ctx.now,
      });
      if (!decided) return invalid('No pending request for this course');
      if (decision === 'reject') await dropPendingSnapshot(ctx.db, id);
      return apiSuccess({ id, decision });
    },
    { mutating: true },
  );
}

/** Takes a shared course off the shared list. Logged as `share:revoke` with the course title. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'share.decide');
      if (refusal) return refusal;
      if (!isValidClassroomId(id)) return invalid('Invalid course id');
      const revoked = await revokeCourseShare(ctx.db, {
        actorId: ctx.viewer.accountId!,
        courseId: id,
        now: ctx.now,
      });
      if (!revoked) return apiError('NOT_FOUND', 404, 'This course is not shared');
      await dropPendingSnapshot(ctx.db, id);
      return apiSuccess({ id });
    },
    { mutating: true },
  );
}
