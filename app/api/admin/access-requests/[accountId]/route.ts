import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import {
  ACCESS_APPROVAL_DAYS,
  DEFAULT_MONTHLY_QUOTA_TOKENS,
  decideAccessRequest,
  readMembership,
} from '@/lib/server/learning/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ accountId: string }> };

const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 200;

/**
 * Decides a pending request. Body: { decision: 'approve' | 'reject', reason? }. Approve grants the
 * default membership (`ACCESS_APPROVAL_DAYS` days, `DEFAULT_MONTHLY_QUOTA_TOKENS` tokens a month);
 * the operator can change it afterwards in the members panel.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { accountId } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'membership.manage');
      if (refusal) return refusal;
      if (!ACCOUNT_ID_PATTERN.test(accountId)) return invalid('Invalid account id');
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const { decision, reason } = body.body;
      if (decision !== 'approve' && decision !== 'reject') {
        return invalid('decision must be approve or reject');
      }
      if (reason !== undefined && (typeof reason !== 'string' || reason.length > REASON_MAX)) {
        return invalid(`reason must be text of at most ${REASON_MAX} characters`);
      }
      if (decision === 'approve') {
        // An approval must not resume a membership an administrator paused.
        const membership = await readMembership(ctx.db, accountId, ctx.now);
        if (membership?.status === 'suspended') {
          return apiError('MEMBERSHIP_SUSPENDED', 409, 'This membership is paused.');
        }
      }
      const decided = await decideAccessRequest(ctx.db, {
        actorId: ctx.viewer.accountId!,
        accountId,
        decision,
        days: ACCESS_APPROVAL_DAYS,
        monthlyQuota: DEFAULT_MONTHLY_QUOTA_TOKENS,
        reason: typeof reason === 'string' && reason !== '' ? reason : undefined,
        now: ctx.now,
      });
      if (!decided) return apiError('NOT_FOUND', 404, 'No pending request for this account.');
      return apiSuccess({ accountId, decision });
    },
    { mutating: true },
  );
}
