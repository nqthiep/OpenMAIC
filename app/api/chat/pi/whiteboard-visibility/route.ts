import { NextRequest } from 'next/server';

import { settleWhiteboardVisibility } from '@/lib/chat/pi/whiteboard-visibility';
import { resolveLearnerKeyForRequest } from '@/lib/persistence/server-auth';
import { apiError } from '@/lib/server/api-response';
import { readBoundedJson } from '@/lib/server/bounded-json';

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
  // A signed-in caller settles only queries of its own account partition.
  // Anonymous callers keep the development binding. A session that cannot be
  // checked rejects here.
  const learnerKey = await resolveLearnerKeyForRequest(req.headers);
  if (!learnerKey) {
    return apiError('INVALID_CREDENTIALS', 401, 'Invalid persistence development binding');
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
      learnerKey,
    })
  ) {
    return apiError('INVALID_REQUEST', 404, 'Whiteboard visibility query is not pending here');
  }
  return new Response(null, { status: 204 });
}
