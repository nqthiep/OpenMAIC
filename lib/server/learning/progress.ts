/**
 * Where each learner stopped in a course they read but did not write, kept per account and
 * course. The learner reads their own rows; staff read the rows of a class's members for the
 * courses attached to that class. A course is "done" once its last scene was reached; the mark
 * stays when the learner goes back.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

export interface ProgressRow {
  courseId: string;
  sceneId: string;
  /** 1-based position of the scene. */
  sceneIndex: number;
  sceneCount: number;
  /** Score of the last quiz submitted in the course, 0 to 100. */
  quizScore: number | null;
  doneAt: string | null;
  updatedAt: string;
}

export interface ClassProgressRow extends ProgressRow {
  accountId: string;
}

interface Stored {
  account_id: string;
  course_id: string;
  scene_id: string;
  scene_index: number;
  scene_count: number;
  quiz_score: number | null;
  done_at: Date | string | null;
  updated_at: Date | string;
}

const COLUMNS = `account_id, course_id, scene_id, scene_index, scene_count, quiz_score, done_at, updated_at`;
const P_COLUMNS = `p.account_id, p.course_id, p.scene_id, p.scene_index, p.scene_count, p.quiz_score, p.done_at, p.updated_at`;

/** Rows returned when the learner does not name courses: the ones studied last. */
export const OWN_PROGRESS_LIMIT = 20;

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function toRow(row: Stored): ProgressRow {
  return {
    courseId: row.course_id,
    sceneId: row.scene_id,
    sceneIndex: row.scene_index,
    sceneCount: row.scene_count,
    quizScore: row.quiz_score,
    doneAt: row.done_at ? iso(row.done_at) : null,
    updatedAt: iso(row.updated_at),
  };
}

/**
 * Records the scene the learner is on. A `quizScore` replaces the stored one; leaving it out
 * keeps the stored one. `doneAt` is set the first time the last scene is reached.
 */
export async function saveProgress(
  db: AccountQueryable,
  input: {
    accountId: string;
    courseId: string;
    sceneId: string;
    sceneIndex: number;
    sceneCount: number;
    quizScore?: number;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO course_progress
       (account_id, course_id, scene_id, scene_index, scene_count, quiz_score, done_at, updated_at)
     VALUES ($1::text, $2::text, $3::text, $4::int, $5::int, $6::int,
             CASE WHEN $4::int >= $5::int THEN $7::timestamptz END, $7::timestamptz)
     ON CONFLICT (account_id, course_id) DO UPDATE SET
       scene_id = EXCLUDED.scene_id,
       scene_index = EXCLUDED.scene_index,
       scene_count = EXCLUDED.scene_count,
       quiz_score = COALESCE(EXCLUDED.quiz_score, course_progress.quiz_score),
       done_at = COALESCE(course_progress.done_at, EXCLUDED.done_at),
       updated_at = EXCLUDED.updated_at`,
    [
      input.accountId,
      input.courseId,
      input.sceneId,
      input.sceneIndex,
      input.sceneCount,
      input.quizScore ?? null,
      input.now.toISOString(),
    ],
  );
}

/** The account's own rows: the named courses, or the ones studied last when none are named. */
export async function listOwnProgress(
  db: AccountQueryable,
  accountId: string,
  courseIds?: readonly string[],
): Promise<ProgressRow[]> {
  const result = courseIds
    ? await db.query(
        `SELECT ${COLUMNS} FROM course_progress
          WHERE account_id = $1::text AND course_id = ANY($2::text[])
          ORDER BY updated_at DESC`,
        [accountId, courseIds],
      )
    : await db.query(
        `SELECT ${COLUMNS} FROM course_progress
          WHERE account_id = $1::text ORDER BY updated_at DESC LIMIT $2::int`,
        [accountId, OWN_PROGRESS_LIMIT],
      );
  return (result.rows as Stored[]).map(toRow);
}

/** What the members of a class did in the courses attached to it, for staff. */
export async function listClassProgress(
  db: AccountQueryable,
  classId: string,
): Promise<ClassProgressRow[]> {
  const result = await db.query(
    `SELECT ${P_COLUMNS}
       FROM course_progress p
       JOIN class_members m ON m.account_id = p.account_id AND m.class_id = $1::text
       JOIN class_courses cc ON cc.course_id = p.course_id AND cc.class_id = $1::text
      ORDER BY p.account_id, p.updated_at DESC`,
    [classId],
  );
  return (result.rows as Stored[]).map((row) => ({ accountId: row.account_id, ...toRow(row) }));
}
