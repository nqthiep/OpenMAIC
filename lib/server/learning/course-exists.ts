import { createLogger } from '@/lib/logger';
import { readClassroom } from '@/lib/server/classroom-storage';
import { resolveStageAccess } from '@/lib/server/stage-access';

const log = createLogger('CourseExists');

/**
 * Whether a course can be opened at `/classroom/<id>`: a stored classroom file, or a live (not
 * deleted) server document. Staff actions that point learners at a course (preview, attach to a
 * class) check it first, so a typo or a deleted course never reaches the catalog.
 */
export async function courseExists(courseId: string): Promise<boolean> {
  if ((await readClassroom(courseId)) !== null) return true;
  try {
    return (await resolveStageAccess(courseId)) !== null;
  } catch (error) {
    // A deployment with accounts but without server persistence has no document tables.
    log.warn('Course document lookup failed', error instanceof Error ? error.message : error);
    return false;
  }
}
