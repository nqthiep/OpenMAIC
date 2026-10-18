/**
 * GET /api/stages/[id]/status
 *
 * Returns the public-state metadata for a stage. Used by the Share menu CTA
 * to know whether to show "Publish" or "Already published · Unpublish".
 *
 * Answers only a caller who may read the course (owner, staff, or a course that is
 * published or shared with them); anyone else gets 404.
 *
 * Errors use the repo's apiError envelope (errorCode), like every other route.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { resolveStageAccess } from '@/lib/server/stage-access';
import { canReadStageDocument } from '@/lib/server/authz/viewer';
import { apiError } from '@/lib/server/api-response';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  // Published state belongs to a persisted course, so it follows persistence, not the agent runtime.
  if (!isServerPersistenceConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  const { id } = await params;
  try {
    const access = await resolveStageAccess(id);

    // Tombstoned and never-existed must be indistinguishable: this endpoint is
    // unauthenticated, so an answer other than plain 404 would let anyone
    // confirm that a given id used to be a real course.
    if (!access || !(await canReadStageDocument(req.headers, access))) {
      return apiError('NOT_FOUND', 404, 'Not found');
    }

    // Field names are the wire contract; they stay `isPublic` / `publishedAt`
    // regardless of which layer answered.
    return NextResponse.json({ isPublic: access.isPublic, publishedAt: access.publishedAt });
  } catch (error) {
    console.error('Failed to fetch stage status', {
      stageId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return apiError('INTERNAL_ERROR', 500, 'Internal error');
  }
}
