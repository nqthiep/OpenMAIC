import { requireSpender } from '@/lib/server/authz/viewer';
/** Agent runtime control plane for durable follow-up messages. */
import { assertWorkspaceModelsAuthorized } from '@/lib/server/model-config/runtime';
import { AgentSessionAccessError } from '@openmaic/storage';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { apiError } from '@/lib/server/api-response';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { MAX_SESSION_TEXT_LENGTH } from '@/lib/server/agent-runtime/limits';
import { getAgentSessionStore } from '@/lib/server/agent-runtime/store';
import { scheduleConversationTitle } from '@/lib/server/agent-runtime/conversation-title-task';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import {
  ownerRetiredResponseIfRetired,
  ownerWriteErrorResponse,
} from '@/lib/persistence/owner-merges';
import { decodeElementRefs } from '@/lib/workbench/element-refs';
import { decodeCourseRefs } from '@/lib/workbench/course-refs';
import { ownerApiError } from '@/lib/server/agent-runtime/route-response';
import {
  bindOwnerMaterialsToSession,
  SessionMaterialBindingError,
} from '@/lib/server/agent-runtime/session-materials';

export const runtime = 'nodejs';

/**
 * Largest message body, refused before it is buffered. The text and the element and course
 * refs each have their own caps, and together they fit under this one.
 */
const SESSION_MESSAGE_MAX_BYTES = 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  if (!isAgentRuntimeConfigured()) {
    return apiError('NOT_FOUND', 404, 'Not found');
  }

  return withRequestOwner(req, async ({ ownerId }, responseHeaders) => {
    const { id } = await params;
    const store = await getAgentSessionStore();
    const meta = await store.getSession(id);
    if (!meta || meta.ownerId !== ownerId) {
      return ownerApiError('NOT_FOUND', 404, 'Not found', responseHeaders);
    }

    const read = await readBoundedJson(req, SESSION_MESSAGE_MAX_BYTES);
    if (!read.ok) {
      const response = apiError(
        'INVALID_REQUEST',
        read.status,
        read.code === 'PAYLOAD_TOO_LARGE'
          ? `request body exceeds ${SESSION_MESSAGE_MAX_BYTES} bytes`
          : 'invalid JSON body',
      );
      responseHeaders.forEach((value, name) => response.headers.append(name, value));
      return response;
    }
    const body = (read.value ?? {}) as {
      text?: string;
      materialIds?: unknown;
      elementRefs?: unknown;
      courseRefs?: unknown;
    };

    const text = (body.text ?? '').toString().trim();
    if (
      body.materialIds !== undefined &&
      (!Array.isArray(body.materialIds) || body.materialIds.some((id) => typeof id !== 'string'))
    ) {
      const response = apiError('INVALID_REQUEST', 400, 'materialIds must be an array of strings');
      responseHeaders.forEach((value, name) => response.headers.append(name, value));
      return response;
    }
    const materialIds = [...new Set((body.materialIds ?? []).map((id: string) => id.trim()))];
    if (materialIds.length > 20 || materialIds.some((id) => !id)) {
      const response = apiError('INVALID_REQUEST', 400, 'materialIds are invalid');
      responseHeaders.forEach((value, name) => response.headers.append(name, value));
      return response;
    }
    const decodedElementRefs = decodeElementRefs(body.elementRefs ?? []);
    if (!decodedElementRefs.ok) {
      const response = apiError('INVALID_REQUEST', 400, decodedElementRefs.error);
      responseHeaders.forEach((value, name) => response.headers.append(name, value));
      return response;
    }
    const decodedCourseRefs = decodeCourseRefs(body.courseRefs ?? []);
    if (!decodedCourseRefs.ok) {
      const response = apiError('INVALID_REQUEST', 400, decodedCourseRefs.error);
      responseHeaders.forEach((value, name) => response.headers.append(name, value));
      return response;
    }
    if (!text && materialIds.length === 0) {
      const response = apiError('MISSING_REQUIRED_FIELD', 400, 'text is required');
      responseHeaders.forEach((value, name) => response.headers.append(name, value));
      return response;
    }
    if (text.length > MAX_SESSION_TEXT_LENGTH) {
      const response = apiError(
        'INVALID_REQUEST',
        400,
        `text exceeds the ${MAX_SESSION_TEXT_LENGTH} character limit`,
      );
      responseHeaders.forEach((value, name) => response.headers.append(name, value));
      return response;
    }

    await assertWorkspaceModelsAuthorized(ownerId, [
      'agent',
      'agent.title',
      'image',
      'video',
      'tts',
      'asr',
      'webSearch',
    ]);
    try {
      const materials = materialIds.length
        ? await bindOwnerMaterialsToSession(id, ownerId, materialIds)
        : [];
      const posted = await store.postUserMessage(
        id,
        {
          text,
          ...(materials.length ? { materials } : {}),
          ...(decodedElementRefs.refs.length ? { elementRefs: decodedElementRefs.refs } : {}),
          ...(decodedCourseRefs.refs.length ? { courseRefs: decodedCourseRefs.refs } : {}),
        },
        { expectedOwnerId: ownerId },
      );
      if (text) scheduleConversationTitle(id, ownerId);
      return NextResponse.json(
        {
          id,
          message: { seq: posted.seq, text, delivery: posted.delivery },
          elementRefsAccepted: decodedElementRefs.refs.length > 0,
          courseRefsAccepted: decodedCourseRefs.refs.length > 0,
        },
        { status: 202, headers: responseHeaders },
      );
    } catch (error) {
      if (error instanceof SessionMaterialBindingError) {
        return ownerApiError('NOT_FOUND', 404, 'Not found', responseHeaders);
      }
      if (error instanceof AgentSessionAccessError) {
        // A retired identity: the session moved with the claim.
        const retired = await ownerRetiredResponseIfRetired(ownerId, responseHeaders);
        if (retired) return retired;
        return ownerApiError('FORBIDDEN', 403, 'Forbidden', responseHeaders);
      }
      const claimed = ownerWriteErrorResponse(error, responseHeaders);
      if (claimed) return claimed;
      throw error;
    }
  });
}
