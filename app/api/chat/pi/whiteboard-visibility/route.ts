import { NextRequest } from 'next/server';

import { settleWhiteboardVisibility } from '@/lib/chat/pi/whiteboard-visibility';
import { apiError } from '@/lib/server/api-response';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { resolveRequestOwner } from '@/lib/server/identity/resolve';
import { invalidOwnerCredentialResponse } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

/** Largest visibility response body, refused before it is buffered. Three small fields. */
const VISIBILITY_REQUEST_MAX_BYTES = 1024 * 1024;

const BODY_KEYS = new Set(['queryId', 'stageId', 'visibility']);

function validBody(value: unknown): value is {
  queryId: string;
  stageId: string;
  visibility: 'open' | 'closed';
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (
    Reflect.ownKeys(body).every((key) => typeof key === 'string' && BODY_KEYS.has(key)) &&
    Object.hasOwn(body, 'queryId') &&
    Object.hasOwn(body, 'stageId') &&
    Object.hasOwn(body, 'visibility') &&
    typeof body.queryId === 'string' &&
    body.queryId.length > 0 &&
    typeof body.stageId === 'string' &&
    body.stageId.length > 0 &&
    (body.visibility === 'open' || body.visibility === 'closed')
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  // The pending query is keyed by the learner key the Pi request resolved,
  // which is the request owner; only that owner can settle it.
  const owner = await resolveRequestOwner(req);
  if (!owner.ok) {
    return invalidOwnerCredentialResponse(owner);
  }

  const read = await readBoundedJson(req, VISIBILITY_REQUEST_MAX_BYTES);
  if (!read.ok) {
    return read.code === 'PAYLOAD_TOO_LARGE'
      ? apiError(
          'PAYLOAD_TOO_LARGE',
          413,
          `request body exceeds ${VISIBILITY_REQUEST_MAX_BYTES} bytes`,
        )
      : apiError('INVALID_REQUEST', 400, 'Invalid whiteboard visibility response');
  }
  const body: unknown = read.value;
  if (!validBody(body)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid whiteboard visibility response');
  }

  if (
    !settleWhiteboardVisibility({
      ...body,
      learnerKey: owner.principal.ownerId,
    })
  ) {
    return apiError('INVALID_REQUEST', 404, 'Whiteboard visibility query is not pending here');
  }
  return new Response(null, { status: 204 });
}
