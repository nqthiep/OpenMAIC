/**
 * Who is calling, and what the caller may do with a course or a model. Reads the session
 * cookie and the anonymous cookie. Never mints a cookie: a request that owns nothing yet
 * simply has no owner.
 */
import { readAnonymousOwnerId } from '@/lib/server/agent-runtime/owner';
import { accountOwnerId } from '@/lib/server/accounts/service';
import {
  accountServiceDeps,
  accountsEnabled,
  resolveRequestAccount,
} from '@/lib/server/accounts/runtime';
import { apiError } from '@/lib/server/api-response';
import { readClassroomAccess } from '@/lib/server/classroom-storage';
import {
  isCourseInClassOf,
  isCoursePreview,
  readBonusTokens,
  readCourseShare,
  readMembership,
  recordCourseRead,
} from '@/lib/server/learning/store';
import { monthlyLlmTokens } from '@/lib/server/usage-storage';

import { enterSpendOwner } from './spend-context';
import { can, type Viewer } from './policy';

export interface ResolvedViewer extends Viewer {
  /** The monthly token allowance of the signed-in account's membership, when it has one. */
  monthlyQuota?: number;
}

/** The UTC month a usage record and a quota belong to, as `YYYY-MM`. */
export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function resolveViewer(headers: Headers): Promise<ResolvedViewer> {
  const account = await resolveRequestAccount(headers);
  if (account) {
    const deps = await accountServiceDeps();
    const membership = await readMembership(deps.db, account.accountId, new Date());
    return {
      accountId: account.accountId,
      ownerId: accountOwnerId(account.accountId),
      role: account.role,
      memberActive: membership?.active === true,
      monthlyQuota: membership?.monthlyQuota,
    };
  }
  return { ownerId: readAnonymousOwnerId(headers) };
}

/**
 * Whether the caller may read a classroom by id. With accounts off there is no identity to
 * check, so every classroom stays readable as before.
 */
export async function canReadClassroom(headers: Headers, classroomId: string): Promise<boolean> {
  if (!accountsEnabled()) return true;
  const viewer = await resolveViewer(headers);
  const facts = await courseFacts(viewer, classroomId);
  return can(viewer, 'classroom.read', facts);
}

async function courseFacts(viewer: ResolvedViewer, courseId: string) {
  const deps = await accountServiceDeps();
  const access = await readClassroomAccess(courseId);
  const share = await readCourseShare(deps.db, courseId);
  return {
    ownerId: access?.ownerId,
    shared: share?.state === 'shared',
    previewed: await isCoursePreview(deps.db, courseId),
    inClass: viewer.accountId
      ? await isCourseInClassOf(deps.db, viewer.accountId, courseId)
      : false,
  };
}

/**
 * Credits the author of a shared course the first time an active member reads it. Staff reads
 * and the author's own reads earn nothing. Never throws: a failed reward must not break a read.
 */
export async function rewardReaderIfEligible(headers: Headers, classroomId: string): Promise<void> {
  if (!accountsEnabled()) return;
  try {
    const viewer = await resolveViewer(headers);
    if (!viewer.accountId || !viewer.memberActive || viewer.role !== 'learner') return;
    const deps = await accountServiceDeps();
    const access = await readClassroomAccess(classroomId);
    const share = await readCourseShare(deps.db, classroomId);
    if (!access || share?.state !== 'shared' || access.ownerId === viewer.ownerId) return;
    await recordCourseRead(deps.db, {
      courseId: classroomId,
      readerId: viewer.accountId,
      authorId: access.ownerId,
      month: currentMonth(),
      now: new Date(),
    });
  } catch (error) {
    console.error('[learning] reader reward failed', error);
  }
}

/**
 * Gate for a route that spends the operator's model budget. With accounts off there is no
 * identity to check, so the route runs as before. With accounts on, a visitor without a live
 * session gets 401. A learner needs an active membership and some of the monthly allowance
 * left, counting reader rewards. Staff are not metered. The usage the call makes is charged to
 * the caller's owner for the rest of the request.
 */
export async function requireSpender(headers: Headers): Promise<Response | undefined> {
  if (!accountsEnabled()) return undefined;
  const viewer = await resolveViewer(headers);
  if (!can(viewer, 'spend') || viewer.ownerId === undefined) {
    return apiError('LOGIN_REQUIRED', 401, 'Sign in to use AI generation.');
  }
  if (viewer.role === 'learner') {
    if (!viewer.memberActive) {
      return apiError(
        'MEMBERSHIP_REQUIRED',
        403,
        'An active membership is needed to create courses with AI.',
      );
    }
    const month = currentMonth();
    const deps = await accountServiceDeps();
    const used = await monthlyLlmTokens(viewer.ownerId, month);
    const bonus = await readBonusTokens(deps.db, viewer.ownerId, month);
    if (used >= (viewer.monthlyQuota ?? 0) + bonus) {
      return apiError('QUOTA_EXCEEDED', 403, 'This month’s AI allowance is used up.');
    }
  }
  enterSpendOwner(viewer.ownerId);
  return undefined;
}
