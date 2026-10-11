import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import {
  InvalidBootConfigurationError,
  runConfigurationCheck,
} from '@/lib/server/boot-configuration-error';
import {
  ownerAuthConfigurationForResolution,
  resetOwnerAuthenticationForTests,
} from '@/lib/server/identity/registry';

afterEach(() => {
  vi.unstubAllEnvs();
  resetOwnerAuthenticationForTests();
});

/** Accounts on, with the single-owner settings cleared, so only the claim trigger varies. */
function stubAccounts(trigger: string): void {
  vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
  vi.stubEnv('OWNER_SINGLE_USER', '');
  vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
  vi.stubEnv('OWNER_CLAIM_TRIGGER', trigger);
}

describe('OWNER_CLAIM_TRIGGER beside accounts', () => {
  it('refuses the automatic claim trigger at boot', () => {
    stubAccounts('auto');
    expect(() => configureAccountsAuthentication()).toThrow(/OWNER_CLAIM_TRIGGER=auto/);
  });

  it('reports that refusal as an invalid configuration and registers nothing', () => {
    stubAccounts('auto');
    expect(() => runConfigurationCheck(configureAccountsAuthentication)).toThrow(
      InvalidBootConfigurationError,
    );
    expect(ownerAuthConfigurationForResolution().methods).toEqual([]);
  });

  it('accepts explicit, the default trigger', () => {
    stubAccounts('explicit');
    expect(() => configureAccountsAuthentication()).not.toThrow();
    expect(ownerAuthConfigurationForResolution().methods.map((m) => m.name)).toEqual(['accounts']);
  });

  it('accepts an unset OWNER_CLAIM_TRIGGER', () => {
    stubAccounts('');
    expect(() => configureAccountsAuthentication()).not.toThrow();
  });

  it('keeps accepting auto while accounts are off', () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
    vi.stubEnv('OWNER_CLAIM_TRIGGER', 'auto');
    expect(() => configureAccountsAuthentication()).not.toThrow();
    expect(ownerAuthConfigurationForResolution().methods).toEqual([]);
  });
});
