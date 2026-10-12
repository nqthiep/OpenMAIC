import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { authorize, invalid, learningRoute } from '@/lib/server/learning/http';
import { listCourseShares, type ShareState } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/** Share records in one state: `pending` requests waiting for a decision, or `shared` courses. */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'share.decide');
    if (refusal) return refusal;
    const state = request.nextUrl.searchParams.get('state') ?? 'pending';
    if (state !== 'pending' && state !== 'shared')
      return invalid('state must be pending or shared');
    return apiSuccess({ shares: await listCourseShares(ctx.db, state as ShareState) });
  });
}
