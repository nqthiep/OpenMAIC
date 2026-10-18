import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import {
  ACCESS_REQUEST_NOTE_MAX,
  ACCESS_REQUEST_RETRY_HOURS,
  createAccessRequest,
  readAccessRequest,
} from '@/lib/server/learning/store';

export const runtime = 'nodejs';

/**
 * The signed-in learner's request for a membership, or null when they never asked. `retryAt` is
 * set after a rejection: the moment the learner may ask again.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    if (ctx.viewer.accountId === undefined) {
      return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
    }
    const found = await readAccessRequest(ctx.db, ctx.viewer.accountId);
    const retryAt =
      found?.state === 'rejected' && found.decidedAt
        ? new Date(
            new Date(found.decidedAt).getTime() + ACCESS_REQUEST_RETRY_HOURS * 3_600_000,
          ).toISOString()
        : null;
    return apiSuccess({ request: found ?? null, retryAt });
  });
}

const REFUSALS = {
  ALREADY_MEMBER: [409, 'You already have an active membership.'],
  MEMBERSHIP_SUSPENDED: [403, 'Your membership is paused by an administrator.'],
  REQUEST_PENDING: [409, 'A request is already waiting for an administrator.'],
  REQUEST_TOO_SOON: [429, 'A rejected request can be sent again later.'],
} as const;

/**
 * Asks the administrators for a membership. Body: { note? } with a note of at most
 * `ACCESS_REQUEST_NOTE_MAX` characters. For a signed-in learner whose membership is not active.
 */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      if (ctx.viewer.accountId === undefined) {
        return apiError('UNAUTHENTICATED', 401, 'Sign in to continue.');
      }
      // A member may ask only to renew a membership that ends soon.
      if (ctx.viewer.memberActive === true && ctx.viewer.memberRenewable !== true) {
        return apiError('ALREADY_MEMBER', REFUSALS.ALREADY_MEMBER[0], REFUSALS.ALREADY_MEMBER[1]);
      }
      const refusal = authorize(ctx, 'access.request');
      if (refusal) return refusal;

      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const { note } = body.body;
      if (
        note !== undefined &&
        (typeof note !== 'string' || note.length > ACCESS_REQUEST_NOTE_MAX)
      ) {
        return invalid(`note must be text of at most ${ACCESS_REQUEST_NOTE_MAX} characters`);
      }
      const trimmed = typeof note === 'string' ? note.trim() : '';

      const result = await createAccessRequest(ctx.db, {
        accountId: ctx.viewer.accountId,
        note: trimmed === '' ? undefined : trimmed,
        now: ctx.now,
      });
      if (!result.ok) {
        const [status, message] = REFUSALS[result.reason];
        return apiError(result.reason, status, message);
      }
      return apiSuccess({ request: result.request }, 201);
    },
    { mutating: true },
  );
}
