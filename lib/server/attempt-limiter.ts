/**
 * Bounded in-process attempt limiter for the access-code verification route.
 *
 * One policy, applied only when the caller's identity is trusted:
 *
 * - **Trusted per-client identity** (`TRUST_PROXY_HEADERS=true`): a sliding
 *   window of {@link ATTEMPT_LIMIT_MAX_FAILURES} attempts per
 *   {@link ATTEMPT_LIMIT_WINDOW_MS} per identity. Behind a proxy that overwrites
 *   the forwarding headers the identity is per-client, so a success clears that
 *   client's history.
 * - **Untrusted identity** (the default): one shared budget when the limiter
 *   has `untrustedBudget`, otherwise always allow and store nothing. Without a
 *   trusted proxy the app cannot attribute a request to a client, so a shared
 *   budget lets one attacker lock everyone out. It is used only where that
 *   lockout is acceptable: the teacher gate (every attempt counts) and the
 *   student access code (`ACCESS_CODE_SHARED_*`: failed guesses count, and a
 *   correct code gives its own slot back). The real protection is a long random
 *   `ACCESS_CODE` (see `warnIfAccessCodeIsShort`).
 *
 * Scope and trade-offs, stated explicitly:
 * - It is per-process: state lives in this module's memory and is NOT shared
 *   across replicas, so a multi-instance deployment effectively gets one budget
 *   per instance rather than one global budget.
 * - Identity comes from {@link clientIdentity}, which a caller can only rotate
 *   when `TRUST_PROXY_HEADERS` is misconfigured (no real proxy overwriting the
 *   forwarding headers).
 *
 * Memory is bounded: identity keys are copied (never sliced), so a stored key
 * does not retain a larger forwarding header; each identity's timestamps are
 * pruned to the active window; and the number of tracked trusted identities is
 * capped by evicting the oldest entries.
 */

import { isTrustedProxyIdentity } from './client-identity';

/** Trusted-identity attempts allowed inside one window. */
export const ATTEMPT_LIMIT_MAX_FAILURES = 10;

/** Trusted-identity sliding-window length in milliseconds. */
export const ATTEMPT_LIMIT_WINDOW_MS = 60_000;

/** Hard cap on tracked trusted identities; oldest entries are evicted past this. */
export const ATTEMPT_LIMIT_MAX_IDENTITIES = 10_000;

/** Maximum characters of a client identity retained as a storage key. */
export const ATTEMPT_LIMIT_MAX_IDENTITY_LENGTH = 128;

export interface LimitStatus {
  limited: boolean;
  /**
   * Whole seconds until this caller may try again; always >= 1 when limited and
   * 0 when not limited.
   */
  retryAfterSeconds: number;
  /** Set when the attempt was reserved. Pass it to `release` to give the attempt back. */
  reservedAt?: number;
}

/** Injectable clock so tests can drive the window and the refill. */
type Clock = () => number;

/**
 * Bound an identity before it is used as a storage key. Forwarding headers can
 * be attacker-controlled and are only bounded by the runtime header limit, so a
 * single request could otherwise plant a multi-kilobyte map key.
 *
 * `String.prototype.slice` would return a V8 "sliced string" that keeps the
 * whole parent alive, so truncating would bound the key's length but not the
 * memory it retains. Copying the prefix into a fresh string bounds both.
 */
export function boundIdentityKey(identity: string): string {
  const length = Math.min(identity.length, ATTEMPT_LIMIT_MAX_IDENTITY_LENGTH);
  let copy = '';
  for (let i = 0; i < length; i += 1) {
    copy += identity.charAt(i);
  }
  return copy;
}

export interface SlidingWindowFailureLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  maxIdentities?: number;
  now?: Clock;
}

/**
 * Per-identity sliding-window attempt limiter. `consume` both decides and
 * records, so the reservation happens in one synchronous tick; a caller cannot
 * slip a request past the window between a check and a later record.
 */
