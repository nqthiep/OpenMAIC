/**
 * Community questions pinned to a course, or to one scene of it. A question gets an AI answer
 * first, then members answer and vote; the asker marks the best answer, and its author earns
 * reward tokens once per question. Moderation is after the fact: anyone signed in reports, staff
 * hide, lock and block posting.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

export const QUESTION_TITLE_MAX = 160;
export const QUESTION_BODY_MAX = 4000;
export const ANSWER_BODY_MAX = 4000;
export const REPORT_REASON_MAX = 300;
/** Tokens for the author of the answer the asker marks best, once per question. */
export const BEST_ANSWER_REWARD_TOKENS = 5_000;
/** Request body cap for community writes: the longest text in UTF-8 plus the JSON around it. */
export const COMMUNITY_REQUEST_BYTES = 32 * 1024;

export interface QuestionView {
  id: string;
  courseId: string;
  courseTitle: string;
  sceneId: string | null;
  sceneTitle: string | null;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  bestAnswerId: number | null;
  answerCount: number;
  /** Visible answers by members: `answerCount` without the AI answer and hidden ones. */
  humanAnswers: number;
  hidden: boolean;
  locked: boolean;
  createdAt: string;
  lastActivityAt: string;
}

export interface AnswerView {
  id: number;
  authorId: string | null;
  /** Null for the AI answer. */
  authorName: string | null;
  fromAi: boolean;
  body: string;
  votes: number;
  /** The viewer voted for it. */
  voted: boolean;
  hidden: boolean;
  createdAt: string;
}

interface QuestionRow {
  id: string;
  course_id: string;
  course_title: string;
  scene_id: string | null;
  scene_title: string | null;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  best_answer_id: number | string | null;
  answer_count: number;
  human_answers: number;
  hidden: boolean;
  locked: boolean;
  created_at: Date | string;
  last_activity_at: Date | string;
}

const HUMAN_ANSWERS = `(SELECT count(*) FROM course_answers h
  WHERE h.question_id = q.id AND NOT h.from_ai AND NOT h.hidden)`;

const QUESTION_COLUMNS = `q.id, q.course_id, q.course_title, q.scene_id, q.scene_title, q.author_id,
  a.username AS author_name, q.title, q.body, q.best_answer_id, q.answer_count,
  ${HUMAN_ANSWERS}::int AS human_answers, q.hidden, q.locked, q.created_at, q.last_activity_at`;

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function toQuestion(row: QuestionRow): QuestionView {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    sceneId: row.scene_id,
    sceneTitle: row.scene_title,
    authorId: row.author_id,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    bestAnswerId: row.best_answer_id === null ? null : Number(row.best_answer_id),
    answerCount: Number(row.answer_count),
    humanAnswers: Number(row.human_answers),
    hidden: row.hidden,
    locked: row.locked,
    createdAt: toIso(row.created_at),
    lastActivityAt: toIso(row.last_activity_at),
  };
}

