import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { getAgentSessionStore } from '@/lib/server/agent-runtime/store';
import { withRequestOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { apiError } from '@/lib/server/api-response';

export const runtime = 'nodejs';

/** Return a sparse status map for all sessions visible to this owner. */
export async function GET(req: NextRequest) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const store = await getAgentSessionStore();
    const sessions = await store.listSessionsByOwner(ownerId);
    const statuses = Object.fromEntries(sessions.map((session) => [session.id, session.status]));
    return NextResponse.json(statuses, { headers: responseHeaders });
  });
}