export class SlidingWindowFailureLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly maxIdentities: number;
  private readonly now: Clock;

  constructor(options: SlidingWindowFailureLimiterOptions = {}) {
    this.maxFailures = options.maxFailures ?? ATTEMPT_LIMIT_MAX_FAILURES;
    this.windowMs = options.windowMs ?? ATTEMPT_LIMIT_WINDOW_MS;
    this.maxIdentities = options.maxIdentities ?? ATTEMPT_LIMIT_MAX_IDENTITIES;
    // Call `Date.now()` at use time (not construction) so fake timers installed
    // after the limiter is created still drive the window.
    this.now = options.now ?? (() => Date.now());
  }

  /** Reserve one attempt for `identity`, or report how long to wait. */
  consume(identity: string): LimitStatus {
    const key = boundIdentityKey(identity);
    const now = this.now();
    const timestamps = this.pruneAt(key, now);
    if (timestamps.length >= this.maxFailures) {
      const retryAfterMs = timestamps[0] + this.windowMs - now;
      return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    timestamps.push(now);
    // Keep only the newest attempts: once the budget is spent `consume` stops
    // reserving, so this is just a hard per-identity memory bound.
    if (timestamps.length > this.maxFailures) {
      timestamps.splice(0, timestamps.length - this.maxFailures);
    }
    // Re-insert so the most recently active identities are evicted last.
    this.failures.delete(key);
    this.failures.set(key, timestamps);
    this.enforceCapacity(now);
    return { limited: false, retryAfterSeconds: 0, reservedAt: now };
  }

  /** Forget `identity`'s reserved attempts, e.g. after a correct code. */
  recordSuccess(identity: string): void {
    this.failures.delete(boundIdentityKey(identity));
  }

  /** Give back the attempt reserved at `reservedAt`. A no-op once it has left the window. */
  release(identity: string, reservedAt: number): void {
    const key = boundIdentityKey(identity);
    const timestamps = this.failures.get(key);
    const index = timestamps?.lastIndexOf(reservedAt) ?? -1;
    if (!timestamps || index === -1) return;
    timestamps.splice(index, 1);
    if (timestamps.length === 0) this.failures.delete(key);
  }

  /** Drop all tracked state. Exists mainly for tests. */
  reset(): void {
    this.failures.clear();
  }

  /** Stored keys, bounded by {@link ATTEMPT_LIMIT_MAX_IDENTITY_LENGTH}. Test/diagnostic hook. */
  getTrackedKeys(): string[] {
    return [...this.failures.keys()];
  }

  /** Keep only timestamps inside the active window; returns the survivors. */
  private pruneAt(key: string, now: number): number[] {
    const cutoff = now - this.windowMs;
    const timestamps = (this.failures.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (timestamps.length === 0) {
      this.failures.delete(key);
    } else {
      this.failures.set(key, timestamps);
    }
    return timestamps;
  }

  /** Drop expired entries, then evict oldest-inserted ones until within cap. */
  private enforceCapacity(now: number): void {
    if (this.failures.size <= this.maxIdentities) return;

    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.failures) {
      if (this.failures.size <= this.maxIdentities) break;
      if (timestamps.every((timestamp) => timestamp <= cutoff)) {
        this.failures.delete(key);
      }
    }

    while (this.failures.size > this.maxIdentities) {
      const oldest = this.failures.keys().next().value;
      if (oldest === undefined) break;
      this.failures.delete(oldest);
    }
  }
}

/** A process-wide failure budget for callers whose identity is not trusted. */
export interface UntrustedAttemptBudget {
  readonly maxFailures: number;
  readonly windowMs: number;
}

/** Options accepted by {@link AccessCodeAttemptLimiter}. */
export interface AccessCodeAttemptLimiterOptions extends SlidingWindowFailureLimiterOptions {
  /**
   * Opt-in shared budget for untrusted callers. Unset (the default), untrusted
   * callers are never throttled.
   */
  untrustedBudget?: UntrustedAttemptBudget;
}

/** The single key of the shared untrusted bucket. */
const UNTRUSTED_BUCKET = 'untrusted';

/**
 * Facade used by the verify routes. Trusted identities get per-identity
 * throttling. Untrusted callers are always allowed, unless the limiter was built
 * with `untrustedBudget`, in which case they share one bucket.
 */
export class AccessCodeAttemptLimiter {
  private readonly trustedIdentities: SlidingWindowFailureLimiter;
  private readonly untrustedBucket: SlidingWindowFailureLimiter | null;

  constructor(options: AccessCodeAttemptLimiterOptions = {}) {
    this.trustedIdentities = new SlidingWindowFailureLimiter(options);
    this.untrustedBucket = options.untrustedBudget
      ? new SlidingWindowFailureLimiter({
          maxFailures: options.untrustedBudget.maxFailures,
          windowMs: options.untrustedBudget.windowMs,
          maxIdentities: 1,
          now: options.now,
        })
      : null;
  }

  /**
   * Reserve one attempt for `identity`. A trusted identity uses its own window;
   * an untrusted caller uses the shared bucket when there is one. Without a
   * bucket the untrusted branch is unconditional and stores nothing.
   */
  consume(identity: string, trusted: boolean = isTrustedProxyIdentity()): LimitStatus {
    if (trusted) return this.trustedIdentities.consume(identity);
    if (!this.untrustedBucket) return { limited: false, retryAfterSeconds: 0 };
    return this.untrustedBucket.consume(UNTRUSTED_BUCKET);
  }

  /**
   * Clear a trusted identity's history after a correct code. For an untrusted
   * caller, `reservation` (what `consume` returned for this attempt) gives back
   * only that attempt's shared slot. Without it the shared bucket is never
   * cleared, so a success there is not a reset.
   */
  recordSuccess(
    identity: string,
    trusted: boolean = isTrustedProxyIdentity(),
    reservation?: LimitStatus,
  ): void {
    if (trusted) {
      this.trustedIdentities.recordSuccess(identity);
    } else if (reservation?.reservedAt !== undefined) {
      this.untrustedBucket?.release(UNTRUSTED_BUCKET, reservation.reservedAt);
    }
  }

  /** Drop all tracked state. Exists mainly for tests. */
  reset(): void {
    this.trustedIdentities.reset();
    this.untrustedBucket?.reset();
  }

  /** Stored trusted-identity keys, for tests/diagnostics. */
  getTrackedKeys(): string[] {
    return this.trustedIdentities.getTrackedKeys();
  }
}

/**
 * Failed guesses the shared student budget allows in one window, without a trusted proxy.
 * ponytail: per process, so N replicas allow N budgets; move it to a shared store if the
 * access code runs on several instances.
 */
export const ACCESS_CODE_SHARED_MAX_FAILURES = 200;

/** Shared student budget window in milliseconds. */
export const ACCESS_CODE_SHARED_WINDOW_MS = 15 * 60_000;

/** Process-wide limiter used by the access-code verification route. */
export const accessCodeAttemptLimiter = new AccessCodeAttemptLimiter({
  untrustedBudget: {
    maxFailures: ACCESS_CODE_SHARED_MAX_FAILURES,
    windowMs: ACCESS_CODE_SHARED_WINDOW_MS,
  },
});
