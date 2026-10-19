/**
 * Storage for membership, access requests, course sharing, previews, classes, reader rewards and badges.
 * Every change that an operator or administrator makes is written to the audit table in the
 * same statement, so the change and its record succeed or fail together.
 */
import { readTags, tagsFor, validateTags } from '@/lib/learning/taxonomy';
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { EXPIRING_WITHIN_DAYS } from '@/lib/home/learner-status';

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

/**
 * Sets a membership's expiry and monthly quota exactly (an edit, unlike `grantMembership`, which
 * extends). The audit row's reason records the new values. False when there is no membership.
 */
export async function updateMembership(
  db: AccountQueryable,
  input: {
    actorId: string;
    targetId: string;
    expiresAt: Date;
    monthlyQuota: number;
    now: Date;
  },
): Promise<boolean> {
  const expiresAt = input.expiresAt.toISOString();
  const result = await db.query(
    `WITH member AS (
       UPDATE memberships SET expires_at = $3::timestamptz, monthly_token_quota = $4::bigint
        WHERE account_id = $2::text
        RETURNING account_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $1::text, account_id, 'membership:update', $6::text, $5::timestamptz FROM member
       RETURNING id
     )
     SELECT account_id FROM member`,
    [
      input.actorId,
      input.targetId,
      expiresAt,
      input.monthlyQuota,
      input.now.toISOString(),
      `expires ${expiresAt.slice(0, 10)}, quota ${input.monthlyQuota}`,
    ],
  );
  return result.rows.length > 0;
}