export async function createQuestion(
  db: AccountQueryable,
  input: {
    id: string;
    courseId: string;
    courseTitle: string;
    sceneId: string | null;
    sceneTitle: string | null;
    authorId: string;
    title: string;
    body: string;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO course_questions
       (id, course_id, course_title, scene_id, scene_title, author_id, title, body, created_at, last_activity_at)
     VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::timestamptz, $9::timestamptz)`,
    [
      input.id,
      input.courseId,
      input.courseTitle,
      input.sceneId,
      input.sceneTitle,
      input.authorId,
      input.title,
      input.body,
      input.now.toISOString(),
    ],
  );
}

export const QUESTION_SORTS = ['active', 'new', 'top', 'waiting'] as const;
export type QuestionSort = (typeof QUESTION_SORTS)[number];

// A fixed list: the value is never taken from the request, only looked up by name.
const SORT_SQL: Record<QuestionSort, string> = {
  active: 'q.last_activity_at DESC, q.id',
  new: 'q.created_at DESC, q.id',
  top: `(SELECT COALESCE(sum(v.votes), 0) FROM course_answers v
          WHERE v.question_id = q.id AND NOT v.hidden) DESC, q.last_activity_at DESC, q.id`,
  waiting: `${HUMAN_ANSWERS} ASC, q.last_activity_at DESC, q.id`,
};

export interface QuestionFilter {
  courseId?: string;
  /** Only questions pinned to this scene. */
  sceneId?: string;
  authorId?: string;
  /** Only questions without a best answer. */
  unsolved?: boolean;
  /** Words to find in the title or body. */
  search?: string;
  /** Staff see hidden questions too. */
  includeHidden?: boolean;
  /** Default `active`: newest activity first. */
  sort?: QuestionSort;
  limit?: number;
  offset?: number;
}

/**
 * One page of questions in `filter.sort` order. Paging is by offset, so a question bumped between
 * two pages can be skipped or repeated: the client drops repeats by id.
 */
// ponytail: offset paging, move to a keyset cursor if a feed grows past a few thousand questions.
export async function listQuestions(
  db: AccountQueryable,
  filter: QuestionFilter,
): Promise<{ questions: QuestionView[]; hasMore: boolean }> {
  const search = filter.search?.trim();
  const limit = filter.limit ?? 100;
  const result = await db.query(
    `SELECT ${QUESTION_COLUMNS}
       FROM course_questions q JOIN accounts a ON a.id = q.author_id
      WHERE ($1::text IS NULL OR q.course_id = $1::text)
        AND ($2::text IS NULL OR q.author_id = $2::text)
        AND (NOT $3::boolean OR q.best_answer_id IS NULL)
        AND ($4::text IS NULL OR q.title ILIKE $4::text OR q.body ILIKE $4::text)
        AND ($5::boolean OR NOT q.hidden)
        AND ($7::text IS NULL OR q.scene_id = $7::text)
      ORDER BY ${SORT_SQL[filter.sort ?? 'active']}
      LIMIT $6::int OFFSET $8::int`,
    [
      filter.courseId ?? null,
      filter.authorId ?? null,
      filter.unsolved === true,
      search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
      filter.includeHidden === true,
      limit + 1,
      filter.sceneId ?? null,
      filter.offset ?? 0,
    ],
  );
  const rows = result.rows as QuestionRow[];
  return { questions: rows.slice(0, limit).map(toQuestion), hasMore: rows.length > limit };
}

export interface CommunityScene {
  sceneId: string;
  title: string;
  total: number;
  unsolved: number;
}

export interface CommunityScope {
  courseId: string;
  title: string;
  total: number;
  unsolved: number;
  lastActivityAt: string;
  scenes: CommunityScene[];
}

/**
 * The courses and scenes that have questions, with how many are open, newest activity first. It
 * feeds the scope picker of the feed, so a course with no question does not appear.
 */
// ponytail: one query capped at 2000 course/scene groups, no paging; add a search param if more.
export async function listCommunityScopes(
  db: AccountQueryable,
  options: { includeHidden: boolean },
): Promise<CommunityScope[]> {
  const result = await db.query(
    `SELECT q.course_id, q.scene_id,
            (array_agg(q.course_title ORDER BY q.last_activity_at DESC))[1] AS course_title,
            (array_agg(q.scene_title ORDER BY q.last_activity_at DESC))[1] AS scene_title,
            count(*)::int AS total,
            (count(*) FILTER (WHERE q.best_answer_id IS NULL))::int AS unsolved,
            max(q.last_activity_at) AS last_activity_at
       FROM course_questions q
      WHERE ($1::boolean OR NOT q.hidden)
      GROUP BY q.course_id, q.scene_id
      ORDER BY max(q.last_activity_at) DESC, q.course_id, q.scene_id
      LIMIT 2000`,
    [options.includeHidden],
  );
  const courses = new Map<string, CommunityScope>();
  for (const row of result.rows as Array<{
    course_id: string;
    scene_id: string | null;
    course_title: string;
    scene_title: string | null;
    total: number;
    unsolved: number;
    last_activity_at: Date | string;
  }>) {
    // Rows come newest first, so the first row of a course holds its latest title and activity.
    let course = courses.get(row.course_id);
    if (!course) {
      course = {
        courseId: row.course_id,
        title: row.course_title,
        total: 0,
        unsolved: 0,
        lastActivityAt: toIso(row.last_activity_at),
        scenes: [],
      };
      courses.set(row.course_id, course);
    }
    course.total += Number(row.total);
    course.unsolved += Number(row.unsolved);
    if (row.scene_id !== null) {
      course.scenes.push({
        sceneId: row.scene_id,
        title: row.scene_title ?? row.scene_id,
        total: Number(row.total),
        unsolved: Number(row.unsolved),
      });
    }
  }
  return [...courses.values()];
}

export async function readQuestion(
  db: AccountQueryable,
  id: string,
): Promise<QuestionView | undefined> {
  const result = await db.query(
    `SELECT ${QUESTION_COLUMNS}
       FROM course_questions q JOIN accounts a ON a.id = q.author_id
      WHERE q.id = $1::text`,
    [id],
  );
  const row = result.rows[0] as QuestionRow | undefined;
  return row ? toQuestion(row) : undefined;
}

/** The answers of a question: the AI answer first, then by votes, then oldest first. */
export async function listAnswers(
  db: AccountQueryable,
  input: { questionId: string; viewerId: string | undefined; includeHidden: boolean },
): Promise<AnswerView[]> {
  const result = await db.query(
    `SELECT c.id, c.author_id, a.username AS author_name, c.from_ai, c.body, c.votes, c.hidden,
            c.created_at,
            EXISTS (SELECT 1 FROM answer_votes v WHERE v.answer_id = c.id AND v.account_id = $2::text) AS voted
       FROM course_answers c LEFT JOIN accounts a ON a.id = c.author_id
      WHERE c.question_id = $1::text AND ($3::boolean OR NOT c.hidden)
      ORDER BY c.from_ai DESC, c.votes DESC, c.id`,
    [input.questionId, input.viewerId ?? null, input.includeHidden],
  );
  return (
    result.rows as Array<{
      id: number | string;
      author_id: string | null;
      author_name: string | null;
      from_ai: boolean;
      body: string;
      votes: number;
      hidden: boolean;
      created_at: Date | string;
      voted: boolean;
    }>
  ).map((row) => ({
    id: Number(row.id),
    authorId: row.author_id,
    authorName: row.from_ai ? null : row.author_name,
    fromAi: row.from_ai,
    body: row.body,
    votes: Number(row.votes),
    voted: row.voted,
    hidden: row.hidden,
    createdAt: toIso(row.created_at),
  }));
}

/**
 * Adds an answer and bumps the question's count and activity. The AI answer is at most one per
 * question: a second one is ignored. Returns the new answer id, or undefined when nothing was added.
 */
export async function addAnswer(
  db: AccountQueryable,
  input: { questionId: string; authorId: string | null; fromAi: boolean; body: string; now: Date },
): Promise<number | undefined> {
  const result = await db.query(
    `WITH answer AS (
       INSERT INTO course_answers (question_id, author_id, from_ai, body, created_at)
       VALUES ($1::text, $2::text, $3::boolean, $4::text, $5::timestamptz)
       ON CONFLICT DO NOTHING
       RETURNING id, question_id
     ), bumped AS (
       UPDATE course_questions SET answer_count = answer_count + 1, last_activity_at = $5::timestamptz
       WHERE id = (SELECT question_id FROM answer)
       RETURNING id
     )
     SELECT id FROM answer`,
    [input.questionId, input.authorId, input.fromAi, input.body, input.now.toISOString()],
  );
  const row = result.rows[0] as { id: number | string } | undefined;
  return row ? Number(row.id) : undefined;
}

export async function hasAiAnswer(db: AccountQueryable, questionId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM course_answers WHERE question_id = $1::text AND from_ai`,
    [questionId],
  );
  return result.rows.length > 0;
}

