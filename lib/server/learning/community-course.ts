/**
 * Which courses the community may discuss: free previews and courses shared with members. Their
 * titles are already public to every signed-in account, so a question on them leaks nothing. A
 * private or class-only course is not open to questions.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { isValidClassroomId, readClassroom } from '@/lib/server/classroom-storage';
import { isCoursePreview, readCourseShare } from '@/lib/server/learning/store';
import type { Scene } from '@/lib/types/stage';

export interface CommunityCourse {
  title: string;
  /** The course content, when it is stored as a classroom. Used as context for the AI answer. */
  scenes: Scene[];
}

export async function readCommunityCourse(
  db: AccountQueryable,
  courseId: string,
): Promise<CommunityCourse | undefined> {
  if (!isValidClassroomId(courseId)) return undefined;
  const [share, previewed] = await Promise.all([
    readCourseShare(db, courseId),
    isCoursePreview(db, courseId),
  ]);
  if (share?.state !== 'shared' && !previewed) return undefined;
  const classroom = await readClassroom(courseId);
  const title = share?.title ?? classroom?.stage.name ?? courseId;
  return { title, scenes: classroom?.scenes ?? [] };
}
