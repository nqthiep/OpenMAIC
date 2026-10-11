/**
 * Freshness rule for ACCESS_CODE tokens. Pure TypeScript with no Node or Web
 * Crypto imports, so both the Node verifier (lib/server/access-token.ts) and the
 * Edge middleware (middleware.ts) apply the same rule.
 *
 * A token's signature proves it was minted from the access code; it does not
 * prove the token is recent. Without this check a captured cookie stayed valid
 * for as long as the access code itself did.
 */

/** Matches the browser cookie lifetime set by /api/access-code/verify. */
export const ACCESS_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Tolerates a client or server clock running slightly ahead of the other. */
export const ACCESS_TOKEN_CLOCK_SKEW_MS = 60 * 1000;

const TIMESTAMP_PATTERN = /^\d{1,15}$/;

/** True when `timestamp` (ms since epoch, as minted) is within the accepted window at `now`. */
export function isAccessTokenTimestampFresh(timestamp: string, now: number): boolean {
  if (!TIMESTAMP_PATTERN.test(timestamp)) return false;
  const issuedAt = Number(timestamp);
  const age = now - issuedAt;
  return age <= ACCESS_TOKEN_MAX_AGE_MS && age >= -ACCESS_TOKEN_CLOCK_SKEW_MS;
}
