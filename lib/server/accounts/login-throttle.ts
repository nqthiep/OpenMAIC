/**
 * Failed sign-in throttle, keyed by normalized username.
 *
 * In-memory and per process: a deployment with several instances gets one
 * budget per instance, not one shared budget. Memory is bounded by `maxKeys`.
 *
 * When the table is full, expired keys go first, then the oldest key still
 * under the limit. A locked key is evicted only when every tracked key is
 * locked. Filling the table that way costs `maxKeys * maxFailures` failed
 * attempts, and a failure refused because the password queue is busy is
 * refunded, so the cost is paid in password derivations, not cheap requests.
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

/** Keys examined while looking for an unlocked one, which bounds the work per insert. */
const EVICTION_SCAN_LIMIT = 64;

export class LoginThrottle {
  // Insertion order is the order of each key's latest failure, oldest first.
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

  /** Records one failure and returns its timestamp, which `refund` takes back. */
  recordFailure(key: string): number {
    const now = this.now();
    const recent = this.recentFailures(key);
    recent.push(now);
    this.failures.delete(key);
    this.failures.set(key, recent);
    if (this.failures.size > this.options.maxKeys) this.makeRoom(key);
    return now;
  }

  /** Removes the failure recorded at `token`, for an attempt that never checked a password. */
  refund(key: string, token: number): void {
    const stamps = this.failures.get(key);
    if (!stamps) return;
    const index = stamps.lastIndexOf(token);
    if (index === -1) return;
    stamps.splice(index, 1);
    if (stamps.length === 0) this.failures.delete(key);
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

  /** Brings the table back to `maxKeys`. The key just written is never the one removed. */
  private makeRoom(keep: string): void {
    const cutoff = this.now() - this.options.windowMs;
    for (const [key, stamps] of this.failures) {
      if (stamps[stamps.length - 1]! > cutoff) break;
      this.failures.delete(key);
    }
    while (this.failures.size > this.options.maxKeys) {
      const victim = this.pickVictim(keep);
      if (victim === undefined) break;
      this.failures.delete(victim);
    }
  }

  /** The oldest key under the limit within the scan bound, else the oldest key examined. */
  private pickVictim(keep: string): string | undefined {
    const cutoff = this.now() - this.options.windowMs;
    let oldest: string | undefined;
    let examined = 0;
    for (const [key, stamps] of this.failures) {
      if (key === keep) continue;
      oldest ??= key;
      const live = stamps.filter((at) => at > cutoff).length;
      if (live < this.options.maxFailures) return key;
      examined += 1;
      if (examined >= EVICTION_SCAN_LIMIT) break;
    }
    return oldest;
  }
}