/** Removes a membership. False when the account had none. */
export async function revokeMembership(
  db: AccountQueryable,
  input: { actorId: string; targetId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH member AS (
       DELETE FROM memberships WHERE account_id = $2::text RETURNING account_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $1::text, account_id, 'membership:revoke', NULL, $3::timestamptz FROM member
       RETURNING id
     )
     SELECT account_id FROM member`,
    [input.actorId, input.targetId, input.now.toISOString()],
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

// ── Access requests ──────────────────────────────────────────────────────────

/** Longest note a learner may attach to a request. */
export const ACCESS_REQUEST_NOTE_MAX = 280;
/** Hours a learner waits after a rejection before asking again. */
export const ACCESS_REQUEST_RETRY_HOURS = 24;
/** What an approval grants: the same defaults the members panel offers. */
export const ACCESS_APPROVAL_DAYS = 30;

export type AccessRequestState = 'pending' | 'approved' | 'rejected';

export interface AccessRequestView {
  state: AccessRequestState;
  note: string | null;
  requestedAt: string;
  decidedAt: string | null;
  /** Why staff refused it, when they said; shown to the learner. */
  reason: string | null;
}

interface AccessRequestRow {
  state: AccessRequestState;
  note: string | null;
  requested_at: Date | string;
  decided_at: Date | string | null;
  decision_reason?: string | null;
}

function toAccessRequest(row: AccessRequestRow): AccessRequestView {
  return {
    state: row.state,
    note: row.note,
    requestedAt: toIso(row.requested_at),
    decidedAt: row.decided_at ? toIso(row.decided_at) : null,
    reason: row.decision_reason ?? null,
  };
}

/** The learner's request, or undefined when they never asked. */
export async function readAccessRequest(
  db: AccountQueryable,
  accountId: string,
): Promise<AccessRequestView | undefined> {
  const result = await db.query(
    `SELECT state, note, requested_at, decided_at, decision_reason
       FROM access_requests WHERE account_id = $1::text`,
    [accountId],
  );
  const row = result.rows[0] as AccessRequestRow | undefined;
  return row ? toAccessRequest(row) : undefined;
}

export type CreateAccessRequestResult =
  | { ok: true; request: AccessRequestView }
  | {
      ok: false;
      reason: 'ALREADY_MEMBER' | 'MEMBERSHIP_SUSPENDED' | 'REQUEST_PENDING' | 'REQUEST_TOO_SOON';
    };

/**
 * Opens a request, or reopens an old one. An active member does not need to ask, and a suspended
 * member may not: an administrator paused that membership. One request is pending at a time, and
 * after a rejection the learner waits `ACCESS_REQUEST_RETRY_HOURS`. The pending and wait rules
 * are one conditional upsert, so two requests at once cannot both pass.
 */
export async function createAccessRequest(
  db: AccountQueryable,
  input: { accountId: string; note: string | undefined; now: Date },
): Promise<CreateAccessRequestResult> {
  const membership = await readMembership(db, input.accountId, input.now);
  if (membership?.status === 'suspended') return { ok: false, reason: 'MEMBERSHIP_SUSPENDED' };
  // An active member may ask only to renew a membership that ends soon (same window as the home notice).
  const renewable =
    membership?.active === true &&
    new Date(membership.expiresAt).getTime() - input.now.getTime() <
      EXPIRING_WITHIN_DAYS * 86_400_000;
  if (membership?.active && !renewable) return { ok: false, reason: 'ALREADY_MEMBER' };

  const retryAfter = new Date(input.now.getTime() - ACCESS_REQUEST_RETRY_HOURS * 3_600_000);
  const written = await db.query(
    `INSERT INTO access_requests (account_id, note, state, requested_at)
     VALUES ($1::text, $2::text, 'pending', $3::timestamptz)
     ON CONFLICT (account_id) DO UPDATE SET
       note = EXCLUDED.note,
       state = 'pending',
       requested_at = EXCLUDED.requested_at,
       decided_at = NULL,
       decided_by = NULL,
       decision_reason = NULL
     WHERE access_requests.state = 'approved'
        OR (access_requests.state = 'rejected' AND access_requests.decided_at <= $4::timestamptz)
     RETURNING state, note, requested_at, decided_at, decision_reason`,
    [input.accountId, input.note ?? null, input.now.toISOString(), retryAfter.toISOString()],
  );
  const row = written.rows[0] as AccessRequestRow | undefined;
  if (row) return { ok: true, request: toAccessRequest(row) };
  const existing = await readAccessRequest(db, input.accountId);
  return {
    ok: false,
    reason: existing?.state === 'rejected' ? 'REQUEST_TOO_SOON' : 'REQUEST_PENDING',
  };
}

export type RequesterMembership = 'none' | 'active' | 'expired' | 'suspended';

export interface PendingAccessRequest {
  accountId: string;
  username: string;
  note: string | null;
  requestedAt: string;
  membership: RequesterMembership;
}

/** The requests waiting for a decision, oldest first. */
export async function listPendingAccessRequests(
  db: AccountQueryable,
  now: Date,
  limit = 100,
): Promise<PendingAccessRequest[]> {
  const result = await db.query(
    `SELECT r.account_id, a.username, r.note, r.requested_at, m.status AS membership_status, m.expires_at
       FROM access_requests r
       JOIN accounts a ON a.id = r.account_id
       LEFT JOIN memberships m ON m.account_id = r.account_id
      WHERE r.state = 'pending'
      ORDER BY r.requested_at ASC, r.account_id ASC
      LIMIT $1::int`,
    [limit],
  );
  return (
    result.rows as Array<{
      account_id: string;
      username: string;
      note: string | null;
      requested_at: Date | string;
      membership_status: MembershipStatus | null;
      expires_at: Date | string | null;
    }>
  ).map((row) => ({
    accountId: row.account_id,
    username: row.username,
    note: row.note,
    requestedAt: toIso(row.requested_at),
    membership:
      row.membership_status === null
        ? 'none'
        : row.membership_status === 'suspended'
          ? 'suspended'
          : new Date(row.expires_at as Date | string).getTime() > now.getTime()
            ? 'active'
            : 'expired',
  }));
}

/**
 * An operator's decision on a pending request. Approve grants the membership and marks the
 * request in one statement, with the audit row. Reject marks it and writes the audit row. A
 * suspended membership is never resumed by an approval: the request stays pending and the call
 * returns false, as it does when no pending request exists.
 */
export async function decideAccessRequest(
  db: AccountQueryable,
  input: {
    actorId: string;
    accountId: string;
    decision: 'approve' | 'reject';
    days: number;
    monthlyQuota: number;
    reason: string | undefined;
    now: Date;
  },
): Promise<boolean> {
  const now = input.now.toISOString();
  if (input.decision === 'reject') {
    const result = await db.query(
      `WITH decided AS (
         UPDATE access_requests
            SET state = 'rejected', decided_at = $3::timestamptz, decided_by = $2::text,
                decision_reason = $4::text
          WHERE account_id = $1::text AND state = 'pending'
          RETURNING account_id
       ), audit AS (
         INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
         SELECT $2::text, account_id, 'access:reject', $4::text, $3::timestamptz FROM decided
         RETURNING id
       )
       SELECT account_id FROM decided`,
      [input.accountId, input.actorId, now, input.reason ?? null],
    );
    return result.rows.length > 0;
  }
  const expiresAt = new Date(input.now.getTime() + input.days * 86_400_000).toISOString();
  const result = await db.query(
    `WITH decided AS (
       UPDATE access_requests
          SET state = 'approved', decided_at = $3::timestamptz, decided_by = $2::text,
              decision_reason = NULL
        WHERE account_id = $1::text AND state = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM memberships WHERE account_id = $1::text AND status = 'suspended'
          )
        RETURNING account_id
     ), member AS (
       INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by, granted_at)
       SELECT account_id, 'active', $4::timestamptz, $5::bigint, $2::text, $3::timestamptz FROM decided
       ON CONFLICT (account_id) DO UPDATE SET
         status = 'active',
         expires_at = CASE
           WHEN memberships.expires_at > $3::timestamptz
             THEN memberships.expires_at + make_interval(days => $6::int)
           ELSE $4::timestamptz
         END,
         monthly_token_quota = $5::bigint,
         granted_by = $2::text,
         granted_at = $3::timestamptz
       RETURNING account_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, account_id, 'access:approve', $7::text, $3::timestamptz FROM decided
       RETURNING id
     )
     SELECT account_id FROM decided`,
    [
      input.accountId,
      input.actorId,
      now,
      expiresAt,
      input.monthlyQuota,
      input.days,
      input.reason ?? null,
    ],
  );
  return result.rows.length > 0;
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

/** The last refused share request of a course owned by `ownerId`, if it was not asked again since. */
export async function readShareRejection(
  db: AccountQueryable,
  input: { courseId: string; ownerId: string },
): Promise<{ reason: string | null; rejectedAt: string } | undefined> {
  const result = await db.query(
    `SELECT reason, rejected_at FROM course_share_rejections
      WHERE course_id = $1::text AND owner_id = $2::text`,
    [input.courseId, input.ownerId],
  );
  const row = result.rows[0] as { reason: string | null; rejected_at: Date | string } | undefined;
  return row ? { reason: row.reason, rejectedAt: toIso(row.rejected_at) } : undefined;
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
  if (inserted.rows.length > 0) {
    // Asking again replaces the last refusal.
    await db.query(`DELETE FROM course_share_rejections WHERE course_id = $1::text`, [
      input.courseId,
    ]);
    return 'pending';
  }
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
    /** Why a request was refused; shown to the course's owner and kept in the audit log. */
    reason?: string;
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
        RETURNING course_id, owner_id, title
     ), noted AS (
       INSERT INTO course_share_rejections (course_id, owner_id, title, reason, rejected_at)
       SELECT course_id, owner_id, title, $5::text, $4::timestamptz FROM rejected
       ON CONFLICT (course_id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         title = EXCLUDED.title,
         reason = EXCLUDED.reason,
         rejected_at = EXCLUDED.rejected_at
       RETURNING course_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, course_id, 'share:' || $3::text, NULL, $4::timestamptz FROM decided
       UNION ALL
       SELECT $2::text, course_id, 'share:' || $3::text, $5::text, $4::timestamptz FROM rejected
       RETURNING id
     )
     SELECT course_id FROM decided UNION ALL SELECT course_id FROM rejected`,
    [input.courseId, input.actorId, input.decision, input.now.toISOString(), input.reason ?? null],
  );
  return result.rows.length > 0;
}

