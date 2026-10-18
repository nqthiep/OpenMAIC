/**
 * Shared shape for the learning routes: accounts must be on, a write must be same-origin,
 * the viewer is resolved without minting a cookie, and every decision goes through `can`.
 */
import { apiError } from '@/lib/server/api-response';
import { accountServiceDeps, accountsEnabled } from '@/lib/server/accounts/runtime';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  readJsonObject,
  runAccountRoute,
} from '@/lib/server/accounts/http';
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { can, type Action, type Resource } from '@/lib/server/authz/policy';
import { resolveViewer, type ResolvedViewer } from '@/lib/server/authz/viewer';
import { isBanned } from '@/lib/server/learning/community';

export interface LearningContext {
  viewer: ResolvedViewer;
  db: AccountQueryable;
  now: Date;
}

export async function learningRoute(
  request: Request,
  handler: (ctx: LearningContext) => Promise<Response>,
  options: { mutating?: boolean } = {},
): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (options.mutating && isCrossSiteRequest(request)) return crossSiteRefusal();
    const viewer = await resolveViewer(request.headers);
    const deps = await accountServiceDeps();
    return handler({ viewer, db: deps.db, now: new Date() });
  });
}

/** A refusal for `action`, or undefined when the viewer may proceed. */
export function authorize(
  ctx: LearningContext,
  action: Action,
  resource: Resource = {},
): Response | undefined {
  if (can(ctx.viewer, action, resource)) return undefined;
  if (ctx.viewer.accountId === undefined) {
    return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
  }
  return apiError('FORBIDDEN', 403, 'You do not have permission for this.');
}

/** The JSON object of a request body, or the refusal to send back. */
export async function bodyOf(
  request: Request,
  maxBytes?: number,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  return readJsonObject(request, maxBytes);
}

export function invalid(message: string): Response {
  return apiError('INVALID_REQUEST', 400, message);
}

/** A refusal for asking, answering or voting in the community, or undefined when the viewer may. */
export async function communityPostRefusal(ctx: LearningContext): Promise<Response | undefined> {
  if (ctx.viewer.accountId === undefined) {
    return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
  }
  if (!can(ctx.viewer, 'community.post')) {
    return apiError('MEMBERSHIP_REQUIRED', 403, 'An active membership is needed to post.');
  }
  if (await isBanned(ctx.db, ctx.viewer.accountId)) {
    return apiError('COMMUNITY_BLOCKED', 403, 'Posting is blocked for this account.');
  }
  return undefined;
}
