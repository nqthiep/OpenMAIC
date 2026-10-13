/**
 * POST /api/stages/[id]/publish — make a document-backed course public.
 *
 * Owner-only; anonymous owners are refused with the reference's
 * `login_required` (a published course is a durable public artifact, so it
 * needs a real account, not an anonymous cookie partition).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { setStagePublished } from '@/lib/persistence/stage-meta';
import { getStageAccessDb, resolveStageAccess } from '@/lib/server/stage-access';
import { withRequestOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { apiError } from '@/lib/server/api-response';
import { ownerApiError } from '@/lib/server/agent-runtime/route-response';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const { id: stageId } = await params;
    try {
      if (ownerId.startsWith('anon:')) {
        return NextResponse.json(
          { error: 'login_required' },
          { status: 401, headers: responseHeaders },
        );
      }

      const access = await resolveStageAccess(stageId);
      if (!access) {
        return ownerApiError('NOT_FOUND', 404, 'Not found', responseHeaders);
      }
      if (access.ownerId !== ownerId) {
        return ownerApiError('FORBIDDEN', 403, 'Forbidden', responseHeaders);
      }

      if (access.isPublic) {
        return NextResponse.json(
          { success: true, publishedAt: access.publishedAt, name: access.name },
          { status: 200, headers: responseHeaders },
        );
      }

      const publishedAt = Date.now();
      const db = await getStageAccessDb();
      await setStagePublished(db, stageId, true, publishedAt);

      console.info('Stage published', { stageId, ownerId });
      return NextResponse.json(
        { success: true, publishedAt, name: access.name },
        { status: 200, headers: responseHeaders },
      );
    } catch (error) {
      console.error('Failed to publish stage', {
        stageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'internal_error' },
        { status: 500, headers: responseHeaders },
      );
    }
  });
}
