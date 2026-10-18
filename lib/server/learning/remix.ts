/**
 * Course remixes. A member copies a preview or shared course into a new course of their own,
 * edits it, and may share it like any other course. The record ties the copy to the course it
 * came from, for the "Remix of" credit, the remix list on the original, and the original author's
 * share of reader rewards. Only the direct source is recorded: a remix of a remix credits the
 * remix it was made from.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

export interface RemixSource {
  sourceId: string;
  sourceTitle: string;
  /** Null when the source has no recorded owner (a preview staff added). */
  sourceOwnerId: string | null;
  /** The source author's username, when the source owner is an account. */
  sourceAuthor: string | null;
}

export async function recordRemix(
  db: AccountQueryable,
  input: {
    courseId: string;
    sourceId: string;
    sourceTitle: string;
    sourceOwnerId: string | null;
    remixerId: string;
    now: Date;
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO course_remixes (course_id, source_id, source_title, source_owner_id, remixer_id, created_at)
     VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::timestamptz)
     ON CONFLICT (course_id) DO NOTHING
     RETURNING course_id`,
    [
      input.courseId,
      input.sourceId,
      input.sourceTitle,
      input.sourceOwnerId,
      input.remixerId,
      input.now.toISOString(),
    ],
  );
  return result.rows.length > 0;
}

/** Remixes an account made in the 24 hours before `now`. */
export async function countRecentRemixes(
  db: AccountQueryable,
  remixerId: string,
  now: Date,
): Promise<number> {
  const result = await db.query(
    `SELECT count(*)::int AS n FROM course_remixes
      WHERE remixer_id = $1::text AND created_at > $2::timestamptz - interval '1 day'`,
    [remixerId, now.toISOString()],
  );
  return (result.rows[0] as { n: number }).n;
}

/** Where a course was remixed from, or undefined when it is not a remix. */
export async function readRemixSource(
  db: AccountQueryable,
  courseId: string,
): Promise<RemixSource | undefined> {
  const result = await db.query(
    `SELECT r.source_id, r.source_title, r.source_owner_id, a.username
       FROM course_remixes r
       LEFT JOIN accounts a ON 'acct:' || a.id = r.source_owner_id
      WHERE r.course_id = $1::text`,
    [courseId],
  );
  const row = result.rows[0] as
    | {
        source_id: string;
        source_title: string;
        source_owner_id: string | null;
        username: string | null;
      }
    | undefined;
  return row
    ? {
        sourceId: row.source_id,
        sourceTitle: row.source_title,
        sourceOwnerId: row.source_owner_id,
        sourceAuthor: row.username,
      }
    : undefined;
}

/** The remixes of a course that members can open (shared ones), newest first. */
export async function listSharedRemixes(
  db: AccountQueryable,
  sourceId: string,
): Promise<{ courseId: string; title: string; author: string }[]> {
  const result = await db.query(
    `SELECT r.course_id, s.title, a.username
       FROM course_remixes r
       JOIN course_shares s ON s.course_id = r.course_id AND s.state = 'shared'
       JOIN accounts a ON a.id = r.remixer_id
      WHERE r.source_id = $1::text
      ORDER BY r.created_at DESC
      LIMIT 50`,
    [sourceId],
  );
  return (result.rows as Array<{ course_id: string; title: string; username: string }>).map(
    (row) => ({ courseId: row.course_id, title: row.title, author: row.username }),
  );
}

/** Source titles of the given courses that are remixes, for the staff review queue. */
export async function readRemixSources(
  db: AccountQueryable,
  courseIds: string[],
): Promise<Map<string, { sourceId: string; sourceTitle: string }>> {
  if (courseIds.length === 0) return new Map();
  const result = await db.query(
    `SELECT course_id, source_id, source_title FROM course_remixes WHERE course_id = ANY($1::text[])`,
    [courseIds],
  );
  return new Map(
    (result.rows as Array<{ course_id: string; source_id: string; source_title: string }>).map(
      (row) => [row.course_id, { sourceId: row.source_id, sourceTitle: row.source_title }],
    ),
  );
}
