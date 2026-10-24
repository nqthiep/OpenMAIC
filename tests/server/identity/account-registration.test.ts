import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetOwnerAuthenticationForTests } from '@/lib/server/identity/registry';

// register() runs only the owner-identity part of boot here.
vi.mock('@/lib/server/config-validation', () => ({ validateServerConfig: vi.fn() }));
vi.mock('@/lib/config/feature-flags', () => ({
  isAgentRuntimeConfigured: () => false,
  isServerPersistenceConfigured: () => false,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetOwnerAuthenticationForTests();
});

/**
 * Accounts reach the app only through the owner identity seam. If the boot hook did not register
 * the account method, every signed-in request would silently become an anonymous owner.
 */
describe('instrumentation register() and the account owner auth method', () => {
  it('registers the account session method ahead of the anonymous cookie', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('ACCESS_CODE', 'demo-code-that-is-long-enough');
    resetOwnerAuthenticationForTests();
    const { register } = await import('@/instrumentation');
    const { ownerAuthConfigurationForResolution } = await import('@/lib/server/identity/registry');

    await register();

    const { methods, anonymousFallback } = ownerAuthConfigurationForResolution();
    expect(methods.map((method) => method.name)).toEqual(['account-session']);
    expect(anonymousFallback).toBe(true);
  });

  it('keeps the shared-team method last when PERSISTENCE_SHARED_OWNER_ID is set', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('ACCESS_CODE', 'demo-code-that-is-long-enough');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', 'team-library');
    resetOwnerAuthenticationForTests();
    const { register } = await import('@/instrumentation');
    const { ownerAuthConfigurationForResolution } = await import('@/lib/server/identity/registry');

    await register();

    expect(ownerAuthConfigurationForResolution().methods.map((method) => method.name)).toEqual([
      'account-session',
      'sharedTeam',
    ]);
  });
});
