import { apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { LLM_STAGES } from '@/lib/server/model-routes';
import { masterKeyStatus } from '@/lib/server/provider-store/admin';
import { catalogFor } from '@/lib/server/provider-store/catalog';
import { listCredentialViews, listRouting } from '@/lib/server/provider-store/store';
import { PROVIDER_SECTIONS } from '@/lib/server/provider-store/types';

export const runtime = 'nodejs';

/**
 * The AI provider settings as an administrator sees them: one row per stored provider (never its
 * secret), the model routing, whether the master key works, and what each section can offer
 * (`catalog`, `stages`). Staff read; only an administrator changes them (`canManage`).
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'provider.view');
    if (refusal) return refusal;
    const [rows, routing] = await Promise.all([listCredentialViews(ctx.db), listRouting(ctx.db)]);
    return apiSuccess({
      canManage: can(ctx.viewer, 'provider.manage'),
      masterKey: masterKeyStatus(),
      // A base URL can reveal internal gateways, so only an administrator sees it.
      rows: can(ctx.viewer, 'provider.manage')
        ? rows
        : rows.map((row) => ({ ...row, baseUrl: undefined })),
      routing,
      stages: LLM_STAGES,
      catalog: Object.fromEntries(
        PROVIDER_SECTIONS.map((section) => [section, catalogFor(section)]),
      ),
    });
  });
}
