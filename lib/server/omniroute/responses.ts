import { apiError } from '@/lib/server/api-response';
import {
  MasterKeyMissingError,
  SecretUnreadableError,
  VersionConflictError,
} from '@/lib/server/provider-store/store';

import { ProviderConfigNotReady } from '@/lib/server/provider-store/snapshot';

import { OmniRouteError } from './client';

/** The answer for a failure of an OmniRoute route, or undefined when it is not one we know. */
export function failureResponse(error: unknown): Response | undefined {
  if (error instanceof OmniRouteError) {
    switch (error.failure) {
      case 'unconfigured':
        return apiError('NOT_FOUND', 404, error.message, error.failure);
      case 'no-connections':
        return apiError('INVALID_REQUEST', 400, error.message, error.failure);
      case 'not-ready':
        return apiError('INVALID_REQUEST', 409, error.message, error.failure);
      default:
        return apiError('UPSTREAM_ERROR', 502, error.message, error.failure);
    }
  }
  if (error instanceof ProviderConfigNotReady) {
    const response = apiError('PROVIDER_CONFIG_NOT_READY', 503, error.message);
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
    return response;
  }
  if (error instanceof VersionConflictError) {
    return apiError('VERSION_CONFLICT', 409, error.message);
  }
  if (error instanceof MasterKeyMissingError) {
    return apiError('MASTER_KEY_MISSING', 409, error.message);
  }
  if (error instanceof SecretUnreadableError) {
    return apiError('SECRET_UNREADABLE', 409, error.message);
  }
  return undefined;
}
