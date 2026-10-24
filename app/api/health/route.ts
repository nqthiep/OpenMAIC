import { apiSuccess } from '@/lib/server/api-response';
import { providerConfigNotReadyResponse } from '@/lib/server/provider-store/not-ready';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
  getParallelSceneConcurrency,
} from '@/lib/server/provider-config';
import { resolveServerGenerationCapabilities } from '@/lib/server/generation-capabilities';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  // Still answers 200 (the process is up) but says the provider settings are not loaded yet.
  if (providerConfigNotReadyResponse()) {
    return apiSuccess({ status: 'ok', version, providerConfig: 'loading', capabilities: {} });
  }
  return apiSuccess({
    status: 'ok',
    version,
    accessCodeConfigured: Boolean(process.env.ACCESS_CODE),
    capabilities: await resolveServerGenerationCapabilities(),
    // How many scenes the browser may generate at once (PARALLEL_SCENE_CONCURRENCY).
    generation: { parallelSceneConcurrency: getParallelSceneConcurrency() },
  });
}
