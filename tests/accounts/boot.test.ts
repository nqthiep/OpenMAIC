import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import {
  ownerAuthConfigurationForResolution,
  resetOwnerAuthenticationForTests,
} from '@/lib/server/identity/registry';

afterEach(() => {
  vi.unstubAllEnvs();
  resetOwnerAuthenticationForTests();
});

describe('accounts boot registration', () => {
  it('registers nothing while OPENMAIC_ACCOUNTS is off', () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
    configureAccountsAuthentication();
    expect(ownerAuthConfigurationForResolution().methods).toEqual([]);
  });

  it('registers the accounts method with the anonymous fallback off', () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    configureAccountsAuthentication();
    const config = ownerAuthConfigurationForResolution();
    expect(config.methods.map((method) => method.name)).toEqual(['accounts']);
    expect(config.anonymousFallback).toBe(false);
  });

  it('refuses OWNER_SINGLE_USER=true beside accounts', () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', 'true');
    expect(() => configureAccountsAuthentication()).toThrow(/OWNER_SINGLE_USER=true/);
  });

  it('refuses PERSISTENCE_SHARED_OWNER_ID beside accounts', () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', 'team');
    expect(() => configureAccountsAuthentication()).toThrow(/PERSISTENCE_SHARED_OWNER_ID/);
  });

  it('refuses a malformed OPENMAIC_ACCOUNTS value', () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'yes');
    expect(() => configureAccountsAuthentication()).toThrow(/OPENMAIC_ACCOUNTS must be/);
  });
});
