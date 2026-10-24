import { apiSuccess } from '@/lib/server/api-response';
import { providerConfigNotReadyResponse } from '@/lib/server/provider-store/not-ready';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

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
    capabilities: {
      // A capability is available only when at least one provider is enabled —
      // force-disabled providers (disabled: true) do not count (#665).
      webSearch: Object.values(getServerWebSearchProviders()).some((info) => !info.disabled),
      imageGeneration: Object.values(getServerImageProviders()).some((info) => !info.disabled),
      videoGeneration: Object.values(getServerVideoProviders()).some((info) => !info.disabled),
      tts: Object.values(getServerTTSProviders()).some((info) => !info.disabled),
    },
  });
}
