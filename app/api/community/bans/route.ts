import { normalizeUsername } from '@/lib/server/accounts/validation';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { listBans, setBan } from '@/lib/server/learning/community';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { findAccountIdByUsername } from '@/lib/server/learning/support';

export const runtime = 'nodejs';

const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 200;

/** Accounts blocked from posting. Staff only. */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'community.moderate');
    if (refusal) return refusal;
    return apiSuccess({ bans: await listBans(ctx.db) });
  });
}

/**
 * Blocks or unblocks posting. Body: { accountId | username, banned, reason? }. Staff only; the
 * change is written to the audit log.
 */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.moderate');
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      const { accountId, username, banned, reason } = read.body;
      if (typeof banned !== 'boolean') return invalid('banned must be true or false');
      if (reason !== undefined && (typeof reason !== 'string' || reason.length > REASON_MAX)) {
        return invalid(`reason must be text of at most ${REASON_MAX} characters`);
      }
      let target: string | undefined;
      if (typeof accountId === 'string' && ACCOUNT_ID_PATTERN.test(accountId)) {
        target = accountId;
      } else {
        const name = normalizeUsername(username);
        target = name ? await findAccountIdByUsername(ctx.db, name) : undefined;
      }
      if (!target) return apiError('NOT_FOUND', 404, 'No such account.');
      if (target === ctx.viewer.accountId) return invalid('You cannot block yourself.');
      await setBan(ctx.db, {
        accountId: target,
        banned,
        actorId: ctx.viewer.accountId!,
        reason: typeof reason === 'string' && reason !== '' ? reason : undefined,
        now: ctx.now,
      });
      return apiSuccess({ accountId: target, banned });
    },
    { mutating: true },
  );
}
