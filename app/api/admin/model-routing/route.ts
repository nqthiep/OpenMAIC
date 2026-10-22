import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getProvider } from '@/lib/ai/providers';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { LLM_STAGES, parseRouteValue, type StageRoute } from '@/lib/server/model-routes';
import { applyChange } from '@/lib/server/provider-store/admin';
import { DEFAULT_MODEL_STAGE } from '@/lib/server/provider-store/build-config';
import { isVersion } from '@/lib/server/provider-store/validate';
import {
  deleteRouting,
  listRouting,
  saveRouting,
  VersionConflictError,
} from '@/lib/server/provider-store/store';
import type { ProviderId } from '@/lib/types/provider';

export const runtime = 'nodejs';

const BODY_MAX_BYTES = 16 * 1024;

/** A route as it is stored: the model string alone, or the object when it carries more. */
function toStored(route: StageRoute): unknown {
  const { model, ...rest } = route;
  return Object.keys(rest).length === 0 ? model : route;
}

/** The reason a model string cannot be used, or undefined. It must be `provider:model` for a known provider. */
function modelProblem(model: string): string | undefined {
  if (model.length > 200) return 'The model is too long';
  const colon = model.indexOf(':');
  if (colon <= 0 || colon === model.length - 1) return 'The model must look like provider:model';
  if (!getProvider(model.slice(0, colon) as ProviderId)) return 'Unknown provider in the model';
  return undefined;
}

/**
 * Sets the model for one stage, or the default model (stage "default"). Body:
 * { stage, value, expectedVersion } where value is a `provider:model` string, or for a stage an
 * object { model, api?, contextWindow?, thinking? }. Administrators only.
 */
export async function PUT(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request, BODY_MAX_BYTES);
      if (!body.ok) return body.response;
      const { stage, value, expectedVersion } = body.body;
      if (typeof stage !== 'string') return invalid('stage must be text');
      if (!isVersion(expectedVersion)) {
        return invalid('expectedVersion must be a whole number, 0 for a new route');
      }
      let stored: unknown;
      if (stage === DEFAULT_MODEL_STAGE) {
        if (typeof value !== 'string')
          return invalid('The default model must be a provider:model string');
        const problem = modelProblem(value.trim());
        if (problem) return invalid(problem);
        stored = { model: value.trim() };
      } else {
        if (!(LLM_STAGES as readonly string[]).includes(stage)) return invalid('Unknown stage');
        const route = parseRouteValue(stage, value);
        if (!route) return invalid('The route has no usable model');
        const problem = modelProblem(route.model);
        if (problem) return invalid(problem);
        stored = toStored(route);
      }
      try {
        await saveRouting(ctx.db, {
          stage,
          value: stored,
          expectedVersion: expectedVersion as number,
          actorId: ctx.viewer.accountId!,
          now: ctx.now,
        });
      } catch (error) {
        if (error instanceof VersionConflictError) {
          return apiError('VERSION_CONFLICT', 409, error.message);
        }
        throw error;
      }
      await applyChange(ctx.db);
      return apiSuccess({ routing: await listRouting(ctx.db) });
    },
    { mutating: true },
  );
}

/** Removes the route of one stage (it then falls back to the default model). Body: { stage }. Administrators only. */
export async function DELETE(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request, BODY_MAX_BYTES);
      if (!body.ok) return body.response;
      const { stage, expectedVersion } = body.body;
      if (typeof stage !== 'string') return invalid('stage must be text');
      if (expectedVersion !== undefined && !isVersion(expectedVersion)) {
        return invalid('expectedVersion must be a whole number');
      }
      const removed = await deleteRouting(ctx.db, {
        stage,
        expectedVersion,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!removed) return apiError('NOT_FOUND', 404, 'No such route, or it was changed.');
      await applyChange(ctx.db);
      return apiSuccess({ routing: await listRouting(ctx.db) });
    },
    { mutating: true },
  );
}
