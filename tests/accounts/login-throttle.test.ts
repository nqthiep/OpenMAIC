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

  it('bounds tracked keys: a flood of new names never grows the table past maxKeys', () => {
    const { throttle } = createThrottle({ maxFailures: 1, maxKeys: 3 });
    for (const name of ['k0', 'k1', 'k2', 'k3']) throttle.recordFailure(name);
    expect(throttle.retryAfterSeconds('k0')).toBe(60);
    expect(throttle.retryAfterSeconds('k1')).toBe(60);
    expect(throttle.retryAfterSeconds('k2')).toBe(60);
  });

  it('keeps a locked key through a flood of unlocked keys', () => {
    const { throttle } = createThrottle({ maxFailures: 2, maxKeys: 3 });
    throttle.recordFailure('victim');
    throttle.recordFailure('victim');
    for (let index = 0; index < 50; index += 1) throttle.recordFailure(`flood${index}`);
    expect(throttle.retryAfterSeconds('victim')).toBe(60);
  });

  it('refuses a new name, and keeps every live lock, when every tracked key is locked', () => {
    const { throttle } = createThrottle({ maxFailures: 2, maxKeys: 2 });
    for (const name of ['a', 'a', 'b', 'b']) throttle.recordFailure(name);

    expect(throttle.recordFailure('c')).toBeUndefined();
    expect(throttle.retryAfterSeconds('a')).toBe(60);
    expect(throttle.retryAfterSeconds('b')).toBe(60);
    // A refused name is refused before the password check, not only after its failure.
    expect(throttle.retryAfterSeconds('c')).toBe(60);
  });

  it('admits refused names again once a lock expires, and keeps the table bounded', () => {
    const { throttle, advance } = createThrottle({ maxFailures: 2, maxKeys: 2 });
    for (const name of ['a', 'a', 'b', 'b']) throttle.recordFailure(name);
    expect(throttle.recordFailure('c')).toBeUndefined();

    advance(60_001);
    expect(throttle.retryAfterSeconds('c')).toBeUndefined();
    expect(throttle.recordFailure('c')).toBeDefined();
    expect(throttle.retryAfterSeconds('a')).toBeUndefined();
  });

  it('refund takes back exactly the failure it names, and only once', () => {
    const { throttle, advance } = createThrottle({ maxFailures: 2 });
    throttle.recordFailure('alice');
    advance(1_000);
    const second = throttle.recordFailure('alice')!;
    expect(throttle.retryAfterSeconds('alice')).toBe(59);

    throttle.refund('alice', second);
    expect(throttle.retryAfterSeconds('alice')).toBeUndefined();
    throttle.refund('alice', second);
    expect(throttle.retryAfterSeconds('alice')).toBeUndefined();

    throttle.recordFailure('alice');
    expect(throttle.retryAfterSeconds('alice')).toBe(59);
  });

  it('refund on an unknown key or a key with no failures does nothing', () => {
    const { throttle } = createThrottle({ maxFailures: 1 });
    expect(() => throttle.refund('nobody', 0)).not.toThrow();
    const token = throttle.recordFailure('bob')!;
    throttle.refund('bob', token);
    expect(throttle.retryAfterSeconds('bob')).toBeUndefined();
  });
  it('reset clears one key and leaves other keys throttled', () => {
    const { throttle } = createThrottle({ maxFailures: 2 });
    for (const name of ['alice', 'alice', 'bob', 'bob']) throttle.recordFailure(name);
    throttle.reset('alice');
    expect(throttle.retryAfterSeconds('alice')).toBeUndefined();
    expect(throttle.retryAfterSeconds('bob')).toBe(60);
  });

  it('drops expired keys before it evicts a key that is still throttled', () => {
    const { throttle, advance } = createThrottle({ maxFailures: 2, maxKeys: 2 });
    throttle.recordFailure('stale');
    advance(30_000);
    throttle.recordFailure('victim');
    throttle.recordFailure('victim');
    advance(40_000);
    throttle.recordFailure('newcomer');
    expect(throttle.retryAfterSeconds('victim')).toBe(20);
  });

  it('admits a new name when an unlocked key sits behind 64 locked keys', () => {
    const { throttle } = createThrottle({ maxFailures: 2, maxKeys: 70 });
    for (let index = 0; index < 64; index += 1) {
      throttle.recordFailure(`locked${index}`);
      throttle.recordFailure(`locked${index}`);
    }
    throttle.recordFailure('unlocked');
    for (let index = 0; index < 5; index += 1) {
      throttle.recordFailure(`more${index}`);
      throttle.recordFailure(`more${index}`);
    }
    expect(throttle.recordFailure('newcomer')).toBeDefined();
    expect(throttle.retryAfterSeconds('locked0')).toBe(60);
  });

  it('gives Retry-After as the time until the earliest live lock lapses', () => {
    const { throttle, advance } = createThrottle({ maxFailures: 2, maxKeys: 2 });
    throttle.recordFailure('a');
    throttle.recordFailure('a');
    advance(10_000);
    throttle.recordFailure('b');
    throttle.recordFailure('b');
    expect(throttle.recordFailure('c')).toBeUndefined();
    // 'a' locked first and lapses first: 60 s from its first failure, 50 s from now.
    expect(throttle.retryAfterSeconds('c')).toBe(50);
  });
});
