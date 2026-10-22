/**
 * The 503 a route answers while the provider settings are not loaded. Kept apart from
 * `snapshot.ts` so that module stays free of Next imports.
 */
import { apiError } from '@/lib/server/api-response';

import { currentSnapshot, ProviderConfigNotReady } from './snapshot';

/** A 503 with `Retry-After` when the settings are not loaded yet, otherwise undefined. */
export function providerConfigNotReadyResponse(): Response | undefined {
  try {
    currentSnapshot();
    return undefined;
  } catch (error) {
    if (!(error instanceof ProviderConfigNotReady)) throw error;
    const response = apiError('PROVIDER_CONFIG_NOT_READY', 503, error.message);
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
    return response;
  }
}
