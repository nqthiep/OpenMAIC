/**
 * What the learner's home says about their membership and which course it offers to continue.
 * Pure functions: the components fetch, these decide. The shapes are structural so the session
 * and usage types from the account and learning clients fit without importing them here.
 */

export interface MembershipLike {
  readonly status: 'active' | 'suspended';
  /** True when the membership is not suspended and has not expired. */
  readonly active: boolean;
  readonly expiresAt: string;
}

export interface UsageLike {
  readonly active: boolean;
  readonly quota?: number;
  readonly bonus?: number;
  readonly used?: number;
}

export type MembershipNoticeKind =
  | 'none'
  | 'ok'
  | 'expiring'
  | 'quotaNear'
  | 'quotaOut'
  | 'expired'
  | 'suspended';

export interface MembershipNotice {
  readonly kind: MembershipNoticeKind;
  /** Whole days until the membership ends, rounded up. Set only for an active membership. */
  readonly daysLeft?: number;
  /** Share of the running cycle's allowance used, 0 to 100. Set only when the usage is known. */
  readonly percentUsed?: number;
}

/** A membership with fewer days than this left gets a warning. */
export const EXPIRING_WITHIN_DAYS = 7;
/** Share of the monthly allowance at which the home starts to warn. */
export const QUOTA_NEAR_PERCENT = 80;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single message the status strip shows. The blocking states come first: a suspended or
 * expired membership, then a used-up allowance, then the two warnings, then plain information.
 * The allowance test is the server's own (`used >= quota + bonus`), so the interface never
 * locks something the server would allow, nor the reverse.
 */
export function membershipNotice(
  membership: MembershipLike | null | undefined,
  usage: UsageLike | null | undefined,
  now: Date,
): MembershipNotice {
  if (!membership) return { kind: 'none' };
  if (membership.status === 'suspended') return { kind: 'suspended' };
  const msLeft = Date.parse(membership.expiresAt) - now.getTime();
  if (!membership.active || !(msLeft > 0)) return { kind: 'expired' };

  const daysLeft = Math.ceil(msLeft / DAY_MS);
  let percentUsed: number | undefined;
  if (usage?.active && usage.quota !== undefined) {
    const used = usage.used ?? 0;
    const limit = usage.quota + (usage.bonus ?? 0);
    percentUsed = limit > 0 ? Math.min(100, Math.floor((used / limit) * 100)) : 100;
    if (used >= limit) return { kind: 'quotaOut', daysLeft, percentUsed };
  }
  if (msLeft < EXPIRING_WITHIN_DAYS * DAY_MS) return { kind: 'expiring', daysLeft, percentUsed };
  if (percentUsed !== undefined && percentUsed >= QUOTA_NEAR_PERCENT) {
    return { kind: 'quotaNear', daysLeft, percentUsed };
  }
  return { kind: 'ok', daysLeft, percentUsed };
}

export interface ContinueCandidate {
  readonly id: string;
  readonly sceneCount: number;
  /** When the course last changed, in milliseconds since the epoch. */
  readonly updatedAt: number;
}

/**
 * The course to offer under "Continue": the one studied last. `studiedAt` holds the time of the
 * saved position for the courses that have one (milliseconds since the epoch). A course with a
 * position always beats one without, so renaming or editing an old course does not take its
 * place. When no course has a position yet, the one changed last is offered. Courses without
 * scenes are skipped. On a tie the earlier entry wins, and the list arrives newest first.
 */
export function pickContinue<T extends ContinueCandidate>(
  courses: readonly T[],
  studiedAt: ReadonlyMap<string, number>,
): T | undefined {
  let studied: T | undefined;
  let studiedBest = -Infinity;
  let changed: T | undefined;
  let changedBest = -Infinity;
  for (const course of courses) {
    if (course.sceneCount <= 0) continue;
    const at = studiedAt.get(course.id);
    if (at !== undefined && at > studiedBest) {
      studied = course;
      studiedBest = at;
    }
    if (course.updatedAt > changedBest) {
      changed = course;
      changedBest = course.updatedAt;
    }
  }
  return studied ?? changed;
}
