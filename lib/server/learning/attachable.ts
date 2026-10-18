import type { AccountQueryable } from '@/lib/server/accounts/store';
import { effectiveRole, isAccountRole } from '@/lib/server/authz/roles';

/**
 * Which courses staff may attach to a class. Attaching opens a course to every member of the
 * class, so a learner's private course stays out until its owner shares it: only a shared course,
 * a free preview, or a course whose owner is an operator or administrator can be attached.
 */
export async function attachableCourseIds(
  db: AccountQueryable,
  courses: ReadonlyArray<{ courseId: string; ownerId?: string | null }>,
): Promise<Set<string>> {
  const open = await db.query(
    `SELECT course_id FROM course_shares WHERE state = 'shared'
     UNION SELECT course_id FROM course_previews`,
  );
  const result = new Set((open.rows as Array<{ course_id: string }>).map((row) => row.course_id));
  const accountIds = [
    ...new Set(
      courses
        .map((c) => c.ownerId)
        .filter((id): id is string => id?.startsWith('acct:') === true)
        .map((id) => id.slice('acct:'.length)),
    ),
  ];
  if (accountIds.length > 0) {
    const owners = await db.query(
      `SELECT id, username, role FROM accounts WHERE id = ANY($1::text[])`,
      [accountIds],
    );
    const staff = new Set(
      (owners.rows as Array<{ id: string; username: string; role: string }>)
        .filter(
          (row) => isAccountRole(row.role) && effectiveRole(row.username, row.role) !== 'learner',
        )
        .map((row) => `acct:${row.id}`),
    );
    for (const course of courses) {
      if (course.ownerId && staff.has(course.ownerId)) result.add(course.courseId);
    }
  }
  return result;
}
