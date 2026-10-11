import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { validateScene } from '@openmaic/dsl';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { readBoundedJson } from '@/lib/server/bounded-json';
import {
  buildRequestOrigin,
  isAlreadyExistsError,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';
import { sanitizeSceneContent } from '@/lib/server/sanitize-scene-content';
import { createLogger } from '@/lib/logger';

const log = createLogger('Classroom API');

/** Shortest client-chosen classroom id that POST accepts. */
const CLIENT_CLASSROOM_ID_MIN_LENGTH = 16;

/** Largest classroom payload POST accepts. The app's own client never posts one; this bounds external callers. */
const CLASSROOM_CREATE_MAX_BYTES = 10 * 1024 * 1024;

function describeSceneIssue(issue: { path: string; message: string }): string {
  const at = issue.path && issue.path !== '' ? issue.path : '/';
  return `${at}: ${issue.message}`;
}

export async function POST(request: NextRequest) {
  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const read = await readBoundedJson(request, CLASSROOM_CREATE_MAX_BYTES);
    if (!read.ok) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        read.status,
        read.code === 'PAYLOAD_TOO_LARGE'
          ? `Classroom payload exceeds ${CLASSROOM_CREATE_MAX_BYTES} bytes`
          : 'Invalid JSON body',
      );
    }
    // The body is untrusted and each field is validated below, as it was when this was request.json().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = read.value;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }
    const { stage, scenes } = body;
    stageId = stage?.id;
    sceneCount = scenes?.length;

    if (!stage || !scenes) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: stage, scenes',
      );
    }

    if (typeof stage !== 'object' || Array.isArray(stage)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom stage');
    }
    if (!Array.isArray(scenes)) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Invalid classroom scenes: must be an array',
      );
    }

    // The scenes must already have the shape the slide DSL declares (id,
    // stageId, title, order, type and a content payload bound to that type).
    // Rejecting malformed scenes here keeps garbage out of storage instead of
    // letting viewers choke on it later.
    for (const [index, scene] of scenes.entries()) {
      const result = validateScene(scene);
      if (!result.valid) {
        const first = result.errors[0];
        return apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          400,
          `Invalid classroom scene at index ${index}`,
          first ? describeSceneIssue(first) : undefined,
        );
      }
    }

    // A non-string id would be coerced by the allowlist check below (["abc"] reads as "abc"), so refuse the type first.
    if (stage.id !== undefined && typeof stage.id !== 'string') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }
    const id = stage.id || randomUUID();

    // An id that fails the allowlist never reaches the filesystem: the storage
    // layer joins the id into CLASSROOMS_DIR, so a traversal-style id must be
    // rejected here with the same contract the read side already enforces.
    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }
    // A client-chosen id has to be hard to guess, since GET serves any classroom by id.
    // Generated ids are 36 characters and always pass. Existing shorter files stay readable.
    if (stage.id && stage.id.length < CLIENT_CLASSROOM_ID_MIN_LENGTH) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        `Classroom id must be at least ${CLIENT_CLASSROOM_ID_MIN_LENGTH} characters`,
      );
    }

    const baseUrl = buildRequestOrigin(request);

    // Sanitize every HTML-bearing string in the payload before it reaches
    // storage: stored slide HTML is restricted to the formatting vocabulary
    // the renderer produces (see sanitize-scene-content.ts).
    const safeStage = sanitizeSceneContent(stage);
    const safeScenes = sanitizeSceneContent(scenes);

    // The id comes from the client, so an existing classroom must never be
    // replaced through this route: create-only, and a taken id is a conflict.
    let persisted: Awaited<ReturnType<typeof persistClassroom>>;
    try {
      persisted = await persistClassroom(
        { id, stage: { ...safeStage, id }, scenes: safeScenes },
        baseUrl,
        { createOnly: true },
      );
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          409,
          'A classroom with this id already exists',
        );
      }
      throw error;
    }

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    log.error(
      `Classroom storage failed [stageId=${stageId ?? 'unknown'}, scenes=${sceneCount ?? 0}]:`,
      error,
    );
    // No detail in the response: storage errors carry absolute paths. The log above keeps them.
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to store classroom');
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    // Classroom files written before this change were stored unsanitized and
    // cannot be migrated on deployments we do not control. Run the same
    // sanitizer over the payload on the way out so already-stored content is
    // cleaned at the single serve choke point too.
    return apiSuccess({ classroom: sanitizeSceneContent(classroom) });
  } catch (error) {
    log.error(
      `Classroom retrieval failed [id=${request.nextUrl.searchParams.get('id') ?? 'unknown'}]:`,
      error,
    );
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to retrieve classroom');
  }
}
