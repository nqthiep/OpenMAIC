/**
 * POST /api/learn/start — the student door: create a course from a catalog walkthrough (and its
 * practice quiz) for the caller, no agent session and no LLM call.
 *
 * Same seam as `POST /api/stages`: the owner resolves through `withRequestOwner` and the write goes
 * through the owner-bound document store, so the course belongs to this browser's owner only.
 * Validation runs before owner resolution so a malformed body never mints an anonymous owner.
 */
import type { NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';

import { isDocumentWriteRefusedError } from '@openmaic/storage';

import { isCodeWidgetAllowed, isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { ownerWriteErrorResponse } from '@/lib/persistence/owner-merges';
import { getOwnerScopedDocumentStore } from '@/lib/server/agent-runtime/owner-scoped-documents';
import { ownerApiError, ownerJson } from '@/lib/server/agent-runtime/route-response';
import { apiError } from '@/lib/server/api-response';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { buildLesson, cleanNickname, type LessonMode } from '@/lib/tutor/door/lesson';
import { walkthroughProvider, widgetRegistry } from '@/lib/widgets';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'invalid JSON body');
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof b.walkthroughId !== 'string' || b.walkthroughId === '') {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'walkthroughId is required');
  }
  if (b.presetId !== undefined && typeof b.presetId !== 'string') {
    return apiError('INVALID_REQUEST', 400, 'presetId must be a string');
  }
  const mode: LessonMode = b.mode === 'practice' ? 'practice' : 'lesson';

  const result = buildLesson(
    {
      walkthroughId: b.walkthroughId,
      ...(typeof b.presetId === 'string' ? { presetId: b.presetId } : {}),
      locale: b.locale === 'en-US' ? 'en-US' : 'vi-VN',
      mode,
      nickname: cleanNickname(b.nickname),
    },
    {
      findWalkthrough: (id) => widgetRegistry.findWalkthrough(id),
      provider: walkthroughProvider,
      codeAllowed: isCodeWidgetAllowed(),
      now: Date.now,
      token: () => randomBytes(9).toString('base64url'),
    },
  );
  if (!result.ok) {
    const status = result.error === 'build-failed' ? 500 : result.error === 'blocked' ? 403 : 404;
    return apiError('INVALID_REQUEST', status, result.message);
  }

  return withRequestOwner(req, async (principal, responseHeaders) => {
    const store = await getOwnerScopedDocumentStore(principal);
    try {
      await store.saveDocument(result.document);
    } catch (error) {
      const claimed = ownerWriteErrorResponse(error, responseHeaders);
      if (claimed) return claimed;
      if (isDocumentWriteRefusedError(error)) {
        return ownerApiError('CREATE_REFUSED', 403, error.message, responseHeaders);
      }
      throw error;
    }
    return ownerJson(
      { stageId: result.stageId, url: `/classroom/${result.stageId}` },
      201,
      responseHeaders,
    );
  });
}
