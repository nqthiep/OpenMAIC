import { apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { OmniRouteError } from '@/lib/server/omniroute/client';
import { ROLE_IDS, type RoleChoice, type RoleId } from '@/lib/server/omniroute/contract';
import { omnirouteCredential } from '@/lib/server/omniroute/overview';
import { failureResponse } from '@/lib/server/omniroute/responses';
import { readRoles, writeRoles } from '@/lib/server/omniroute/roles';
import { applyChange } from '@/lib/server/provider-store/admin';
import { listRouting } from '@/lib/server/provider-store/store';

export const runtime = 'nodejs';

const BODY_MAX_BYTES = 8 * 1024;
const MAX_MODEL_LENGTH = 200;
const MAX_CONTEXT_WINDOW = 10_000_000;

/** One role from the body, or the reason it cannot be used. */
function parseChoice(value: unknown): RoleChoice | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'must be an object';
  const { model, vision, tools, contextWindow } = value as Record<string, unknown>;
  if (typeof model !== 'string' || !model.trim() || model.length > MAX_MODEL_LENGTH) {
    return 'needs a model of up to 200 characters';
  }
  if (/[\u0000-\u001f\u007f]/.test(model)) return 'has a model with control characters';
  if (typeof vision !== 'boolean' || typeof tools !== 'boolean')
    return 'needs vision and tools as true or false';
  if (
    contextWindow !== undefined &&
    !(
      Number.isInteger(contextWindow) &&
      (contextWindow as number) >= 1 &&
      (contextWindow as number) <= MAX_CONTEXT_WINDOW
    )
  ) {
    return 'has an invalid contextWindow';
  }
  return {
    model: model.trim(),
    vision,
    tools,
    ...(contextWindow === undefined ? {} : { contextWindow: contextWindow as number }),
  };
}

/**
 * Sets the model of each of the four roles, and the default model (the chat role's). Body
 * `{ roles: { generate, chat, grade, utility } }`, each `{ model, vision, tools, contextWindow? }`.
 * Needs OmniRoute connected. Administrators only.
 */
export async function PUT(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request, BODY_MAX_BYTES);
      if (!body.ok) return body.response;
      const given = body.body.roles;
      if (!given || typeof given !== 'object' || Array.isArray(given)) {
        return invalid('roles must be an object with all four roles');
      }
      const roles = {} as Record<RoleId, RoleChoice>;
      for (const role of ROLE_IDS) {
        const parsed = parseChoice((given as Record<string, unknown>)[role]);
        if (typeof parsed === 'string') return invalid(`The ${role} role ${parsed}`);
        roles[role] = parsed;
      }
      try {
        const credential = await omnirouteCredential(ctx.db);
        if (!credential?.complete) {
          throw new OmniRouteError('not-ready', 'Connect OmniRoute before choosing models');
        }
        const actor = { actorId: ctx.viewer.accountId!, now: ctx.now };
        await writeRoles(ctx.db, roles, actor);
        await ctx.db.query(
          `INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
           VALUES ($1::text, 'omniroute', 'omniroute:roles', NULL, $2::timestamptz)`,
          [actor.actorId, actor.now.toISOString()],
        );
        await applyChange(ctx.db);
        return apiSuccess({ roles: readRoles(await listRouting(ctx.db)) });
      } catch (error) {
        const answer = failureResponse(error);
        if (answer) return answer;
        throw error;
      }
    },
    { mutating: true },
  );
}
