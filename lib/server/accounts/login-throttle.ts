/**
 * Failed sign-in throttle, keyed by normalized username.
 *
 * In-memory and per process: a deployment with several instances gets one
 * budget per instance, not one shared budget. Memory is bounded by `maxKeys`;
 * the oldest-tracked key is evicted first, which only ever weakens the throttle
 * for the evicted name, never blocks anyone who was not already throttled.
 *
 * Keyed by username rather than client address because the address is only
 * trustworthy behind a proxy that overwrites it. The trade-off is that an
 * attacker can briefly lock out a known username, which is accepted here.
 */

export interface LoginThrottleOptions {
  /** Failed attempts allowed inside the window before further attempts are refused. */
  maxFailures: number;
  windowMs: number;
  maxKeys: number;
  now?: () => number;
}

export const DEFAULT_LOGIN_THROTTLE: Omit<LoginThrottleOptions, 'now'> = {
  maxFailures: 8,
  windowMs: 15 * 60 * 1000,
  maxKeys: 10_000,
};

export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(private readonly options: LoginThrottleOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Seconds until `key` may try again, or undefined when an attempt is allowed now. */
  retryAfterSeconds(key: string): number | undefined {
    const recent = this.recentFailures(key);
    if (recent.length < this.options.maxFailures) return undefined;
    const freesAt = recent[0]! + this.options.windowMs;
    return Math.max(1, Math.ceil((freesAt - this.now()) / 1000));
  }

  recordFailure(key: string): void {
    const now = this.now();
    const recent = this.recentFailures(key);
    recent.push(now);
    this.failures.delete(key);
    this.failures.set(key, recent);
    while (this.failures.size > this.options.maxKeys) {
      const oldest = this.failures.keys().next().value;
      if (oldest === undefined) break;
      this.failures.delete(oldest);
    }
  }

  /** Clears the failure history for `key` after a successful sign-in. */
  reset(key: string): void {
    this.failures.delete(key);
  }

  private recentFailures(key: string): number[] {
    const cutoff = this.now() - this.options.windowMs;
    const recent = (this.failures.get(key) ?? []).filter((at) => at > cutoff);
    if (recent.length === 0) this.failures.delete(key);
    return recent;
  }
}
