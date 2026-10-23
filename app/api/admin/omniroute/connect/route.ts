import { apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { connect, disconnect, rotate } from '@/lib/server/omniroute/connect';
import { failureResponse } from '@/lib/server/omniroute/responses';

export const runtime = 'nodejs';

const BODY_MAX_BYTES = 8 * 1024;
const MAX_CONNECTIONS = 100;
const MAX_DAILY_LIMIT_USD = 1_000_000;

/**
 * Gives OpenMAIC its key in OmniRoute, limited to the connections ticked. Body
 * `{ connectionIds, noLog, dailyLimitUsd }` creates the key (or changes what it may use);
 * `{ rotate: true }` issues a new secret. The key goes into the encrypted store and is never
 * returned. Administrators only.
 */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request, BODY_MAX_BYTES);
      if (!body.ok) return body.response;
      const actor = { actorId: ctx.viewer.accountId!, now: ctx.now };
      try {
        if (body.body.rotate === true) return apiSuccess({ key: await rotate(ctx.db, actor) });

        const { connectionIds, noLog, dailyLimitUsd } = body.body;
        if (
          !Array.isArray(connectionIds) ||
          connectionIds.length > MAX_CONNECTIONS ||
          !connectionIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 100)
        ) {
          return invalid('connectionIds must be a list of connection ids');
        }
        if (typeof noLog !== 'boolean') return invalid('noLog must be true or false');
        const limit = dailyLimitUsd ?? null;
        if (
          limit !== null &&
          !(
            typeof limit === 'number' &&
            Number.isFinite(limit) &&
            limit >= 0 &&
            limit <= MAX_DAILY_LIMIT_USD
          )
        ) {
          return invalid('dailyLimitUsd must be a number from 0, or null for no limit');
        }
        const key = await connect(
          ctx.db,
          { connectionIds: connectionIds as string[], noLog, dailyLimitUsd: limit },
          actor,
        );
        return apiSuccess({ key });
      } catch (error) {
        const answer = failureResponse(error);
        if (answer) return answer;
        throw error;
      }
    },
    { mutating: true },
  );
}

/** Forgets OmniRoute: removes the key there and here, and clears the routes that pointed at it. */
export async function DELETE(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      try {
        const clearedStages = await disconnect(ctx.db, {
          actorId: ctx.viewer.accountId!,
          now: ctx.now,
        });
        return apiSuccess({ clearedStages });
      } catch (error) {
        const answer = failureResponse(error);
        if (answer) return answer;
        throw error;
      }
    },
    { mutating: true },
  );
}
