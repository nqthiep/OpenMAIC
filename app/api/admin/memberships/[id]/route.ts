import { apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import {
  DEFAULT_MONTHLY_QUOTA_TOKENS,
  grantMembership,
  readMembership,
  revokeMembership,
  setMembershipStatus,
  updateMembership,
} from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 200;

/**
 * Grants, extends, edits, suspends, resumes or revokes the membership of one account. Every change
 * is written to the audit log. Body: { action: 'grant', days, monthlyQuota?, reason? }
 * | { action: 'update', expiresAt, monthlyQuota } | { action: 'suspend' | 'resume', reason? }
 * | { action: 'revoke' }
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'membership.manage');
      if (refusal) return refusal;
      if (!ACCOUNT_ID_PATTERN.test(id)) return invalid('Invalid account id');
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const { action, days, monthlyQuota, reason, expiresAt } = body.body;
      if (reason !== undefined && (typeof reason !== 'string' || reason.length > REASON_MAX)) {
        return invalid(`reason must be text of at most ${REASON_MAX} characters`);
      }
      const note = typeof reason === 'string' ? reason : undefined;
      const actorId = ctx.viewer.accountId!;

      if (action === 'grant') {
        if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 3650) {
          return invalid('days must be a whole number from 1 to 3650');
        }
        const quota = monthlyQuota === undefined ? DEFAULT_MONTHLY_QUOTA_TOKENS : monthlyQuota;
        if (typeof quota !== 'number' || !Number.isInteger(quota) || quota < 0) {
          return invalid('monthlyQuota must be a whole number of tokens, 0 or more');
        }
        const granted = await grantMembership(ctx.db, {
          actorId,
          targetId: id,
          days,
          monthlyQuota: quota,
          reason: note,
          now: ctx.now,
        });
        if (!granted) return invalid('Account not found');
      } else if (action === 'suspend' || action === 'resume') {
        const changed = await setMembershipStatus(ctx.db, {
          actorId,
          targetId: id,
          status: action === 'suspend' ? 'suspended' : 'active',
          reason: note,
          now: ctx.now,
        });
        if (!changed) return invalid('This account has no membership');
      } else if (action === 'update') {
        const until = typeof expiresAt === 'string' ? new Date(expiresAt) : new Date(NaN);
        if (Number.isNaN(until.getTime())) return invalid('expiresAt must be a date');
        if (
          typeof monthlyQuota !== 'number' ||
          !Number.isInteger(monthlyQuota) ||
          monthlyQuota < 0
        ) {
          return invalid('monthlyQuota must be a whole number of tokens, 0 or more');
        }
        const changed = await updateMembership(ctx.db, {
          actorId,
          targetId: id,
          expiresAt: until,
          monthlyQuota,
          now: ctx.now,
        });
        if (!changed) return invalid('This account has no membership');
      } else if (action === 'revoke') {
        const revoked = await revokeMembership(ctx.db, { actorId, targetId: id, now: ctx.now });
        if (!revoked) return invalid('This account has no membership');
        return apiSuccess({ membership: null });
      } else {
        return invalid('action must be grant, update, suspend, resume or revoke');
      }
      return apiSuccess({ membership: await readMembership(ctx.db, id, ctx.now) });
    },
    { mutating: true },
  );
}
