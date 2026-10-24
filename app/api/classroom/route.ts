/**
 * GET /api/classroom?id=... — reads a classroom stored as a file (a published or remixed copy, or a
 * classroom older than server-side generation), under KHAITAM's read rule.
 *
 * Upstream removed this route in 1.2 (courses are documents in the owner's library). KHAITAM keeps
 * the read side because shared and remixed courses are stored as files with an owner record.
 * There is no POST: nothing in the app creates a classroom file through HTTP.
 */
import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { canReadClassroom, rewardReaderIfEligible } from '@/lib/server/authz/viewer';
import { isValidClassroomId, readClassroom } from '@/lib/server/classroom-storage';
import { sanitizeSceneContent } from '@/lib/server/sanitize-scene-content';
import { createLogger } from '@/lib/logger';

const log = createLogger('Classroom API');

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

    // A classroom the caller may not read is reported as missing, so the id is not an oracle.
    if (!(await canReadClassroom(request.headers, id))) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }
    // The first read of a shared course by a member credits its author. Never blocks the read.
    await rewardReaderIfEligible(request.headers, id);

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
