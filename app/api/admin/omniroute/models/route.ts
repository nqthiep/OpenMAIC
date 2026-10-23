import { apiSuccess } from '@/lib/server/api-response';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import {
  findKey,
  listConnections,
  listModels,
  listNodePrefixes,
  openSession,
  OmniRouteError,
} from '@/lib/server/omniroute/client';
import { requireConfig } from '@/lib/server/omniroute/connect';
import { buildItems, buildPresets } from '@/lib/server/omniroute/models';
import { failureResponse } from '@/lib/server/omniroute/responses';
import { PROVIDER_ID } from '@/lib/server/omniroute/roles';
import { resolveApiKey } from '@/lib/server/provider-config';

export const runtime = 'nodejs';

/**
 * The models, combos and `auto/*` ids OpenMAIC's key can use, with what OmniRoute says each can do,
 * and suggested sets for the four roles. Single models are only those of the connections the key
 * is limited to. Administrators only.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'provider.manage');
    if (refusal) return refusal;
    try {
      const config = requireConfig();
      const apiKey = resolveApiKey(PROVIDER_ID, '');
      if (!apiKey) throw new OmniRouteError('not-ready', 'Connect OmniRoute first');
      const session = await openSession(config);
      const [connections, key, raw, nodes] = await Promise.all([
        listConnections(session),
        findKey(session),
        listModels(config, apiKey),
        listNodePrefixes(session),
      ]);
      const allowed = new Set(key?.connectionIds ?? []);
      // The owner a model is listed under: the provider id, or the prefix of a custom provider.
      const providers = new Set(
        connections
          .filter((c) => c.active && allowed.has(c.id))
          .flatMap((c) => [c.provider, nodes.get(c.provider) ?? c.provider]),
      );
      const items = buildItems(raw, providers);
      return apiSuccess({ items, presets: buildPresets(items) });
    } catch (error) {
      const answer = failureResponse(error);
      if (answer) return answer;
      throw error;
    }
  });
}
