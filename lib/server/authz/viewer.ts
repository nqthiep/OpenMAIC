/**
 * Who is calling, and what the caller may do with a course or a model. Reads the session
 * cookie and the anonymous cookie. Never mints a cookie: a request that owns nothing yet
 * simply has no owner.
 */
import { authenticateRequestOwner } from '@/lib/server/identity/with-owner';
import { accountOwnerId } from '@/lib/server/accounts/service';
import {
  accountServiceDeps,
  accountsEnabled,
  resolveRequestAccount,
} from '@/lib/server/accounts/runtime';
import { EXPIRING_WITHIN_DAYS } from '@/lib/home/learner-status';
import { apiError } from '@/lib/server/api-response';
import { readClassroomAccess } from '@/lib/server/classroom-storage';
import {
  isCourseInClassOf,
  isCoursePreview,
  READER_REWARD_TOKENS,
  readBonusTokens,
  readCourseShare,
  readMembership,
  readRenderJobOwner,
  type MembershipView,
  recordCourseRead,
} from '@/lib/server/learning/store';
import { readRemixSource } from '@/lib/server/learning/remix';
import { providerConfigNotReadyResponse } from '@/lib/server/provider-store/not-ready';
import { readSetting } from '@/lib/server/learning/settings';
import { resolveStageAccess } from '@/lib/server/stage-access';
import { llmTokensBetween } from '@/lib/server/usage-storage';

import { enterSpendOwner } from './spend-context';
import { can, type Viewer } from './policy';

export interface ResolvedViewer extends Viewer {
  /** The token allowance of the cycle in force for the signed-in account's membership, when it has one. */
  monthlyQuota?: number;
  /** The membership record, when the account has one. Returned only to the account's own session. */
  membership?: MembershipView | null;
}

/** The UTC month, as `YYYY-MM`: what the monthly challenge leaderboard counts in. Quotas count in cycles (`cycle.ts`). */
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
      memberRenewable:
        membership?.active === true &&
        new Date(membership.expiresAt).getTime() - Date.now() < EXPIRING_WITHIN_DAYS * 86_400_000,
      monthlyQuota: membership?.monthlyQuota,
      membership: membership ?? null,
    };
  }
  // A visitor who already holds an anonymous cookie owns what that cookie names; one without it
  // owns nothing yet (resolution would mint an id, which nothing could ever have owned).
  const owner = await authenticateRequestOwner({ headers });
  const minted = owner.ok && owner.responseHeaders.has('set-cookie');
  return {
    ownerId:
      owner.ok && owner.principal.kind === 'anonymous' && !minted
        ? owner.principal.ownerId
        : undefined,
  };
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

/**
 * Whether the caller may read a course stored as a server document. Its owner comes from
 * `stage_meta`, and a published course is open to everyone. Otherwise the rule is the one
 * `canReadClassroom` applies, so a private course is for its owner (and staff) only.
 */
export async function canReadStageDocument(
  headers: Headers,
  stage: { stageId: string; ownerId: string; isPublic: boolean },
): Promise<boolean> {
  if (stage.isPublic || !accountsEnabled()) return true;
  const viewer = await resolveViewer(headers);
  if (viewer.ownerId === stage.ownerId) return true;
  return can(viewer, 'classroom.read', await courseFacts(viewer, stage.stageId, stage.ownerId));
}

/**
 * `canReadStageDocument` by id, for a route that reads through the owner-scoped store (whose
 * reads are open by id). `ownerId` is the request's owner. Absent or deleted reads as false.
 */
export async function canReadStageById(
  headers: Headers,
  stageId: string,
  ownerId: string,
): Promise<boolean> {
  const access = await resolveStageAccess(stageId);
  if (!access) return false;
  return access.ownerId === ownerId || canReadStageDocument(headers, access);
}

