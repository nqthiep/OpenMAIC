import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import {
  readCourseShare,
  readShareRejection,
  requestCourseShare,
  withdrawCourseShare,
} from '@/lib/server/learning/store';
import {
  SNAPSHOT_MAX_BYTES,
  SnapshotError,
  dropPendingSnapshot,
  readPendingSnapshot,
  savePendingSnapshot,
  summarizeSnapshot,
} from '@/lib/server/learning/course-snapshot';
import {
  isValidClassroomId,
  readClassroom,
  readClassroomAccess,
} from '@/lib/server/classroom-storage';
import { resolveStageAccess } from '@/lib/server/stage-access';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * The owner of a course: the classroom's recorded owner, or for a course that exists only as an
 * edited document (an imported or remixed course), the document's owner.
 */
async function courseOwnerId(id: string): Promise<string | undefined> {
  const access = await readClassroomAccess(id);
  if (access) return access.ownerId;
  try {
    return (await resolveStageAccess(id))?.ownerId;
  } catch {
    return undefined;
  }
}

/** The request body as bytes, refusing more than `max`. Undefined when it is too large. */
async function readBytesUpTo(request: Request, max: number): Promise<Uint8Array | undefined> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > max) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The share state of a course, and whether the caller owns it, so the owner's control can show it.
 * The owner also learns whether an updated version waits for review, and why one was refused.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    if (!isValidClassroomId(id)) return apiError('NOT_FOUND', 404, 'Course not found');
    const ownerId = await courseOwnerId(id);
    const share = await readCourseShare(ctx.db, id);
    const owner = ownerId !== undefined && ownerId === ctx.viewer.ownerId;
    // Only the owner learns that a request was refused, and why.
    const rejection = owner
      ? await readShareRejection(ctx.db, { courseId: id, ownerId })
      : undefined;
    const pending = owner ? await readPendingSnapshot(ctx.db, id) : undefined;
    return apiSuccess({
      id,
      owner,
      state: share?.state ?? (rejection ? 'rejected' : 'private'),
      ...(rejection ? { rejection } : {}),
      updatePending: share?.state === 'shared' && pending !== undefined,
    });
  });
}

/**
 * The owner asks for a course to be shared, or for the shared version to be updated. With a
 * classroom ZIP as the body (`application/zip`, the export of the edited course), that version is
 * what readers get once an operator approves it; without one, the course is shared as generated.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      if (!isValidClassroomId(id)) return apiError('NOT_FOUND', 404, 'Course not found');
      const ownerId = await courseOwnerId(id);
      const refusal = authorize(ctx, 'share.request', { ownerId });
      if (refusal) return refusal;

      const isZip = (request.headers.get('content-type') ?? '').startsWith('application/zip');
      let title: string | undefined;
      if (isZip) {
        const bytes = await readBytesUpTo(request, SNAPSHOT_MAX_BYTES);
        if (!bytes) return apiError('PAYLOAD_TOO_LARGE', 413, 'The course package is too large.');
        try {
          const summary = await summarizeSnapshot(bytes);
          await savePendingSnapshot(ctx.db, {
            courseId: id,
            ownerId: ownerId!,
            bytes,
            summary,
            now: ctx.now,
          });
          title = summary.name;
        } catch (error) {
          if (error instanceof SnapshotError) {
            return apiError(
              'INVALID_REQUEST',
              400,
              `Not a usable course package: ${error.message}`,
            );
          }
          throw error;
        }
      } else {
        const classroom = await readClassroom(id);
        if (!classroom) {
          return apiError(
            'INVALID_REQUEST',
            400,
            'This course must be sent as a package to be shared.',
          );
        }
        title = classroom.stage?.name?.trim() || id;
      }

      const state = await requestCourseShare(ctx.db, {
        courseId: id,
        ownerId: ownerId!,
        title: title || id,
        now: ctx.now,
      });
      return apiSuccess({ id, state, updatePending: isZip && state === 'shared' });
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
      const ownerId = await courseOwnerId(id);
      const refusal = authorize(ctx, 'share.request', { ownerId });
      if (refusal) return refusal;
      await withdrawCourseShare(ctx.db, { courseId: id, ownerId: ownerId! });
      await dropPendingSnapshot(ctx.db, id);
      return apiSuccess({ id, state: 'private' });
    },
    { mutating: true },
  );
}
