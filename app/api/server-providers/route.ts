import {
  getServerProviders,
  getServerTTSProviders,
  getServerASRProviders,
  getServerPDFProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerWebSearchProviders,
  getParallelSceneConcurrency,
} from '@/lib/server/provider-config';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { providerConfigNotReadyResponse } from '@/lib/server/provider-store/not-ready';

const log = createLogger('ServerProviders');

export async function GET() {
  // While the provider settings load, say so (503) instead of an empty list the client would cache.
  const notReady = providerConfigNotReadyResponse();
  if (notReady) return notReady;
  try {
    return apiSuccess({
      providers: getServerProviders(),
      tts: getServerTTSProviders(),
      asr: getServerASRProviders(),
      pdf: getServerPDFProviders(),
      image: getServerImageProviders(),
      video: getServerVideoProviders(),
      webSearch: getServerWebSearchProviders(),
      generation: {
        parallelSceneConcurrency: getParallelSceneConcurrency(),
      },
    });
  } catch (error) {
    log.error('Error fetching server providers:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
