import { accountOwnerId } from '@/lib/server/accounts/service';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import {
  authorize,
  bodyOf,
  invalid,
  learningRoute,
  type LearningContext,
} from '@/lib/server/learning/http';
import {
  SUPPORT_BODY_MAX,
  SUPPORT_REQUEST_BYTES,
  markSupportThreadRead,
  readSupportThread,
  replySupportThread,
  setSupportThreadState,
} from '@/lib/server/learning/support';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The thread when the viewer may see it, or the refusal. A thread the viewer may not see is "not found". */
async function threadFor(ctx: LearningContext, id: string) {
  const signedIn = authorize(ctx, 'support.open');
  if (signedIn) return { refusal: signedIn };
  const found = THREAD_ID_PATTERN.test(id) ? await readSupportThread(ctx.db, id) : undefined;
  if (
    !found ||
    !can(ctx.viewer, 'support.thread', { ownerId: accountOwnerId(found.thread.accountId) })
  ) {
    return { refusal: apiError('NOT_FOUND', 404, 'No such support request.') };
  }
  return { found, own: found.thread.accountId === ctx.viewer.accountId };
}

/**
 * The thread and its messages, and `own`: whether the thread is about the viewer (otherwise the
 * viewer is staff answering it). Opening their own thread marks it read for the learner.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    const { refusal, found, own } = await threadFor(ctx, id);
    if (refusal) return refusal;
    if (own && found.thread.unread) {
      await markSupportThreadRead(ctx.db, id, ctx.now);
      found.thread.unread = false;
    }
    return apiSuccess({ ...found, own });
  });
}

/** Replies. Body: { body }. Staff replying to someone else's thread reply as staff. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const { refusal, own } = await threadFor(ctx, id);
      if (refusal) return refusal;
      const read = await bodyOf(request, SUPPORT_REQUEST_BYTES);
      if (!read.ok) return read.response;
      const body = typeof read.body.body === 'string' ? read.body.body.trim() : '';
      if (body === '' || body.length > SUPPORT_BODY_MAX) {
        return invalid(`body must be 1 to ${SUPPORT_BODY_MAX} characters`);
      }
      await replySupportThread(ctx.db, {
        threadId: id,
        authorId: ctx.viewer.accountId!,
        fromStaff: !own,
        body,
        now: ctx.now,
      });
      return apiSuccess({ id });
    },
    { mutating: true },
  );
}

/** Closes or reopens. Body: { state: 'open' | 'closed' }. Either side may do it. */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const { refusal } = await threadFor(ctx, id);
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      const { state } = read.body;
      if (state !== 'open' && state !== 'closed') return invalid('state must be open or closed');
      await setSupportThreadState(ctx.db, id, state);
      return apiSuccess({ id, state });
    },
    { mutating: true },
  );
}
