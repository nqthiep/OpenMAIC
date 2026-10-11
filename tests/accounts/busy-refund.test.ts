import { describe, expect, it, vi } from 'vitest';

// The scrypt stub can be switched off per test. While it is on, every derivation fails
// the way a full work queue does, so the attempt is refused before any password is checked.
const scrypt = vi.hoisted(() => ({ failing: true }));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    scrypt: (...args: unknown[]) => {
      if (!scrypt.failing) return (actual.scrypt as (...rest: unknown[]) => void)(...args);
      const callback = args[args.length - 1] as (error: Error | null) => void;
      callback(new Error('derivation queue busy'));
    },
  };
});

import { LoginThrottle } from '@/lib/server/accounts/login-throttle';
import { PasswordWorkBusyError } from '@/lib/server/accounts/password';
import { loginAccount, type AccountServiceDeps } from '@/lib/server/accounts/service';

const PASSWORD = 'correct horse battery staple';

function createDeps(): { deps: AccountServiceDeps; throttle: LoginThrottle } {
  const throttle = new LoginThrottle({ maxFailures: 2, windowMs: 60_000, maxKeys: 100 });
  const deps: AccountServiceDeps = {
    // No account row, so the attempt goes to the placeholder hash, as an unknown name would.
    db: { query: async () => ({ rows: [] }) },
    throttle,
    registrationOpen: false,
  };
  return { deps, throttle };
}

describe('a sign-in refused by the busy password queue', () => {
  it('is not counted toward the lockout, however many times it happens', async () => {
    scrypt.failing = true;
    const { deps, throttle } = createDeps();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        loginAccount(deps, { username: 'alice', password: PASSWORD }),
      ).rejects.toBeInstanceOf(PasswordWorkBusyError);
    }

    expect(throttle.retryAfterSeconds('alice')).toBeUndefined();
  });

  it('still counts attempts whose password was checked, so the lockout holds', async () => {
    scrypt.failing = false;
    const { deps, throttle } = createDeps();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        loginAccount(deps, { username: 'alice', password: PASSWORD }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    expect(throttle.retryAfterSeconds('alice')).toBeGreaterThan(0);
    scrypt.failing = true;
  });
});

describe('a sign-in refused by a saturated throttle', () => {
  it('is refused before any password derivation runs', async () => {
    scrypt.failing = true;
    const throttle = new LoginThrottle({ maxFailures: 1, windowMs: 60_000, maxKeys: 1 });
    // One live lock fills the table, so a new name cannot be tracked.
    throttle.recordFailure('someone-else');
    const { deps } = createDeps();

    const error = await loginAccount(
      { ...deps, throttle },
      { username: 'alice', password: PASSWORD },
    ).catch((caught: unknown) => caught);

    // A derivation would have failed as busy. The refusal comes first, so no derivation ran.
    expect(error).toMatchObject({ code: 'RATE_LIMITED' });
    expect(error).not.toBeInstanceOf(PasswordWorkBusyError);
  });
});
