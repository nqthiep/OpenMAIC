import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { authorize, invalid, learningRoute } from '@/lib/server/learning/http';
import { listMemberships } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accounts with their membership, one page at a time. Operators and administrators only. */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'membership.manage');
    if (refusal) return refusal;
    const limit = Math.min(
      PAGE_MAX,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || PAGE_DEFAULT),
    );
    const after = request.nextUrl.searchParams.get('after') ?? undefined;
    if (after !== undefined && !ACCOUNT_ID_PATTERN.test(after))
      return invalid('Invalid page cursor');
    const rows = await listMemberships(ctx.db, after, limit + 1, ctx.now);
    const page = rows.slice(0, limit);
    const nextAfter = rows.length > limit ? page[page.length - 1]!.id : null;
    return apiSuccess({ accounts: page, nextAfter });
  });
}
