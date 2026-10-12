import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { authorize, invalid, learningRoute } from '@/lib/server/learning/http';
import { listAudit } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;

/** The audit log, newest first. `before` pages to older rows. */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'audit.read');
    if (refusal) return refusal;
    const limit = Math.min(
      PAGE_MAX,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || PAGE_DEFAULT),
    );
    const beforeRaw = request.nextUrl.searchParams.get('before');
    const before = beforeRaw === null ? undefined : Number(beforeRaw);
    if (before !== undefined && (!Number.isInteger(before) || before < 1)) {
      return invalid('Invalid page cursor');
    }
    return apiSuccess({ entries: await listAudit(ctx.db, before, limit) });
  });
}