export async function readAnswer(
  db: AccountQueryable,
  id: number,
): Promise<{ questionId: string; authorId: string | null; fromAi: boolean } | undefined> {
  const result = await db.query(
    `SELECT question_id, author_id, from_ai FROM course_answers WHERE id = $1::bigint`,
    [id],
  );
  const row = result.rows[0] as
    | { question_id: string; author_id: string | null; from_ai: boolean }
    | undefined;
  return row
    ? { questionId: row.question_id, authorId: row.author_id, fromAi: row.from_ai }
    : undefined;
}

/**
 * Marks the best answer, or clears it with null. The first time a member's answer (not the AI's
 * and not the asker's own) is marked, the question is flagged rewarded and the author to credit
 * is returned; later changes return undefined, so one question pays out once.
 */
export async function setBestAnswer(
  db: AccountQueryable,
  input: { questionId: string; answerId: number | null },
): Promise<{ ok: boolean; rewardAuthorId?: string }> {
  if (input.answerId === null) {
    const cleared = await db.query(
      `UPDATE course_questions SET best_answer_id = NULL WHERE id = $1::text RETURNING id`,
      [input.questionId],
    );
    return { ok: cleared.rows.length > 0 };
  }
  const result = await db.query(
    `WITH target AS (
       SELECT c.id, c.author_id, c.from_ai, q.author_id AS asker_id, q.rewarded
         FROM course_answers c JOIN course_questions q ON q.id = c.question_id
        WHERE c.id = $2::bigint AND c.question_id = $1::text AND NOT c.hidden
     ), marked AS (
       UPDATE course_questions q SET
         best_answer_id = t.id,
         rewarded = q.rewarded OR (NOT t.from_ai AND t.author_id IS DISTINCT FROM t.asker_id)
       FROM target t
       WHERE q.id = $1::text
       RETURNING (NOT t.rewarded AND NOT t.from_ai AND t.author_id IS DISTINCT FROM t.asker_id) AS pays,
                 t.author_id
     )
     SELECT pays, author_id FROM marked`,
    [input.questionId, input.answerId],
  );
  const row = result.rows[0] as { pays: boolean; author_id: string | null } | undefined;
  if (!row) return { ok: false };
  return { ok: true, rewardAuthorId: row.pays && row.author_id ? row.author_id : undefined };
}

