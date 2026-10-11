/**
 * Failed-sign-in throttling as a pure rule over failure times. A scope (one
 * username, one username from one client address, or one client address) is
 * refused while `limit` failures fall in the last 15 minutes. The refusal ends
 * when the `limit`-th newest of them leaves the window, so it never lasts longer
 * than the window. Only verified attempts are recorded, so a refused attempt
 * cannot extend a refusal.
 *
 * The username limit is higher than the pair limit on purpose: a classmate who
 * guesses one name from one address is stopped at the pair limit, and the name
 * itself is locked only after many failures from many sources.
 */
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const USERNAME_FAILURE_LIMIT = 20;
export const PAIR_FAILURE_LIMIT = 5;
export const ADDRESS_FAILURE_LIMIT = 30;

export type ThrottleVerdict = { locked: false } | { locked: true; retryAfterMs: number };

/** `failures` are failure times in epoch milliseconds, in any order. */
export function throttleVerdict(
  failures: readonly number[],
  limit: number,
  now: number,
): ThrottleVerdict {
  const recent = failures
    .filter((at) => at > now - THROTTLE_WINDOW_MS && at <= now)
    .sort((a, b) => b - a);
  if (recent.length < limit) return { locked: false };
  const leavesWindowAt = (recent[limit - 1] ?? now) + THROTTLE_WINDOW_MS;
  return { locked: true, retryAfterMs: Math.max(1, leavesWindowAt - now) };
}
