import { describe, expect, it } from 'vitest';

import {
  ADDRESS_FAILURE_LIMIT,
  PAIR_FAILURE_LIMIT,
  THROTTLE_WINDOW_MS,
  throttleVerdict,
  USERNAME_FAILURE_LIMIT,
} from '@/lib/accounts/throttle';

const NOW = 1_800_000_000_000;

describe('throttle verdict', () => {
  it('uses 20 failures for a name, 5 for a name from one address, and 30 for an address', () => {
    expect(USERNAME_FAILURE_LIMIT).toBe(20);
    expect(PAIR_FAILURE_LIMIT).toBe(5);
    expect(ADDRESS_FAILURE_LIMIT).toBe(30);
    expect(THROTTLE_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('allows fewer failures than the limit', () => {
    expect(throttleVerdict([NOW - 1, NOW - 2, NOW - 3, NOW - 4], 5, NOW)).toEqual({
      locked: false,
    });
  });

  it('locks at the limit until the limit-th newest failure leaves the window', () => {
    const failures = [NOW - 60_000, NOW - 120_000, NOW - 180_000, NOW - 240_000, NOW - 300_000];
    expect(throttleVerdict(failures, 5, NOW)).toEqual({ locked: true, retryAfterMs: 600_000 });
  });

  it('unlocks once the limit-th newest failure is out of the window', () => {
    const failures = [NOW - 1, NOW - 2, NOW - 3, NOW - 4, NOW - THROTTLE_WINDOW_MS - 5];
    expect(throttleVerdict(failures, 5, NOW)).toEqual({ locked: false });
  });

  it('ignores failures in the future and older than the window', () => {
    const failures = [NOW + 1000, NOW - THROTTLE_WINDOW_MS - 1, NOW - 1, NOW - 2, NOW - 3, NOW - 4];
    expect(throttleVerdict(failures, 5, NOW)).toEqual({ locked: false });
  });

  it('never refuses for longer than the window', () => {
    const failures = Array.from({ length: 30 }, (_, index) => NOW - index * 1000);
    const verdict = throttleVerdict(failures, 30, NOW);
    expect(verdict.locked).toBe(true);
    if (verdict.locked) expect(verdict.retryAfterMs).toBeLessThanOrEqual(THROTTLE_WINDOW_MS);
  });
});