/** Adds or removes the viewer's vote. Returns the answer's new count and whether it is voted. */
export async function toggleVote(
  db: AccountQueryable,
  input: { answerId: number; accountId: string },
): Promise<{ votes: number; voted: boolean }> {
  const removed = await db.query(
    `DELETE FROM answer_votes WHERE answer_id = $1::bigint AND account_id = $2::text RETURNING answer_id`,
    [input.answerId, input.accountId],
  );
  const voted = removed.rows.length === 0;
  if (voted) {
    await db.query(
      `INSERT INTO answer_votes (answer_id, account_id) VALUES ($1::bigint, $2::text) ON CONFLICT DO NOTHING`,
      [input.answerId, input.accountId],
    );
  }
  // Recounted rather than incremented, so concurrent toggles cannot drift.
  const counted = await db.query(
    `UPDATE course_answers SET votes = (SELECT count(*) FROM answer_votes WHERE answer_id = $1::bigint)
      WHERE id = $1::bigint RETURNING votes`,
    [input.answerId],
  );
  return { votes: Number((counted.rows[0] as { votes: number }).votes), voted };
}

export async function setQuestionFlags(
  db: AccountQueryable,
  id: string,
  flags: { hidden?: boolean; locked?: boolean },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE course_questions SET hidden = COALESCE($2::boolean, hidden), locked = COALESCE($3::boolean, locked)
      WHERE id = $1::text RETURNING id`,
    [id, flags.hidden ?? null, flags.locked ?? null],
  );
  return result.rows.length > 0;
}

export async function setAnswerHidden(
  db: AccountQueryable,
  id: number,
  hidden: boolean,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE course_answers SET hidden = $2::boolean WHERE id = $1::bigint RETURNING id`,
    [id, hidden],
  );
  return result.rows.length > 0;
}

// ── Reports and posting blocks ─────────────────────────────────────────────

export type ReportKind = 'question' | 'answer';

/** Records a report. A second report of the same item by the same account is ignored. */
export async function addReport(
  db: AccountQueryable,
  input: { kind: ReportKind; targetId: string; reporterId: string; reason: string; now: Date },
): Promise<void> {
  await db.query(
    `INSERT INTO community_reports (target_kind, target_id, reporter_id, reason, created_at)
     VALUES ($1::text, $2::text, $3::text, $4::text, $5::timestamptz)
     ON CONFLICT (target_kind, target_id, reporter_id) DO NOTHING`,
    [input.kind, input.targetId, input.reporterId, input.reason, input.now.toISOString()],
  );
}

export interface ReportedItem {
  kind: ReportKind;
  targetId: string;
  /** The question the item belongs to (itself for a question). */
  questionId: string;
  questionTitle: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  hidden: boolean;
  reports: number;
  reasons: string[];
  firstReportedAt: string;
}

