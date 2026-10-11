import { describe, expect, it } from 'vitest';

import { AccessCodeAttemptLimiter } from '@/lib/server/attempt-limiter';

const WINDOW_MS = 15 * 60_000;

function limiterAt(clock: { now: number }, maxFailures = 10) {
  return new AccessCodeAttemptLimiter({
    untrustedBudget: { maxFailures, windowMs: WINDOW_MS },
    now: () => clock.now,
  });
}

describe('shared budget for untrusted callers', () => {
  it('allows the budgeted attempts from any mix of callers, then limits with Retry-After', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);

    for (let i = 0; i < 10; i += 1) {
      expect(limiter.consume(`caller-${i}`, false).limited).toBe(false);
    }
    expect(limiter.consume('a-fresh-caller', false)).toEqual({
      limited: true,
      retryAfterSeconds: WINDOW_MS / 1000,
    });
  });

  it('refills as the oldest attempt leaves the window', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    for (let i = 0; i < 10; i += 1) limiter.consume('x', false);

    clock.now = 60_000;
    expect(limiter.consume('x', false)).toEqual({
      limited: true,
      retryAfterSeconds: (WINDOW_MS - 60_000) / 1000,
    });

    clock.now = WINDOW_MS + 1;
    expect(limiter.consume('x', false).limited).toBe(false);
  });

  it('a correct code does not clear the shared bucket', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    for (let i = 0; i < 10; i += 1) limiter.consume('x', false);

    limiter.recordSuccess('x', false);
    expect(limiter.consume('y', false).limited).toBe(true);
  });

  it('leaves trusted identities on their own windows', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    for (let i = 0; i < 10; i += 1) limiter.consume(`caller-${i}`, false);

    expect(limiter.consume('proxy-client', true).limited).toBe(false);
    expect(limiter.getTrackedKeys()).toEqual(['proxy-client']);
  });

  it('reset clears the shared bucket too', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    for (let i = 0; i < 10; i += 1) limiter.consume('x', false);

    limiter.reset();
    expect(limiter.consume('x', false).limited).toBe(false);
  });
});

describe('without a budget (the access-code route)', () => {
  it('untrusted callers are never throttled and store nothing', () => {
    const clock = { now: 0 };
    const limiter = new AccessCodeAttemptLimiter({
      maxFailures: 1,
      windowMs: WINDOW_MS,
      now: () => clock.now,
    });
    for (let i = 0; i < 50; i += 1) {
      expect(limiter.consume(`shared-${i}`, false).limited).toBe(false);
    }
    expect(limiter.getTrackedKeys()).toEqual([]);
  });
});
