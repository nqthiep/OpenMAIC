import { apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { resolveApiKey } from '@/lib/server/provider-config';
import { pingModel, OmniRouteError } from '@/lib/server/omniroute/client';
import { requireConfig } from '@/lib/server/omniroute/connect';
import { ROLE_IDS, type RoleId } from '@/lib/server/omniroute/contract';
import { failureResponse } from '@/lib/server/omniroute/responses';
import { PROVIDER_ID, readRoles } from '@/lib/server/omniroute/roles';
import { listRouting } from '@/lib/server/provider-store/store';

export const runtime = 'nodejs';

/** One tiny request through the model chosen for a role, to show that the route works. */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request, 1024);
      if (!body.ok) return body.response;
      const role = body.body.role;
      if (typeof role !== 'string' || !(ROLE_IDS as readonly string[]).includes(role)) {
        return invalid('role must be generate, chat, grade or utility');
      }
      try {
        const config = requireConfig();
        const choice = readRoles(await listRouting(ctx.db))[role as RoleId];
        const key = resolveApiKey(PROVIDER_ID, '');
        if (!choice || !key) throw new OmniRouteError('not-ready', 'Choose and save a model first');
        const latencyMs = await pingModel(config, key, choice.model);
        return apiSuccess({ model: choice.model, latencyMs });
      } catch (error) {
        const answer = failureResponse(error);
        if (answer) return answer;
        throw error;
      }
    },
    { mutating: true },
  );
}
