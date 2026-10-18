import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { listClassProgress } from '@/lib/server/learning/progress';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** How far each member of a class got in the courses attached to it, for staff. */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'class.manage');
    if (refusal) return refusal;
    return apiSuccess({ progress: await listClassProgress(ctx.db, id) });
  });
}
