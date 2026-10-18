import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { deleteClass, renameClass } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const NAME_MAX = 80;

/** Renames a class. Body: { name }. Logged as `class:rename` with the old and new names. */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'class.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const name = typeof body.body.name === 'string' ? body.body.name.trim() : '';
      if (name === '' || Array.from(name).length > NAME_MAX) {
        return invalid(`name must be text of 1 to ${NAME_MAX} characters`);
      }
      const renamed = await renameClass(ctx.db, {
        classId: id,
        name,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!renamed) return apiError('NOT_FOUND', 404, 'Class not found');
      return apiSuccess({ id, name });
    },
    { mutating: true },
  );
}

/** Deletes a class, its members' places in it and its course links. Logged as `class:delete`. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'class.manage');
      if (refusal) return refusal;
      const deleted = await deleteClass(ctx.db, {
        classId: id,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!deleted) return apiError('NOT_FOUND', 404, 'Class not found');
      return apiSuccess({ id });
    },
    { mutating: true },
  );
}
