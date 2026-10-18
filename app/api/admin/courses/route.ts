import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { attachableCourseIds } from '@/lib/server/learning/attachable';
import { listAllCourses } from '@/lib/server/learning/courses';
import { authorize, learningRoute } from '@/lib/server/learning/http';

export const runtime = 'nodejs';

/**
 * Every course staff can open, with its owner's username (null for an anonymous or unrecorded
 * owner), so an operator can review a course and copy its ID for a preview. `attachable` says
 * whether it may be attached to a class (shared, preview, or owned by staff).
 */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'dashboard.view');
    if (refusal) return refusal;
    const courses = await listAllCourses();
    const accountIds = courses
      .map((c) => c.ownerId)
      .filter((id): id is string => id?.startsWith('acct:') === true)
      .map((id) => id.slice('acct:'.length));
    const names = new Map<string, string>();
    if (accountIds.length > 0) {
      const result = await ctx.db.query(
        `SELECT id, username FROM accounts WHERE id = ANY($1::text[])`,
        [accountIds],
      );
      for (const row of result.rows as Array<{ id: string; username: string }>) {
        names.set(`acct:${row.id}`, row.username);
      }
    }
    const attachable = await attachableCourseIds(ctx.db, courses);
    return apiSuccess({
      courses: courses.map(({ ownerId, ...course }) => ({
        ...course,
        owner: ownerId ? (names.get(ownerId) ?? null) : null,
        attachable: attachable.has(course.courseId),
      })),
    });
  });
}
