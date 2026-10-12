import { apiSuccess } from '@/lib/server/api-response';
import { learningRoute } from '@/lib/server/learning/http';
import { listCatalog } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/**
 * What the visitor may browse: previews for everyone, and for an active member the shared courses
 * and the courses of their classes.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const courses = await listCatalog(ctx.db, {
      accountId: ctx.viewer.accountId,
      memberActive: ctx.viewer.memberActive === true,
    });
    return apiSuccess({ courses, member: ctx.viewer.memberActive === true });
  });
}