async function courseFacts(viewer: ResolvedViewer, courseId: string, ownerId?: string) {
  const deps = await accountServiceDeps();
  const share = await readCourseShare(deps.db, courseId);
  return {
    ownerId: ownerId ?? (await readClassroomAccess(courseId))?.ownerId,
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
    // A remix also pays the author of the course it came from, unless that author is the reader.
    const source = await readRemixSource(deps.db, classroomId);
    const percent = source ? await readSetting(deps.db, 'remix.royaltyPercent') : 0;
    await recordCourseRead(deps.db, {
      courseId: classroomId,
      readerId: viewer.accountId,
      authorId: access.ownerId,
      now: new Date(),
      ...(source?.sourceOwnerId && source.sourceOwnerId !== viewer.ownerId
        ? {
            royalty: {
              ownerId: source.sourceOwnerId,
              tokens: Math.floor((READER_REWARD_TOKENS * percent) / 100),
            },
          }
        : {}),
    });
  } catch (error) {
    console.error('[learning] reader reward failed', error);
  }
}

/**
 * Gate for a route that any signed-in account may use, whatever its role or membership. With
 * accounts off nothing is checked.
 */
export async function requireSignedIn(headers: Headers): Promise<Response | undefined> {
  if (!accountsEnabled()) return undefined;
  if (await resolveRequestAccount(headers)) return undefined;
  return apiError('LOGIN_REQUIRED', 401, 'Sign in to use this.');
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
  // Every AI route passes through here first: while the provider settings are not loaded, answer
  // 503 with a retry hint rather than let a lookup see an empty (or half-built) provider config.
  const notReady = providerConfigNotReadyResponse();
  if (notReady) return notReady;
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
    const cycle = viewer.membership?.cycle;
    if (!cycle) {
      return apiError('MEMBERSHIP_REQUIRED', 403, 'No membership period is running.');
    }
    const deps = await accountServiceDeps();
    const used = await llmTokensBetween(viewer.ownerId, new Date(cycle.start), new Date(cycle.end));
    const bonus = await readBonusTokens(deps.db, viewer.ownerId, cycle.key);
    if (used >= (viewer.monthlyQuota ?? 0) + bonus) {
      return apiError('QUOTA_EXCEEDED', 403, 'The AI allowance of this period is used up.');
    }
  }
  enterSpendOwner(viewer.ownerId);
  return undefined;
}

/**
 * Gate for a route that renders a course to video. With accounts off there is no identity to
 * check. With accounts on, a visitor without a live session gets 401, and a signed-in account
 * without an active membership (and not staff) gets 403. On success returns the owner the render
 * is recorded under, or none when accounts are off.
 */
export async function requireExporter(
  headers: Headers,
): Promise<{ ownerId?: string; denied?: Response }> {
  if (!accountsEnabled()) return {};
  const viewer = await resolveViewer(headers);
  if (viewer.accountId === undefined) {
    return { denied: apiError('LOGIN_REQUIRED', 401, 'Sign in to export a course.') };
  }
  if (!can(viewer, 'export.course')) {
    return {
      denied: apiError(
        'MEMBERSHIP_REQUIRED',
        403,
        'An active membership is needed to export a course.',
      ),
    };
  }
  return { ownerId: viewer.ownerId };
}

/**
 * Gate for the status, cancel and download routes of a render job. Staff pass. Anyone else
 * passes only when they submitted the job. A job the caller may not see answers 404, the same as
 * a job that does not exist, so job ids cannot be probed. With accounts off nothing is checked.
 */
export async function requireRenderJobOwner(
  headers: Headers,
  jobId: string,
): Promise<Response | undefined> {
  if (!accountsEnabled()) return undefined;
  const viewer = await resolveViewer(headers);
  const deps = await accountServiceDeps();
  const ownerId = await readRenderJobOwner(deps.db, jobId);
  if (ownerId === undefined || !can(viewer, 'job.read', { ownerId })) {
    return apiError('NOT_FOUND', 404, 'Render job not found');
  }
  return undefined;
}