/** Takes a shared course off the shared list. False when the course is not shared. */
export async function revokeCourseShare(
  db: AccountQueryable,
  input: { actorId: string; courseId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH revoked AS (
       DELETE FROM course_shares WHERE course_id = $1::text AND state = 'shared'
       RETURNING course_id, title
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, course_id, 'share:revoke', title, $3::timestamptz FROM revoked
       RETURNING id
     )
     SELECT course_id FROM revoked`,
    [input.courseId, input.actorId, input.now.toISOString()],
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

export interface PreviewRow {
  courseId: string;
  markedAt: string;
  /** Subject, grade and topic tags (see `lib/learning/taxonomy.ts`). */
  tags?: string[];
}

export async function listCoursePreviews(db: AccountQueryable): Promise<PreviewRow[]> {
  const result = await db.query(
    `SELECT course_id, marked_at FROM course_previews ORDER BY marked_at`,
    [],
  );
  return (result.rows as Array<{ course_id: string; marked_at: Date | string }>).map((row) => ({
    courseId: row.course_id,
    markedAt: toIso(row.marked_at),
  }));
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
     SELECT $3::text, id, 'class:create', $2::text, $5::timestamptz FROM created`,
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

/** Renames a class; the audit reason keeps the old and new names. False when it does not exist. */
export async function renameClass(
  db: AccountQueryable,
  input: { classId: string; name: string; actorId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH old AS (
       SELECT id, name FROM classes WHERE id = $1::text
     ), renamed AS (
       UPDATE classes SET name = $2::text WHERE id = $1::text RETURNING id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $3::text, old.id, 'class:rename', old.name || ' → ' || $2::text, $4::timestamptz
         FROM old JOIN renamed ON renamed.id = old.id
       RETURNING id
     )
     SELECT id FROM renamed`,
    [input.classId, input.name, input.actorId, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

/**
 * Replaces a class's join code (only its hash is stored, so a lost code cannot be shown again).
 * The old code stops working; members already in the class stay. False when the class does not exist.
 */
export async function rotateClassJoinCode(
  db: AccountQueryable,
  input: { classId: string; joinCodeHash: string; actorId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH rotated AS (
       UPDATE classes SET join_code_hash = $2::text WHERE id = $1::text RETURNING id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $3::text, id, 'class:code', NULL, $4::timestamptz FROM rotated
       RETURNING id
     )
     SELECT id FROM rotated`,
    [input.classId, input.joinCodeHash, input.actorId, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

/**
 * Deletes a class with its memberships and course links (cascade). The courses themselves stay.
 * The audit reason keeps the name, since the class row is gone. False when it does not exist.
 */
export async function deleteClass(
  db: AccountQueryable,
  input: { classId: string; actorId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH deleted AS (
       DELETE FROM classes WHERE id = $1::text RETURNING id, name
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, id, 'class:delete', name, $3::timestamptz FROM deleted
       RETURNING id
     )
     SELECT id FROM deleted`,
    [input.classId, input.actorId, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

/** Detaches a course from a class, logged like `attachCourseToClass`. False when it was not attached. */
export async function detachCourseFromClass(
  db: AccountQueryable,
  input: { classId: string; courseId: string; actorId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH detached AS (
       DELETE FROM class_courses WHERE class_id = $1::text AND course_id = $2::text
       RETURNING class_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $3::text, $2::text, 'class:detach:' || $1::text, NULL, $4::timestamptz FROM detached
       RETURNING id
     )
     SELECT class_id FROM detached`,
    [input.classId, input.courseId, input.actorId, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

export interface ClassMemberRow {
  accountId: string;
  username: string;
  joinedAt: string;
}

/** The members of a class, earliest first. */
export async function listClassMembers(
  db: AccountQueryable,
  classId: string,
): Promise<ClassMemberRow[]> {
  const result = await db.query(
    `SELECT m.account_id, a.username, m.joined_at
       FROM class_members m
       JOIN accounts a ON a.id = m.account_id
      WHERE m.class_id = $1::text
      ORDER BY m.joined_at, a.username`,
    [classId],
  );
  return (
    result.rows as Array<{ account_id: string; username: string; joined_at: Date | string }>
  ).map((row) => ({
    accountId: row.account_id,
    username: row.username,
    joinedAt: toIso(row.joined_at),
  }));
}

/**
 * A member leaves a class of their own accord and can join again with the class code. False when
 * they were not in it. Logged as `class:leave:<classId>` with the account as actor and target.
 */
export async function leaveClass(
  db: AccountQueryable,
  input: { classId: string; accountId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH removed AS (
       DELETE FROM class_members WHERE class_id = $1::text AND account_id = $2::text
       RETURNING class_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $2::text, $2::text, 'class:leave:' || $1::text, NULL, $3::timestamptz FROM removed
       RETURNING id
     )
     SELECT class_id FROM removed`,
    [input.classId, input.accountId, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

/**
 * Takes a member out of a class; they can join again only with the class code, so rotate the code
 * to keep them out. Logged as `class:remove:<classId>` with the account as target.
 */
/**
 * Staff add an account to a class without a join code. False when the class or the account does
 * not exist or the account is already a member. Logged as `class:add:<classId>`.
 */
export async function addClassMember(
  db: AccountQueryable,
  input: { classId: string; accountId: string; actorId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH added AS (
       INSERT INTO class_members (class_id, account_id, joined_at)
       SELECT c.id, a.id, $4::timestamptz
         FROM classes c, accounts a
        WHERE c.id = $1::text AND a.id = $2::text
       ON CONFLICT (class_id, account_id) DO NOTHING
       RETURNING class_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $3::text, $2::text, 'class:add:' || $1::text, NULL, $4::timestamptz FROM added
       RETURNING id
     )
     SELECT class_id FROM added`,
    [input.classId, input.accountId, input.actorId, input.now.toISOString()],
  );
  return result.rows.length > 0;
}

export async function removeClassMember(
  db: AccountQueryable,
  input: { classId: string; accountId: string; actorId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH removed AS (
       DELETE FROM class_members WHERE class_id = $1::text AND account_id = $2::text
       RETURNING class_id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $3::text, $2::text, 'class:remove:' || $1::text, NULL, $4::timestamptz FROM removed
       RETURNING id
     )
     SELECT class_id FROM removed`,
    [input.classId, input.accountId, input.actorId, input.now.toISOString()],
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
  input: {
    courseId: string;
    readerId: string;
    authorId: string;
    month: string;
    now: Date;
    /** For a remix: the author of the course it came from, and their tokens for this read. */
    royalty?: { ownerId: string; tokens: number };
  },
): Promise<number> {
  const inserted = await db.query(
    `INSERT INTO course_reads (course_id, reader_id, author_id, first_read_at)
     VALUES ($1::text, $2::text, $3::text, $4::timestamptz)
     ON CONFLICT (course_id, reader_id) DO NOTHING
     RETURNING course_id`,
    [input.courseId, input.readerId, input.authorId, input.now.toISOString()],
  );
  if (inserted.rows.length === 0) return 0;

  const credit = await creditBonusTokens(db, input.authorId, input.month, READER_REWARD_TOKENS);
  if (input.royalty && input.royalty.tokens > 0) {
    await creditBonusTokens(db, input.royalty.ownerId, input.month, input.royalty.tokens);
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

/**
 * Adds reward tokens to an owner's month, up to the monthly reward cap that every reward shares.
 * Returns the tokens actually credited.
 */
export async function creditBonusTokens(
  db: AccountQueryable,
  ownerId: string,
  month: string,
  tokens: number,
): Promise<number> {
  const before = await readBonusTokens(db, ownerId, month);
  const credit = Math.min(tokens, Math.max(0, MONTHLY_REWARD_CAP_TOKENS - before));
  if (credit > 0) {
    await db.query(
      `INSERT INTO quota_bonus (owner_id, month, tokens)
       VALUES ($1::text, $2::text, $3::bigint)
       ON CONFLICT (owner_id, month) DO UPDATE SET tokens = quota_bonus.tokens + $3::bigint`,
      [ownerId, month, credit],
    );
  }
  return credit;
}

/** The next badge an author can still earn, and how many more readers it needs. Null past the last one. */
export function nextBadge(readers: number): { code: string; readersNeeded: number } | null {
  const next = BADGE_THRESHOLDS.find((threshold) => threshold.readers > readers);
  return next ? { code: next.code, readersNeeded: next.readers - readers } : null;
}

/** Distinct members who have read any course of this author. The badge thresholds count the same thing. */
export async function countDistinctReaders(
  db: AccountQueryable,
  authorId: string,
): Promise<number> {
  const result = await db.query(
    `SELECT count(DISTINCT reader_id)::int AS readers FROM course_reads WHERE author_id = $1::text`,
    [authorId],
  );
  return Number((result.rows[0] as { readers: number | string }).readers);
}

export interface OwnShare {
  courseId: string;
  title: string;
  /** `rejected`: the last request was refused and not asked again since. */
  state: ShareState | 'rejected';
  /** Distinct members who read this course. */
  readers: number;
  /** Why a refused request was refused, when staff gave a reason. */
  reason?: string | null;
  /** The subject, grade and topic tags staff gave the course, when they did. */
  tags?: string[];
}

/**
 * The courses an owner shared or asked to share, with their readers. Refused requests come first,
 * so the owner sees them; then shared, then pending.
 */
export async function listSharesByOwner(
  db: AccountQueryable,
  ownerId: string,
): Promise<OwnShare[]> {
  const result = await db.query(
    `SELECT course_id, title, state, readers, reason FROM (
       SELECT s.course_id, s.title, s.state,
              (SELECT count(*) FROM course_reads r WHERE r.course_id = s.course_id)::int AS readers,
              NULL::text AS reason, s.requested_at AS at,
              CASE s.state WHEN 'shared' THEN 1 ELSE 2 END AS rank
         FROM course_shares s
        WHERE s.owner_id = $1::text
       UNION ALL
       SELECT j.course_id, j.title, 'rejected', 0, j.reason, j.rejected_at, 0
         FROM course_share_rejections j
        WHERE j.owner_id = $1::text
          AND NOT EXISTS (SELECT 1 FROM course_shares s WHERE s.course_id = j.course_id)
     ) rows
     ORDER BY rank, at DESC, course_id ASC`,
    [ownerId],
  );
  return (
    result.rows as Array<{
      course_id: string;
      title: string;
      state: OwnShare['state'];
      readers: number | string;
      reason: string | null;
    }>
  ).map((row) => ({
    courseId: row.course_id,
    title: row.title,
    state: row.state,
    readers: Number(row.readers),
    ...(row.state === 'rejected' ? { reason: row.reason } : {}),
  }));
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

// ── Course tags ──────────────────────────────────────────────────────────────

/** The tags of each course, by course id. A course with none is not in the map. */
export async function listCourseTags(
  db: AccountQueryable,
  courseIds: readonly string[],
): Promise<Map<string, string[]>> {
  const tags = new Map<string, string[]>();
  if (courseIds.length === 0) return tags;
  const result = await db.query(
    `SELECT course_id, tag FROM course_tags
      WHERE course_id = ANY($1::text[])
      ORDER BY course_id, tag`,
    [[...courseIds]],
  );
  for (const row of result.rows as Array<{ course_id: string; tag: string }>) {
    const list = tags.get(row.course_id);
    if (list) list.push(row.tag);
    else tags.set(row.course_id, [row.tag]);
  }
  // In the taxonomy's order, and without a stored tag the taxonomy no longer has.
  for (const [courseId, list] of tags) {
    const ordered = tagsFor(readTags(list));
    if (ordered.length > 0) tags.set(courseId, ordered);
    else tags.delete(courseId);
  }
  return tags;
}

/** Whether staff may tag the course: it has a share record or is marked as a preview. */
export async function isTaggableCourse(db: AccountQueryable, courseId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM course_shares WHERE course_id = $1::text
     UNION ALL
     SELECT 1 FROM course_previews WHERE course_id = $1::text`,
    [courseId],
  );
  return result.rows.length > 0;
}

/**
 * Replaces the tags of a course with `tags`, which must pass `validateTags`. Returns false when
 * the course already had exactly these tags (nothing is written then, and no audit row). One
 * statement does the removal, the addition and the audit row, so a failure leaves none of them.
 */
export async function setCourseTags(
  db: AccountQueryable,
  input: { courseId: string; tags: readonly string[]; actorId: string; now: Date },
): Promise<boolean> {
  const checked = validateTags(input.tags);
  if (!checked.ok) throw new Error(`Invalid course tags: ${checked.error}`);
  const before = (await listCourseTags(db, [input.courseId])).get(input.courseId) ?? [];
  if (before.length === checked.tags.length && checked.tags.every((tag) => before.includes(tag))) {
    return false;
  }
  await db.query(
    `WITH removed AS (
       DELETE FROM course_tags WHERE course_id = $1::text AND tag <> ALL($2::text[]) RETURNING 1
     ), added AS (
       INSERT INTO course_tags (course_id, tag, set_by, set_at)
       SELECT $1::text, tag, $3::text, $4::timestamptz FROM unnest($2::text[]) AS tag
       ON CONFLICT (course_id, tag) DO NOTHING
       RETURNING 1
     )
     INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
     VALUES ($3::text, $1::text, 'course:tags', $5::text, $4::timestamptz)`,
    [input.courseId, checked.tags, input.actorId, input.now.toISOString(), checked.tags.join(', ')],
  );
  return true;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  courseId: string;
  title: string;
  kind: 'preview' | 'shared' | 'class';
  /** How many scenes the course has; absent when the course documents are not stored here. */
  sceneCount?: number;
  /**
   * When readers last got new content, as an ISO time: the approval of a shared course (readers see
   * the approved copy), else the course's own last update. Absent when neither is known.
   */
  updatedAt?: string;
  /** The course has a quiz scene. Absent together with `sceneCount`. */
  hasQuiz?: boolean;
  /** The course has an interactive or project scene. Absent together with `sceneCount`. */
  hasInteractive?: boolean;
  /** Subject, grade and topic tags staff gave it (see `lib/learning/taxonomy.ts`). Absent when none. */
  tags?: string[];
}

/**
 * Whether the course documents live in this database. They do when server persistence is on;
 * accounts can be on without it, and then there are no names to read.
 */
async function hasCourseDocuments(db: AccountQueryable): Promise<boolean> {
  const result = await db.query(`SELECT to_regclass('document_stages') IS NOT NULL AS present`);
  return (result.rows[0] as { present: boolean }).present === true;
}

/**
 * The courses a visitor may browse. A guest sees previews. A member also sees shared courses and
 * the courses of their classes. A course appears once, under its most open kind. A preview or class
 * course takes its title from the share record, else from the course's own name (read when the
 * list is built, so it follows a rename and covers courses attached before), else its id.
 */
export async function listCatalog(
  db: AccountQueryable,
  viewer: { accountId?: string; memberActive: boolean },
): Promise<CatalogEntry[]> {
  const named = await hasCourseDocuments(db);
  // `courseId` is always one of the two column names written above, never input.
  const stageName = (courseId: string) =>
    named ? `(SELECT NULLIF(d.name, '') FROM document_stages d WHERE d.id = ${courseId})` : 'NULL';
  const result = await db.query(
    `SELECT s.course_id, s.title, 'shared' AS kind, s.decided_at AS approved_at
       FROM course_shares s
      WHERE s.state = 'shared' AND $1::boolean
     UNION ALL
     SELECT p.course_id, COALESCE(s.title, ${stageName('p.course_id')}, p.course_id) AS title, 'preview' AS kind,
            NULL::timestamptz AS approved_at
       FROM course_previews p
       LEFT JOIN course_shares s ON s.course_id = p.course_id
     UNION ALL
     SELECT cc.course_id, COALESCE(s.title, ${stageName('cc.course_id')}, cc.course_id) AS title, 'class' AS kind,
            NULL::timestamptz AS approved_at
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
    approved_at: Date | string | null;
  }>) {
    const entry: CatalogEntry = { courseId: row.course_id, title: row.title, kind: row.kind };
    if (row.approved_at !== null) entry.updatedAt = new Date(row.approved_at).toISOString();
    const current = byId.get(entry.courseId);
    if (!current || rank[entry.kind] > rank[current.kind]) byId.set(entry.courseId, entry);
  }
  const entries = [...byId.values()];
  await addDocumentFacts(db, entries);
  const tags = await listCourseTags(
    db,
    entries.map((entry) => entry.courseId),
  );
  for (const entry of entries) {
    const own = tags.get(entry.courseId);
    if (own) entry.tags = own;
  }
  return entries.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Fills what the stored course documents say, one query for the whole list: the scene count, whether
 * there is a quiz or an interactive scene, and, for a course that is not shared, its last update.
 */
async function addDocumentFacts(db: AccountQueryable, entries: CatalogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const present = await db.query(`SELECT to_regclass('document_scenes') IS NOT NULL AS present`);
  if ((present.rows[0] as { present: boolean }).present !== true) return;
  const facts = await db.query(
    `SELECT sc.stage_id,
            COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE sc.data->>'type' = 'quiz')::int AS quizzes,
            COUNT(*) FILTER (WHERE sc.data->>'type' IN ('interactive', 'pbl'))::int AS interactive,
            MAX(st.updated_at) AS updated_at
       FROM document_scenes sc
       LEFT JOIN document_stages st ON st.id = sc.stage_id
      WHERE sc.stage_id = ANY($1::text[])
      GROUP BY sc.stage_id`,
    [entries.map((entry) => entry.courseId)],
  );
  const byCourse = new Map(
    (
      facts.rows as Array<{
        stage_id: string;
        n: number;
        quizzes: number;
        interactive: number;
        updated_at: number | string | null;
      }>
    ).map((row) => [row.stage_id, row]),
  );
  for (const entry of entries) {
    const row = byCourse.get(entry.courseId);
    if (!row) continue;
    entry.sceneCount = row.n;
    entry.hasQuiz = row.quizzes > 0;
    entry.hasInteractive = row.interactive > 0;
    // A shared course keeps its approval time: readers see the approved copy, not later edits.
    const edited = Number(row.updated_at);
    if (entry.updatedAt === undefined && row.updated_at !== null && Number.isFinite(edited)) {
      entry.updatedAt = new Date(edited).toISOString();
    }
  }
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: number;
  actorId: string;
  /** The actor's username, when the account still exists. */
  actorName: string | null;
  targetId: string;
  /** The target's username or class name, when it still exists. */
  targetName: string | null;
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
    `SELECT l.id, l.actor_id, actor.username AS actor_name, l.target_id,
            COALESCE(target.username, c.name) AS target_name, l.action, l.reason, l.created_at
       FROM account_admin_audit l
       LEFT JOIN accounts actor ON actor.id = l.actor_id
       LEFT JOIN accounts target ON target.id = l.target_id
       LEFT JOIN classes c ON c.id = l.target_id
      WHERE ($1::bigint IS NULL OR l.id < $1::bigint)
      ORDER BY l.id DESC
      LIMIT $2::int`,
    [beforeId ?? null, limit],
  );
  return (
    result.rows as Array<{
      id: number | string;
      actor_id: string;
      actor_name: string | null;
      target_id: string;
      target_name: string | null;
      action: string;
      reason: string | null;
      created_at: Date | string;
    }>
  ).map((row) => ({
    id: Number(row.id),
    actorId: row.actor_id,
    actorName: row.actor_name,
    targetId: row.target_id,
    targetName: row.target_name,
    action: row.action,
    reason: row.reason,
    createdAt: toIso(row.created_at),
  }));
}

// ── Render jobs ──────────────────────────────────────────────────────────────

/** Records which owner submitted a video render, so its status and download stay with that owner. */
export async function recordRenderJob(
  db: AccountQueryable,
  jobId: string,
  ownerId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO render_jobs (job_id, owner_id) VALUES ($1::text, $2::text)
     ON CONFLICT (job_id) DO NOTHING`,
    [jobId, ownerId],
  );
}

/** The owner that submitted a render job, or undefined when no record exists. */
export async function readRenderJobOwner(
  db: AccountQueryable,
  jobId: string,
): Promise<string | undefined> {
  const result = await db.query(`SELECT owner_id FROM render_jobs WHERE job_id = $1::text`, [
    jobId,
  ]);
  const row = result.rows[0] as { owner_id: string } | undefined;
  return row?.owner_id;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardCounts {
  /** Memberships that are not suspended and have not expired. */
  activeMembers: number;
  /** Share requests waiting for a decision. */
  pendingShares: number;
  pendingAccessRequests: number;
  classes: number;
}

export async function readDashboardCounts(
  db: AccountQueryable,
  now: Date,
): Promise<DashboardCounts> {
  const result = await db.query(
    `SELECT
       (SELECT count(*) FROM memberships WHERE status = 'active' AND expires_at > $1::timestamptz) AS active_members,
       (SELECT count(*) FROM course_shares WHERE state = 'pending') AS pending_shares,
       (SELECT count(*) FROM access_requests WHERE state = 'pending') AS pending_access_requests,
       (SELECT count(*) FROM classes) AS classes`,
    [now.toISOString()],
  );
  const row = result.rows[0] as {
    active_members: number | string;
    pending_shares: number | string;
    pending_access_requests: number | string;
    classes: number | string;
  };
  return {
    activeMembers: Number(row.active_members),
    pendingShares: Number(row.pending_shares),
    pendingAccessRequests: Number(row.pending_access_requests),
    classes: Number(row.classes),
  };
}

/** Days before expiry at which a membership counts as expiring soon. */
export const EXPIRING_SOON_DAYS = 7;

/** Raw facts the operations page derives its warnings from. Nothing here changes state. */
export interface OpsHealthFacts {
  readonly memberships: {
    readonly active: number;
    readonly expiringSoon: number;
    readonly expired: number;
    readonly suspended: number;
    /** Learner accounts that never had a membership. */
    readonly none: number;
  };
  /** Enabled accounts by role, and disabled accounts of any role. */
  readonly accounts: {
    readonly learner: number;
    readonly operator: number;
    readonly admin: number;
    readonly disabled: number;
  };
  readonly accessRequests: {
    readonly pending: number;
    readonly approved: number;
    readonly rejected: number;
  };
  readonly shares: { readonly pending: number; readonly shared: number };
  readonly previews: number;
  readonly oldestPendingAccessRequest: string | null;
  readonly oldestPendingShare: string | null;
  /** Active memberships expiring within EXPIRING_SOON_DAYS, soonest first, at most 20. */
  readonly expiring: readonly { accountId: string; username: string; expiresAt: string }[];
  /** Every active, unexpired membership with its monthly quota, for the quota check. */
  readonly metered: readonly { accountId: string; username: string; monthlyQuota: number }[];
  /** Reader-reward bonus tokens for `month`, by owner key. */
  readonly bonusByOwner: ReadonlyMap<string, number>;
}

export async function readOpsHealthFacts(
  db: AccountQueryable,
  now: Date,
  month: string,
): Promise<OpsHealthFacts> {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000).toISOString();
  const at = now.toISOString();
  const counts = await db.query(
    `SELECT
       (SELECT count(*) FROM memberships WHERE status = 'active' AND expires_at > $2::timestamptz) AS active,
       (SELECT count(*) FROM memberships WHERE status = 'active' AND expires_at > $1::timestamptz AND expires_at <= $2::timestamptz) AS expiring_soon,
       (SELECT count(*) FROM memberships WHERE status = 'active' AND expires_at <= $1::timestamptz) AS expired,
       (SELECT count(*) FROM memberships WHERE status = 'suspended') AS suspended,
       (SELECT count(*) FROM accounts a WHERE a.role = 'learner' AND a.disabled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.account_id = a.id)) AS none,
       (SELECT count(*) FROM accounts WHERE disabled_at IS NULL AND role = 'learner') AS learners,
       (SELECT count(*) FROM accounts WHERE disabled_at IS NULL AND role = 'operator') AS operators,
       (SELECT count(*) FROM accounts WHERE disabled_at IS NULL AND role = 'admin') AS admins,
       (SELECT count(*) FROM accounts WHERE disabled_at IS NOT NULL) AS disabled_accounts,
       (SELECT count(*) FROM access_requests WHERE state = 'pending') AS access_pending,
       (SELECT count(*) FROM access_requests WHERE state = 'approved') AS access_approved,
       (SELECT count(*) FROM access_requests WHERE state = 'rejected') AS access_rejected,
       (SELECT count(*) FROM course_shares WHERE state = 'pending') AS shares_pending,
       (SELECT count(*) FROM course_shares WHERE state = 'shared') AS shares_shared,
       (SELECT count(*) FROM course_previews) AS previews,
       (SELECT min(requested_at) FROM access_requests WHERE state = 'pending') AS oldest_access_request,
       (SELECT min(requested_at) FROM course_shares WHERE state = 'pending') AS oldest_share`,
    [at, soon],
  );
  const row = counts.rows[0] as Record<string, number | string | Date | null>;
  const iso = (value: unknown) => (value == null ? null : new Date(value as string).toISOString());

  const expiring = await db.query(
    `SELECT a.id, a.username, m.expires_at
       FROM memberships m JOIN accounts a ON a.id = m.account_id
      WHERE m.status = 'active' AND m.expires_at > $1::timestamptz AND m.expires_at <= $2::timestamptz
      ORDER BY m.expires_at
      LIMIT 20`,
    [at, soon],
  );
  const metered = await db.query(
    `SELECT a.id, a.username, m.monthly_token_quota
       FROM memberships m JOIN accounts a ON a.id = m.account_id
      WHERE m.status = 'active' AND m.expires_at > $1::timestamptz AND a.role = 'learner'`,
    [at],
  );
  const bonus = await db.query(`SELECT owner_id, tokens FROM quota_bonus WHERE month = $1::text`, [
    month,
  ]);

  return {
    memberships: {
      active: Number(row.active),
      expiringSoon: Number(row.expiring_soon),
      expired: Number(row.expired),
      suspended: Number(row.suspended),
      none: Number(row.none),
    },
    accounts: {
      learner: Number(row.learners),
      operator: Number(row.operators),
      admin: Number(row.admins),
      disabled: Number(row.disabled_accounts),
    },
    accessRequests: {
      pending: Number(row.access_pending),
      approved: Number(row.access_approved),
      rejected: Number(row.access_rejected),
    },
    shares: { pending: Number(row.shares_pending), shared: Number(row.shares_shared) },
    previews: Number(row.previews),
    oldestPendingAccessRequest: iso(row.oldest_access_request),
    oldestPendingShare: iso(row.oldest_share),
    expiring: (
      expiring.rows as Array<{ id: string; username: string; expires_at: Date | string }>
    ).map((r) => ({
      accountId: r.id,
      username: r.username,
      expiresAt: new Date(r.expires_at).toISOString(),
    })),
    metered: (
      metered.rows as Array<{ id: string; username: string; monthly_token_quota: number | string }>
    ).map((r) => ({
      accountId: r.id,
      username: r.username,
      monthlyQuota: Number(r.monthly_token_quota),
    })),
    bonusByOwner: new Map(
      (bonus.rows as Array<{ owner_id: string; tokens: number | string }>).map((r) => [
        r.owner_id,
        Number(r.tokens),
      ]),
    ),
  };
}
