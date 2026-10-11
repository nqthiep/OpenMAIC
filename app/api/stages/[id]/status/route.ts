/**
 * GET /api/stages/[id]/status
 *
 * Returns the public-state metadata for a stage. Used by the Share menu CTA
 * to know whether to show "Publish" or "Already published · Unpublish".
 *
 * Anyone may read the flag of a published course. Any other caller, a visitor
 * to a private draft included, gets the same 404 as for an id no course holds,
 * so the answer never confirms that a draft exists.
 *
 * Convention: snake_case error codes (e.g. `not_found`, `internal_error`).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { resolveStageAccess } from '@/lib/server/stage-access';

// Answers per viewer and changes on every publish/unpublish: never cache it.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async ({ ownerId }, responseHeaders) => {
    const { id } = await params;
    try {
      const access = await resolveStageAccess(id);

      // Tombstoned, never-existed and another owner's draft must be
      // indistinguishable: the same plain 404.
      if (!access || (access.ownerId !== ownerId && !access.isPublic)) {
        return NextResponse.json({ error: 'not_found' }, { status: 404, headers: responseHeaders });
      }

      // Field names are the wire contract; they stay `isPublic` / `publishedAt`
      // regardless of which layer answered.
      return NextResponse.json(
        { isPublic: access.isPublic, publishedAt: access.publishedAt },
        { status: 200, headers: responseHeaders },
      );
    } catch (error) {
      console.error('Failed to fetch stage status', {
        stageId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'internal_error' },
        { status: 500, headers: responseHeaders },
      );
    }
  });
}
