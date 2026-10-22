import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { providerConfigNotReadyResponse } from '@/lib/server/provider-store/not-ready';
import { resetProviderSnapshot, setProviderSnapshot } from '@/lib/server/provider-store/snapshot';
import { emptySnapshot } from '@/lib/server/provider-store/types';

beforeEach(() => {
  resetProviderSnapshot();
  vi.stubEnv('DATABASE_URL', 'postgres://not-ready-test');
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetProviderSnapshot();
});

describe('providerConfigNotReadyResponse', () => {
  it('answers 503 with a retry hint while a configured database is not loaded', async () => {
    const response = providerConfigNotReadyResponse();
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Retry-After')).toBe('5');
    expect(await response?.json()).toMatchObject({ errorCode: 'PROVIDER_CONFIG_NOT_READY' });
  });

  it('is silent once the settings are loaded', () => {
    setProviderSnapshot(emptySnapshot());
    expect(providerConfigNotReadyResponse()).toBeUndefined();
  });

  it('is silent when there is no database', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(providerConfigNotReadyResponse()).toBeUndefined();
  });

  it('makes /api/server-providers answer 503 and /api/health report loading', async () => {
    const providers = await import('@/app/api/server-providers/route');
    expect((await providers.GET()).status).toBe(503);
    const health = await import('@/app/api/health/route');
    const response = await health.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ providerConfig: 'loading', capabilities: {} });
    setProviderSnapshot(emptySnapshot());
    expect((await providers.GET()).status).toBe(200);
  });

  it('stops the AI routes at requireSpender before they reach a provider lookup', async () => {
    const { requireSpender } = await import('@/lib/server/authz/viewer');
    const response = await requireSpender(new Headers());
    expect(response?.status).toBe(503);
  });
});
