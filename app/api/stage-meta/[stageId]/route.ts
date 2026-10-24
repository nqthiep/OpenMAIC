/**
 * GET /api/stage-meta/[stageId] — the per-viewer facts a document does not carry
 * (the reference's stage-meta sidecar, ported onto this branch's owner model).
 *
 * The document seam returns a DOCUMENT: stage + scenes + outline, and nothing
 * about who is asking. The classroom branches on exactly that — `isOwner`
 * decides read-only vs editable — so the split is explicit: the document
 * carries content, this sidecar carries tenancy, and the client fetches both
 * in parallel.
 *
 * ## Everything here is fail-closed on the tombstone
 *
 * `resolveStageAccess` answers `null` for a deleted course exactly as it does
 * for one that never existed, so a deleted course 404s here too. This endpoint
 * is unauthenticated-friendly (any visitor may ask about any id), so if it
 * leaked `{isPublic: true}` for a tombstoned course it would be a public oracle
 * for "this course used to exist".
 *
 * ## No `ownerId` in the response, ever
 *
 * `isOwner` is a boolean derived server-side. Returning the owner's identity
 * key would hand every visitor a stable cross-course identifier for the author.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { getStageAccessDb, resolveStageAccess } from '@/lib/server/stage-access';
import { canReadClassroom, canReadStageDocument } from '@/lib/server/authz/viewer';
import {
  isValidClassroomId,
  readClassroom,
  readClassroomAccess,
} from '@/lib/server/classroom-storage';
import { apiError } from '@/lib/server/api-response';
import { ownerApiError } from '@/lib/server/agent-runtime/route-response';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

// Per-viewer and mutable on every publish/unpublish/delete: this response must
// never be cached, by Next or by anything in front of it.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ stageId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  // Gated on server persistence, NOT on the agent runtime. Ownership is
  // recorded by the persistence route (every request resolves an owner, and
  // the owner-bound document store writes a meta row for every course), so a
  // deployment running persistence without the runtime still has the fact this
  // endpoint reports. Gating on the runtime made this endpoint 404 for every
  // course in that configuration, which left its viewers with no ownership
  // signal at all — indistinguishable, to a client, from "this course has no
  // owner".
  if (!isServerPersistenceConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  return withRequestOwner(req, async ({ ownerId }, responseHeaders) => {
    const { stageId } = await params;
    try {
      const access = await resolveStageAccess(stageId);

      if (!access) {
        const fromFile = await classroomFileMeta(req.headers, stageId, ownerId);
        if (fromFile) return NextResponse.json(fromFile, { status: 200, headers: responseHeaders });
      }

      // Absent, tombstoned or not readable by this caller — indistinguishable, deliberately.
      if (
        !access ||
        (access.ownerId !== ownerId && !(await canReadStageDocument(req.headers, access)))
      ) {
        return ownerApiError('NOT_FOUND', 404, 'Not found', responseHeaders);
      }

      // Identity comparison, and nothing else: this boolean is the client's
      // ONLY owner signal, so a `true` here must mean every write through the
      // owner-bound store will be accepted (the store re-checks the owner
      // scope inside its write transactions).
      const isOwner = access.ownerId === ownerId;

      return NextResponse.json(
        {
          isOwner,
          isPublic: access.isPublic,
          publishedAt: access.publishedAt,
          generationComplete: access.generationComplete,
          // Which layer answered. Diagnostic only — the client must not branch
          // on it.
          source: access.source,
        },
        { status: 200, headers: responseHeaders },
      );
    } catch (error) {
      console.error('Failed to resolve stage meta', {
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

/**
 * A course generated on the server lives only in `data/classrooms/<id>.json` until its owner
 * first opens it, and only that owner may create its document (the persistence route's claim
 * gate). Without this answer a reader's page stayed editable and every save was refused, so the
 * file's recorded owner answers instead. Only while the id has no `stage_meta` or document row
 * at all: a tombstoned document stays a 404 even though its classroom file is still on disk.
 */
async function classroomFileMeta(headers: Headers, stageId: string, ownerId: string) {
  if (!isValidClassroomId(stageId) || !(await readClassroom(stageId))) return null;
  const db = await getStageAccessDb();
  const rows = await db.query(
    `SELECT 1 FROM stage_meta WHERE stage_id = $1
     UNION ALL SELECT 1 FROM document_stages WHERE id = $1 LIMIT 1`,
    [stageId],
  );
  if (rows.rows.length > 0 || !(await canReadClassroom(headers, stageId))) return null;
  return {
    isOwner: (await readClassroomAccess(stageId))?.ownerId === ownerId,
    isPublic: false,
    publishedAt: null,
    generationComplete: false,
    source: 'classroom',
  };
}
