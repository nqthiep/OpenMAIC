import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { addClassMember, listClassMembers, removeClassMember } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The members of a class, for staff. */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'class.manage');
    if (refusal) return refusal;
    return apiSuccess({ members: await listClassMembers(ctx.db, id) });
  });
}

/**
 * Adds an account to a class without a join code. Body: { accountId }. Logged as
 * `class:add:<classId>`. An account without an active membership can be added; it opens the class
 * courses once it has one.
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
      const { accountId } = body.body;
      if (typeof accountId !== 'string' || !ACCOUNT_ID_PATTERN.test(accountId)) {
        return invalid('Invalid account id');
      }
      const added = await addClassMember(ctx.db, {
        classId: id,
        accountId,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!added) {
        return apiError('NOT_FOUND', 404, 'Class or account not found, or already a member');
      }
      return apiSuccess({ classId: id, accountId });
    },
    { mutating: true },
  );
}

/** Removes one member from a class. Query: ?accountId=. Logged as `class:remove:<classId>`. */
export async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'class.manage');
      if (refusal) return refusal;
      const accountId = request.nextUrl.searchParams.get('accountId');
      if (accountId === null || !ACCOUNT_ID_PATTERN.test(accountId)) {
        return invalid('Invalid account id');
      }
      const removed = await removeClassMember(ctx.db, {
        classId: id,
        accountId,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!removed) return apiError('NOT_FOUND', 404, 'This account is not in the class');
      return apiSuccess({ classId: id, accountId });
    },
    { mutating: true },
  );
}