/** Items with unresolved reports, the most reported first. */
export async function listOpenReports(db: AccountQueryable, limit = 100): Promise<ReportedItem[]> {
  const result = await db.query(
    `WITH open AS (
       SELECT target_kind, target_id, count(*)::int AS reports,
              array_agg(reason ORDER BY created_at) AS reasons, min(created_at) AS first_at
         FROM community_reports WHERE resolved_at IS NULL
        GROUP BY target_kind, target_id
     )
     SELECT o.target_kind, o.target_id, o.reports, o.reasons, o.first_at,
            COALESCE(qa.question_id, q.id) AS question_id,
            COALESCE(qq.title, q.title) AS question_title,
            COALESCE(qa.body, q.body) AS body,
            COALESCE(qa.author_id, q.author_id) AS author_id,
            COALESCE(qa.hidden, q.hidden) AS hidden,
            u.username AS author_name
       FROM open o
       LEFT JOIN course_questions q ON o.target_kind = 'question' AND q.id = o.target_id
       LEFT JOIN course_answers qa ON o.target_kind = 'answer' AND qa.id::text = o.target_id
       LEFT JOIN course_questions qq ON qq.id = qa.question_id
       LEFT JOIN accounts u ON u.id = COALESCE(qa.author_id, q.author_id)
      WHERE q.id IS NOT NULL OR qa.id IS NOT NULL
      ORDER BY o.reports DESC, o.first_at
      LIMIT $1::int`,
    [limit],
  );
  return (
    result.rows as Array<{
      target_kind: ReportKind;
      target_id: string;
      reports: number;
      reasons: string[];
      first_at: Date | string;
      question_id: string;
      question_title: string;
      body: string;
      author_id: string | null;
      hidden: boolean;
      author_name: string | null;
    }>
  ).map((row) => ({
    kind: row.target_kind,
    targetId: row.target_id,
    questionId: row.question_id,
    questionTitle: row.question_title,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    hidden: row.hidden,
    reports: Number(row.reports),
    reasons: row.reasons,
    firstReportedAt: toIso(row.first_at),
  }));
}

export async function resolveReports(
  db: AccountQueryable,
  input: { kind: ReportKind; targetId: string; actorId: string; now: Date },
): Promise<void> {
  await db.query(
    `UPDATE community_reports SET resolved_at = $4::timestamptz, resolved_by = $3::text
      WHERE target_kind = $1::text AND target_id = $2::text AND resolved_at IS NULL`,
    [input.kind, input.targetId, input.actorId, input.now.toISOString()],
  );
}

/** Items with unresolved reports. For the staff attention list. */
export async function countOpenReports(db: AccountQueryable): Promise<number> {
  const result = await db.query(
    `SELECT count(DISTINCT (target_kind, target_id))::int AS n FROM community_reports WHERE resolved_at IS NULL`,
  );
  return (result.rows[0] as { n: number }).n;
}

export async function isBanned(db: AccountQueryable, accountId: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM community_bans WHERE account_id = $1::text`, [
    accountId,
  ]);
  return result.rows.length > 0;
}

/** Blocks or unblocks an account from posting, with an audit record in the same statement. */
export async function setBan(
  db: AccountQueryable,
  input: { accountId: string; banned: boolean; actorId: string; reason?: string; now: Date },
): Promise<void> {
  const now = input.now.toISOString();
  if (input.banned) {
    await db.query(
      `WITH ban AS (
         INSERT INTO community_bans (account_id, banned_by, reason, created_at)
         VALUES ($1::text, $2::text, $3::text, $4::timestamptz)
         ON CONFLICT (account_id) DO NOTHING
         RETURNING account_id
       )
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, account_id, 'community:ban', $3::text, $4::timestamptz FROM ban`,
      [input.accountId, input.actorId, input.reason ?? null, now],
    );
  } else {
    await db.query(
      `WITH lifted AS (
         DELETE FROM community_bans WHERE account_id = $1::text RETURNING account_id
       )
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, account_id, 'community:unban', NULL, $3::timestamptz FROM lifted`,
      [input.accountId, input.actorId, now],
    );
  }
}

export async function listBans(
  db: AccountQueryable,
): Promise<{ accountId: string; username: string; reason: string | null; createdAt: string }[]> {
  const result = await db.query(
    `SELECT b.account_id, a.username, b.reason, b.created_at
       FROM community_bans b JOIN accounts a ON a.id = b.account_id
      ORDER BY b.created_at DESC`,
  );
  return (
    result.rows as Array<{
      account_id: string;
      username: string;
      reason: string | null;
      created_at: Date | string;
    }>
  ).map((row) => ({
    accountId: row.account_id,
    username: row.username,
    reason: row.reason,
    createdAt: toIso(row.created_at),
  }));
}
