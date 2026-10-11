import { afterEach, describe, expect, it, vi } from 'vitest';

import { registrationOpen } from '@/lib/server/accounts/runtime';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('registrationOpen', () => {
  it('is closed when ACCOUNT_REGISTRATION is unset', () => {
    const saved = process.env.ACCOUNT_REGISTRATION;
    delete process.env.ACCOUNT_REGISTRATION;
    try {
      expect(registrationOpen()).toBe(false);
    } finally {
      if (saved !== undefined) process.env.ACCOUNT_REGISTRATION = saved;
    }
  });

  it.each(['', 'closed', 'yes', 'true', 'opened'])('is closed for %j', (value) => {
    vi.stubEnv('ACCOUNT_REGISTRATION', value);
    expect(registrationOpen()).toBe(false);
  });

  it.each(['open', 'OPEN', '  Open  '])('is open only for %j', (value) => {
    vi.stubEnv('ACCOUNT_REGISTRATION', value);
    expect(registrationOpen()).toBe(true);
  });
});
