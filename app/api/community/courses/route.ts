import type { NextRequest } from 'next/server';

import { apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { listCommunityScopes } from '@/lib/server/learning/community';
import { authorize, learningRoute } from '@/lib/server/learning/http';

export const runtime = 'nodejs';

/**
 * The courses and scenes that have questions, with how many are open, newest activity first.
 * The feed's scope picker reads it. Course titles are already public to every signed-in account.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'community.read');
    if (refusal) return refusal;
    const courses = await listCommunityScopes(ctx.db, {
      includeHidden: can(ctx.viewer, 'community.moderate'),
    });
    return apiSuccess({ courses });
  });
}
