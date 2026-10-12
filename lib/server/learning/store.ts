/**
 * Storage for membership, course sharing, previews, classes, reader rewards and badges.
 * Every change that an operator or administrator makes is written to the audit table in the
 * same statement, so the change and its record succeed or fail together.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

/** Defaults set by the product decisions in plans/access-control.md. Tune them there. */
export const DEFAULT_MONTHLY_QUOTA_TOKENS = 1_000_000;
/** Tokens credited to an author for each distinct member who reads a shared course. */
export const READER_REWARD_TOKENS = 20_000;
/** Most reward tokens one author can receive in one month. */
export const MONTHLY_REWARD_CAP_TOKENS = 200_000;
/** Distinct readers across an author's shared courses that earn a badge. */
export const BADGE_THRESHOLDS: readonly { readers: number; code: string }[] = [
  { readers: 10, code: 'readers-10' },
  { readers: 100, code: 'readers-100' },
];

export type MembershipStatus = 'active' | 'suspended';
export type ShareState = 'pending' | 'shared';

export interface MembershipView {
  status: MembershipStatus;
  /** True when the membership is not suspended and has not expired. */
  active: boolean;
  expiresAt: string;
  monthlyQuota: number;
}

interface MembershipRow {
  status: MembershipStatus;
  expires_at: Date | string;
  monthly_token_quota: number | string;
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** The membership of one account, or undefined when it never had one. */
export async function readMembership(
  db: AccountQueryable,
  accountId: string,
  now: Date,
): Promise<MembershipView | undefined> {
  const result = await db.query(
    `SELECT status, expires_at, monthly_token_quota FROM memberships WHERE account_id = $1::text`,
    [accountId],
  );
  const row = result.rows[0] as MembershipRow | undefined;
  if (!row) return undefined;
  const expiresAt = new Date(row.expires_at);
  return {
    status: row.status,
    active: row.status === 'active' && expiresAt.getTime() > now.getTime(),
    expiresAt: expiresAt.toISOString(),
    monthlyQuota: Number(row.monthly_token_quota),
  };
}

/**
 * Grants a membership, or extends a running one by `days` from its current expiry. Sets the
 * monthly quota and makes the membership active. Returns false when the account does not exist.
 */
export async function grantMembership(
  db: AccountQueryable,
  input: {
    actorId: string;
    targetId: string;
    days: number;
    monthlyQuota: number;
    reason: string | undefined;
    now: Date;
  },
): Promise<boolean> {
  const startsAt = new Date(input.now.getTime() + input.days * 86_400_000).toISOString();
  const result = await db.query(
    `WITH member AS (
       INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by, granted_at)
       VALUES ($1::text, 'active', $2::timestamptz, $3::bigint, $4::text, $5::timestamptz)
       ON CONFLICT (account_id) DO UPDATE SET
         status = 'active',
         expires_at = CASE
           WHEN memberships.expires_at > $5::timestamptz
             THEN memberships.expires_at + make_interval(days => $6::int)
           ELSE $2::timestamptz
         END,
         monthly_token_quota = $3::bigint,
         granted_by = $4::text,
         granted_at = $5::timestamptz
       RETURNING account_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $4::text, account_id, 'membership:grant', $7::text, $5::timestamptz FROM member
       RETURNING id
     )
     SELECT account_id FROM member`,
    [
      input.targetId,
      startsAt,
      input.monthlyQuota,
      input.actorId,
      input.now.toISOString(),
      input.days,
      input.reason ?? null,
    ],
  );
  return result.rows.length > 0;
}

/** Suspends or resumes a membership. Returns false when the account has no membership. */
export async function setMembershipStatus(
  db: AccountQueryable,
  input: {
    actorId: string;
    targetId: string;
    status: MembershipStatus;
    reason: string | undefined;
    now: Date;
  },
): Promise<boolean> {
  const result = await db.query(
    `WITH member AS (
       UPDATE memberships SET status = $3::text
        WHERE account_id = $2::text
        RETURNING account_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $1::text, account_id, 'membership:' || $3::text, $4::text, $5::timestamptz FROM member
       RETURNING id
     )
     SELECT account_id FROM member`,
    [input.actorId, input.targetId, input.status, input.reason ?? null, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

export interface MembershipListRow {
  id: string;
  username: string;
  membership: MembershipView | null;
}

/** One page of accounts with their membership, in id order. */
export async function listMemberships(
  db: AccountQueryable,
  afterId: string | undefined,
  limit: number,
  now: Date,
): Promise<MembershipListRow[]> {
  const result = await db.query(
    `SELECT a.id, a.username, m.status, m.expires_at, m.monthly_token_quota
       FROM accounts a
       LEFT JOIN memberships m ON m.account_id = a.id
      WHERE ($1::text IS NULL OR a.id > $1::text)
      ORDER BY a.id
      LIMIT $2::int`,
    [afterId ?? null, limit],
  );
  return (
    result.rows as Array<{
      id: string;
      username: string;
      status: MembershipStatus | null;
      expires_at: Date | string | null;
      monthly_token_quota: number | string | null;
    }>
  ).map((row) => {
    if (row.status === null || row.expires_at === null) {
      return { id: row.id, username: row.username, membership: null };
    }
    const expiresAt = new Date(row.expires_at);
    return {
      id: row.id,
      username: row.username,
      membership: {
        status: row.status,
        active: row.status === 'active' && expiresAt.getTime() > now.getTime(),
        expiresAt: expiresAt.toISOString(),
        monthlyQuota: Number(row.monthly_token_quota ?? 0),
      },
    };
  });
}

// ── Course sharing ───────────────────────────────────────────────────────────

export interface CourseShareRow {
  courseId: string;
  ownerId: string;
  title: string;
  state: ShareState;
  requestedAt: string;
}

/** The share record of a course, or undefined when the course is private. */
export async function readCourseShare(
  db: AccountQueryable,
  courseId: string,
): Promise<{ ownerId: string; title: string; state: ShareState } | undefined> {
  const result = await db.query(
    `SELECT owner_id, title, state FROM course_shares WHERE course_id = $1::text`,
    [courseId],
  );
  const row = result.rows[0] as { owner_id: string; title: string; state: ShareState } | undefined;
  return row ? { ownerId: row.owner_id, title: row.title, state: row.state } : undefined;
}

/**
 * Opens a share request for a course. A course that already has a record keeps it; the caller
 * checks the owner. Returns the state now on record.
 */
export async function requestCourseShare(
  db: AccountQueryable,
  input: { courseId: string; ownerId: string; title: string; now: Date },
): Promise<ShareState> {
  const inserted = await db.query(
    `INSERT INTO course_shares (course_id, owner_id, title, state, requested_at)
     VALUES ($1::text, $2::text, $3::text, 'pending', $4::timestamptz)
     ON CONFLICT (course_id) DO NOTHING
     RETURNING state`,
    [input.courseId, input.ownerId, input.title, input.now.toISOString()],
  );
  if (inserted.rows.length > 0) return 'pending';
  const existing = await readCourseShare(db, input.courseId);
  return existing?.state ?? 'pending';
}

/** Withdraws a course the owner shared or asked to share. Returns false when nothing was withdrawn. */
export async function withdrawCourseShare(
  db: AccountQueryable,
  input: { courseId: string; ownerId: string },
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM course_shares WHERE course_id = $1::text AND owner_id = $2::text RETURNING course_id`,
    [input.courseId, input.ownerId],
  );
  return result.rows.length > 0;
}

/**
 * An operator's decision on a pending request. Approve makes the course shared; reject removes
 * the request. Returns false when no pending request exists.
 */
export async function decideCourseShare(
  db: AccountQueryable,
  input: {
    actorId: string;
    courseId: string;
    decision: 'approve' | 'reject';
    now: Date;
  },
): Promise<boolean> {
  const result = await db.query(
    `WITH decided AS (
       UPDATE course_shares
          SET state = CASE WHEN $3::text = 'approve' THEN 'shared' ELSE state END,
              decided_at = $4::timestamptz,
              decided_by = $2::text
        WHERE course_id = $1::text AND state = 'pending'
          AND ($3::text = 'approve')
        RETURNING course_id
     ), rejected AS (
       DELETE FROM course_shares
        WHERE course_id = $1::text AND state = 'pending' AND ($3::text = 'reject')
        RETURNING course_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, course_id, 'share:' || $3::text, NULL, $4::timestamptz FROM decided
       UNION ALL
       SELECT $2::text, course_id, 'share:' || $3::text, NULL, $4::timestamptz FROM rejected
       RETURNING id
     )
     SELECT course_id FROM decided UNION ALL SELECT course_id FROM rejected`,
    [input.courseId, input.actorId, input.decision, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

export async function listCourseShares(
  db: AccountQueryable,
  state: ShareState,
): Promise<CourseShareRow[]> {
  const result = await db.query(
    `SELECT course_id, owner_id, title, state, requested_at
       FROM course_shares
      WHERE state = $1::text
      ORDER BY requested_at`,
    [state],
  );
  return (
    result.rows as Array<{
      course_id: string;
      owner_id: string;
      title: string;
      state: ShareState;
      requested_at: Date | string;
    }>
  ).map((row) => ({
    courseId: row.course_id,
    ownerId: row.owner_id,
    title: row.title,
    state: row.state,
    requestedAt: toIso(row.requested_at),
  }));
}

// ── Previews ─────────────────────────────────────────────────────────────────

/** Marks or unmarks a course as a free preview that visitors may open. */
export async function setCoursePreview(
  db: AccountQueryable,
  input: { actorId: string; courseId: string; on: boolean; now: Date },
): Promise<void> {
  if (input.on) {
    await db.query(
      `WITH marked AS (
         INSERT INTO course_previews (course_id, marked_by, marked_at)
         VALUES ($1::text, $2::text, $3::timestamptz)
         ON CONFLICT (course_id) DO NOTHING
         RETURNING course_id
       )
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, course_id, 'preview:on', NULL, $3::timestamptz FROM marked`,
      [input.courseId, input.actorId, input.now.toISOString()],
    );
    return;
  }
  await db.query(
    `WITH unmarked AS (
       DELETE FROM course_previews WHERE course_id = $1::text RETURNING course_id
     )
     INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
     SELECT $2::text, course_id, 'preview:off', NULL, $3::timestamptz FROM unmarked`,
    [input.courseId, input.actorId, input.now.toISOString()],
  );
}

export async function isCoursePreview(db: AccountQueryable, courseId: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM course_previews WHERE course_id = $1::text`, [
    courseId,
  ]);
  return result.rows.length > 0;
}

export async function listCoursePreviews(db: AccountQueryable): Promise<string[]> {
  const result = await db.query(`SELECT course_id FROM course_previews ORDER BY marked_at`, []);
  return (result.rows as Array<{ course_id: string }>).map((row) => row.course_id);
}

// ── Classes ──────────────────────────────────────────────────────────────────

export interface ClassRow {
  id: string;
  name: string;
  memberCount: number;
  courseIds: string[];
}

export async function createClass(
  db: AccountQueryable,
  input: { id: string; name: string; createdBy: string; joinCodeHash: string; now: Date },
): Promise<void> {
  await db.query(
    `WITH created AS (
       INSERT INTO classes (id, name, created_by, join_code_hash, created_at)
       VALUES ($1::text, $2::text, $3::text, $4::text, $5::timestamptz)
       RETURNING id
     )
     INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
     SELECT $3::text, id, 'class:create', NULL, $5::timestamptz FROM created`,
    [input.id, input.name, input.createdBy, input.joinCodeHash, input.now.toISOString()],
  );
}

/** The class a join code belongs to. Only the hash is stored, so the lookup is by hash. */
export async function findClassByJoinCodeHash(
  db: AccountQueryable,
  joinCodeHash: string,
): Promise<{ id: string; name: string } | undefined> {
  const result = await db.query(`SELECT id, name FROM classes WHERE join_code_hash = $1::text`, [
    joinCodeHash,
  ]);
  const row = result.rows[0] as { id: string; name: string } | undefined;
  return row;
}

export async function joinClass(
  db: AccountQueryable,
  input: { classId: string; accountId: string; now: Date },
): Promise<void> {
  await db.query(
    `INSERT INTO class_members (class_id, account_id, joined_at)
     VALUES ($1::text, $2::text, $3::timestamptz)
     ON CONFLICT (class_id, account_id) DO NOTHING`,
    [input.classId, input.accountId, input.now.toISOString()],
  );
}

/** Classes the account belongs to, with their attached courses. */
export async function listClassesForAccount(
  db: AccountQueryable,
  accountId: string,
): Promise<ClassRow[]> {
  const result = await db.query(
    `SELECT c.id, c.name,
            (SELECT count(*) FROM class_members m2 WHERE m2.class_id = c.id)::int AS member_count,
            COALESCE(array_agg(cc.course_id ORDER BY cc.attached_at) FILTER (WHERE cc.course_id IS NOT NULL), '{}') AS course_ids
       FROM class_members m
       JOIN classes c ON c.id = m.class_id
       LEFT JOIN class_courses cc ON cc.class_id = c.id
      WHERE m.account_id = $1::text
      GROUP BY c.id, c.name
      ORDER BY c.name`,
    [accountId],
  );
  return rowsToClasses(result.rows);
}

/** Every class, for an operator or administrator. */
export async function listAllClasses(db: AccountQueryable): Promise<ClassRow[]> {
  const result = await db.query(
    `SELECT c.id, c.name,
            (SELECT count(*) FROM class_members m WHERE m.class_id = c.id)::int AS member_count,
            COALESCE(array_agg(cc.course_id ORDER BY cc.attached_at) FILTER (WHERE cc.course_id IS NOT NULL), '{}') AS course_ids
       FROM classes c
       LEFT JOIN class_courses cc ON cc.class_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name`,
    [],
  );
  return rowsToClasses(result.rows);
}

function rowsToClasses(rows: unknown[]): ClassRow[] {
  return (
    rows as Array<{ id: string; name: string; member_count: number; course_ids: string[] }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    memberCount: Number(row.member_count),
    courseIds: row.course_ids ?? [],
  }));
}

export async function attachCourseToClass(
  db: AccountQueryable,
  input: { classId: string; courseId: string; attachedBy: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH attached AS (
       INSERT INTO class_courses (class_id, course_id, attached_by, attached_at)
       SELECT $1::text, $2::text, $3::text, $4::timestamptz
        WHERE EXISTS (SELECT 1 FROM classes WHERE id = $1::text)
       ON CONFLICT (class_id, course_id) DO NOTHING
       RETURNING class_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $3::text, $2::text, 'class:attach:' || $1::text, NULL, $4::timestamptz FROM attached
       RETURNING id
     )
     SELECT class_id FROM attached`,
    [input.classId, input.courseId, input.attachedBy, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

/** True when the account is a member of a class the course is attached to. */
export async function isCourseInClassOf(
  db: AccountQueryable,
  accountId: string,
  courseId: string,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1
       FROM class_courses cc
       JOIN class_members m ON m.class_id = cc.class_id
      WHERE cc.course_id = $1::text AND m.account_id = $2::text
      LIMIT 1`,
    [courseId, accountId],
  );
  return result.rows.length > 0;
}

// ── Reader rewards and badges ────────────────────────────────────────────────

/**
 * Records the first read of a shared course by a member, and credits the author. Each reader
 * counts once per course. The monthly credit stops at the cap. Returns the tokens credited (0
 * when the read was not new or the cap was already reached).
 */
export async function recordCourseRead(
  db: AccountQueryable,
  input: { courseId: string; readerId: string; authorId: string; month: string; now: Date },
): Promise<number> {
  const inserted = await db.query(
    `INSERT INTO course_reads (course_id, reader_id, author_id, first_read_at)
     VALUES ($1::text, $2::text, $3::text, $4::timestamptz)
     ON CONFLICT (course_id, reader_id) DO NOTHING
     RETURNING course_id`,
    [input.courseId, input.readerId, input.authorId, input.now.toISOString()],
  );
  if (inserted.rows.length === 0) return 0;

  const before = await readBonusTokens(db, input.authorId, input.month);
  const room = Math.max(0, MONTHLY_REWARD_CAP_TOKENS - before);
  const credit = Math.min(READER_REWARD_TOKENS, room);
  if (credit > 0) {
    await db.query(
      `INSERT INTO quota_bonus (owner_id, month, tokens)
       VALUES ($1::text, $2::text, $3::bigint)
       ON CONFLICT (owner_id, month) DO UPDATE SET tokens = quota_bonus.tokens + $3::bigint`,
      [input.authorId, input.month, credit],
    );
  }

  const readers = await db.query(
    `SELECT count(DISTINCT reader_id)::int AS readers FROM course_reads WHERE author_id = $1::text`,
    [input.authorId],
  );
  const count = Number((readers.rows[0] as { readers: number }).readers);
  for (const threshold of BADGE_THRESHOLDS) {
    if (count < threshold.readers) continue;
    await db.query(
      `INSERT INTO badges (owner_id, badge_code, earned_at)
       VALUES ($1::text, $2::text, $3::timestamptz)
       ON CONFLICT (owner_id, badge_code) DO NOTHING`,
      [input.authorId, threshold.code, input.now.toISOString()],
    );
  }
  return credit;
}

/** Bonus tokens an owner has earned in a month, from reader rewards. */
export async function readBonusTokens(
  db: AccountQueryable,
  ownerId: string,
  month: string,
): Promise<number> {
  const result = await db.query(
    `SELECT tokens FROM quota_bonus WHERE owner_id = $1::text AND month = $2::text`,
    [ownerId, month],
  );
  const row = result.rows[0] as { tokens: number | string } | undefined;
  return row ? Number(row.tokens) : 0;
}

export async function readBadges(db: AccountQueryable, ownerId: string): Promise<string[]> {
  const result = await db.query(
    `SELECT badge_code FROM badges WHERE owner_id = $1::text ORDER BY badge_code`,
    [ownerId],
  );
  return (result.rows as Array<{ badge_code: string }>).map((row) => row.badge_code);
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  courseId: string;
  title: string;
  kind: 'preview' | 'shared' | 'class';
}

/**
 * The courses a visitor may browse. A guest sees previews. A member also sees shared courses and
 * the courses of their classes. A course appears once, under its most open kind.
 */
export async function listCatalog(
  db: AccountQueryable,
  viewer: { accountId?: string; memberActive: boolean },
): Promise<CatalogEntry[]> {
  const result = await db.query(
    `SELECT s.course_id, s.title, 'shared' AS kind
       FROM course_shares s
      WHERE s.state = 'shared' AND $1::boolean
     UNION ALL
     SELECT p.course_id, COALESCE(s.title, p.course_id) AS title, 'preview' AS kind
       FROM course_previews p
       LEFT JOIN course_shares s ON s.course_id = p.course_id
     UNION ALL
     SELECT cc.course_id, COALESCE(s.title, cc.course_id) AS title, 'class' AS kind
       FROM class_courses cc
       JOIN class_members m ON m.class_id = cc.class_id
       LEFT JOIN course_shares s ON s.course_id = cc.course_id
      WHERE $1::boolean AND m.account_id = $2::text`,
    [viewer.memberActive, viewer.accountId ?? ''],
  );
  const rank: Record<CatalogEntry['kind'], number> = { preview: 0, class: 1, shared: 2 };
  const byId = new Map<string, CatalogEntry>();
  for (const row of result.rows as Array<{
    course_id: string;
    title: string;
    kind: CatalogEntry['kind'];
  }>) {
    const entry: CatalogEntry = { courseId: row.course_id, title: row.title, kind: row.kind };
    const current = byId.get(entry.courseId);
    if (!current || rank[entry.kind] > rank[current.kind]) byId.set(entry.courseId, entry);
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: number;
  actorId: string;
  targetId: string;
  action: string;
  reason: string | null;
  createdAt: string;
}

/** One page of the audit log, newest first. `beforeId` pages to older rows. */
export async function listAudit(
  db: AccountQueryable,
  beforeId: number | undefined,
  limit: number,
): Promise<AuditRow[]> {
  const result = await db.query(
    `SELECT id, actor_id, target_id, action, reason, created_at
       FROM account_admin_audit
      WHERE ($1::bigint IS NULL OR id < $1::bigint)
      ORDER BY id DESC
      LIMIT $2::int`,
    [beforeId ?? null, limit],
  );
  return (
    result.rows as Array<{
      id: number | string;
      actor_id: string;
      target_id: string;
      action: string;
      reason: string | null;
      created_at: Date | string;
    }>
  ).map((row) => ({
    id: Number(row.id),
    actorId: row.actor_id,
    targetId: row.target_id,
    action: row.action,
    reason: row.reason,
    createdAt: toIso(row.created_at),
  }));
}
