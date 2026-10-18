/**
 * /api/stages/[id] — read, rename, save, and delete one owned course document.
 *
 * Ownership is enforced by the store itself, not by a pre-check: every read
 * and write goes through the owner-bound document store, so a foreign or
 * missing id answers the identical 404 (the no-existence-oracle posture of
 * the agent-runtime routes), and a write into a foreign document is refused
 * inside the store's transaction (`persistStage` re-checks the owner scope).
 *
 * - GET    returns the whole document (stage + scenes + outline).
 * - PATCH  renames the course ({ name }), the reference's update path.
 * - PUT    saves a whole document ({ stage, scenes, outline? }) — the coarse
 *          "update stage document" write the UI saves through; the server
 *          bumps `stage.updatedAt` so the freshness signal sees the change.
 * - DELETE removes the course and its cascading child rows.
 *
 * The configured runtime gates the family (see `app/api/stages/route.ts`):
 * off, or on without a DATABASE_URL, answers the same plain 404.
 */
import type { NextRequest } from 'next/server';

import { DocumentNotFoundError, DocumentVersionError, type MaicDocument } from '@openmaic/storage';

import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { apiError } from '@/lib/server/api-response';
import { canReadStageById } from '@/lib/server/authz/viewer';
import { getOwnerScopedDocumentStore } from '@/lib/server/agent-runtime/owner-scoped-documents';
import { ownerApiError, ownerJson, ownerNotFound } from '@/lib/server/agent-runtime/route-response';
import { withRequestOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { STAGE_NAME_MAX_LENGTH } from '@/lib/server/agent-runtime/stage-limits';
import { readBoundedJson } from '@/lib/server/bounded-json';

export const runtime = 'nodejs';

/** Largest rename body, refused before it is buffered. The app sends one name. */
const STAGE_RENAME_MAX_BYTES = 1024 * 1024;
/** Largest document save body, refused before it is buffered. A whole course document. */
const STAGE_SAVE_MAX_BYTES = 10 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

/** A save refused because the payload is not a structurally valid document. */
function isStoreValidationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith('@openmaic/storage:') &&
    !(error instanceof DocumentNotFoundError) &&
    !(error instanceof DocumentVersionError)
  );
}

/** Map a store save failure onto the route's error surface. */
function mapSaveError(error: unknown, headers: Headers) {
  if (error instanceof DocumentNotFoundError) return ownerNotFound(headers);
  if (error instanceof DocumentVersionError) {
    // A document written by a newer client cannot be saved by this one.
    return ownerApiError(
      'INVALID_REQUEST',
      400,
      'document was written by a newer client; reload before saving',
      headers,
      error.message,
    );
  }
  if (isStoreValidationError(error)) {
    return ownerApiError('INVALID_REQUEST', 400, 'invalid stage document', headers, error.message);
  }
  throw error;
}

// GET /api/stages/[id] — the full document.
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const { id } = await params;
    if (!(await canReadStageById(req.headers, id, ownerId))) return ownerNotFound(responseHeaders);
    const store = await getOwnerScopedDocumentStore(ownerId);
    const document = await store.loadDocument(id);
    if (!document) return ownerNotFound(responseHeaders);
    return ownerJson(document, 200, responseHeaders);
  });
}

// PATCH /api/stages/[id] — rename the course (owner-only).
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  const renameRead = await readBoundedJson(req, STAGE_RENAME_MAX_BYTES);
  if (!renameRead.ok) {
    return renameRead.code === 'PAYLOAD_TOO_LARGE'
      ? apiError('PAYLOAD_TOO_LARGE', 413, `request body exceeds ${STAGE_RENAME_MAX_BYTES} bytes`)
      : apiError('INVALID_REQUEST', 400, 'invalid JSON body');
  }
  const renameBody: unknown = renameRead.value;
  const rawName = (renameBody as { name?: unknown })?.name;
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return apiError('INVALID_REQUEST', 400, 'name must be a non-empty string');
  }
  const name = rawName.trim();
  if (name.length > STAGE_NAME_MAX_LENGTH) {
    return apiError(
      'INVALID_REQUEST',
      400,
      `name exceeds the ${STAGE_NAME_MAX_LENGTH} character limit`,
    );
  }

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const { id } = await params;
    const store = await getOwnerScopedDocumentStore(ownerId);
    const document = await store.loadDocument(id);
    if (!document) return ownerNotFound(responseHeaders);
    try {
      await store.saveDocument({
        ...document,
        stage: { ...document.stage, name, updatedAt: Date.now() },
      });
    } catch (error) {
      return mapSaveError(error, responseHeaders);
    }
    return ownerJson({ success: true, name }, 200, responseHeaders);
  });
}

// PUT /api/stages/[id] — save a whole document.
export async function PUT(req: NextRequest, { params }: Params) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  const saveRead = await readBoundedJson(req, STAGE_SAVE_MAX_BYTES);
  if (!saveRead.ok) {
    return saveRead.code === 'PAYLOAD_TOO_LARGE'
      ? apiError('PAYLOAD_TOO_LARGE', 413, `request body exceeds ${STAGE_SAVE_MAX_BYTES} bytes`)
      : apiError('INVALID_REQUEST', 400, 'invalid JSON body');
  }
  const saveBody: unknown = saveRead.value;
  const candidate = saveBody as {
    stage?: { id?: unknown; updatedAt?: unknown };
    scenes?: unknown;
  };
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof candidate.stage !== 'object' ||
    candidate.stage === null ||
    typeof candidate.stage.id !== 'string' ||
    !Array.isArray(candidate.scenes)
  ) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'request body must be a stage document with `stage` and `scenes`',
    );
  }

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const { id } = await params;
    if (candidate.stage!.id !== id) {
      return ownerApiError(
        'INVALID_REQUEST',
        400,
        'document stage id does not match the requested stage',
        responseHeaders,
      );
    }
    const store = await getOwnerScopedDocumentStore(ownerId);
    // Save is existence-gated (the reference's update path is too): PUT
    // updates a course that exists; it must not resurrect a deleted one or
    // mint a course under a client-chosen id. The owner scope is re-checked
    // inside the write transaction, so a foreign id still refuses there.
    const existing = await store.loadDocument(id);
    if (!existing) return ownerNotFound(responseHeaders);
    try {
      // The server is authoritative for "last modified": bumping updatedAt
      // keeps the manifest/freshness signal accurate for this route's writes.
      // The full payload is validated inside the store before anything is
      // persisted (invalid stage/scene shapes throw and map to 400 below).
      await store.saveDocument({
        ...(saveBody as MaicDocument),
        stage: { ...(saveBody as MaicDocument).stage, updatedAt: Date.now() },
      });
    } catch (error) {
      return mapSaveError(error, responseHeaders);
    }
    return ownerJson({ success: true }, 200, responseHeaders);
  });
}

// DELETE /api/stages/[id] — remove the course and its scenes/outline.
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const { id } = await params;
    const store = await getOwnerScopedDocumentStore(ownerId);
    await store.deleteDocument(id);
    return ownerJson({ ok: true }, 200, responseHeaders);
  });
}
