import { describe, expect, it } from 'vitest';

import { DEFAULT_LOGIN_THROTTLE, LoginThrottle } from '@/lib/server/accounts/login-throttle';

const WINDOW_MS = 60_000;
const START = 1_700_000_000_000;

/** A throttle whose clock only moves when the test advances it. */
function createThrottle(options: { maxFailures: number; maxKeys?: number }) {
  let nowMs = START;
  const throttle = new LoginThrottle({
    maxFailures: options.maxFailures,
    windowMs: WINDOW_MS,
    maxKeys: options.maxKeys ?? 100,
    now: () => nowMs,
  });
  return {
    throttle,
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

describe('LoginThrottle', () => {
  it('defaults to 8 failures per 15 minutes across 10,000 keys', () => {
    expect(DEFAULT_LOGIN_THROTTLE).toEqual({
      maxFailures: 8,
      windowMs: 15 * 60 * 1000,
      maxKeys: 10_000,
    });
  });

  it('allows attempts below the budget and refuses from the budget onward', () => {
    const { throttle } = createThrottle({ maxFailures: 3 });
    throttle.recordFailure('alice');
    throttle.recordFailure('alice');
    expect(throttle.retryAfterSeconds('alice')).toBeUndefined();
    throttle.recordFailure('alice');
    expect(throttle.retryAfterSeconds('alice')).toBe(60);
  });

  it('returns a whole number of seconds that shrinks as the window runs down', () => {
    const { throttle, advance } = createThrottle({ maxFailures: 2 });
    throttle.recordFailure('alice');
    advance(5_000);
    throttle.recordFailure('alice');
    expect(throttle.retryAfterSeconds('alice')).toBe(55);
    advance(20_000);
    expect(throttle.retryAfterSeconds('alice')).toBe(35);
  });

  it('admits attempts again exactly when the oldest failure leaves the window', () => {
    const { throttle, advance } = createThrottle({ maxFailures: 2 });
    throttle.recordFailure('alice');
    advance(5_000);
    throttle.recordFailure('alice');
    advance(WINDOW_MS - 5_000 - 1);
    expect(throttle.retryAfterSeconds('alice')).toBe(1);
    advance(1);
    expect(throttle.retryAfterSeconds('alice')).toBeUndefined();
  });

  it('reset clears one key and leaves other keys throttled', () => {
    const { throttle } = createThrottle({ maxFailures: 2 });
    for (const name of ['alice', 'alice', 'bob', 'bob']) throttle.recordFailure(name);
    throttle.reset('alice');
    expect(throttle.retryAfterSeconds('alice')).toBeUndefined();
    expect(throttle.retryAfterSeconds('bob')).toBe(60);
  });

  it('bounds tracked keys: inserting maxKeys + 1 keys evicts the oldest and keeps the newest', () => {
    const { throttle } = createThrottle({ maxFailures: 1, maxKeys: 3 });
    for (const name of ['k0', 'k1', 'k2', 'k3']) throttle.recordFailure(name);
    expect(throttle.retryAfterSeconds('k0')).toBeUndefined();
    expect(throttle.retryAfterSeconds('k1')).toBe(60);
    expect(throttle.retryAfterSeconds('k3')).toBe(60);
  });
});
