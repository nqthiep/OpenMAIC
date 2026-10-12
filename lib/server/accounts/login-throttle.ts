/**
 * Failed sign-in throttle, keyed by normalized username.
 *
 * In-memory and per process: a deployment with several instances gets one
 * budget per instance. Memory is bounded by `maxKeys`.
 *
 * When the table is full, expired keys go first, then the oldest key still under
 * the limit. A live lock is never evicted. When the table is full and every tracked
 * key is locked, a name with no record is refused until a lock lapses, and the
 * refusal is answered before any password check. A flood of names therefore cannot
 * release a lock early. Names are admitted again as soon as room exists.
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
  // Insertion order is the order of each key's latest failure, oldest first.
  private readonly failures = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(private readonly options: LoginThrottleOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Seconds until `key` may try again, or undefined when an attempt is allowed now. */
  retryAfterSeconds(key: string): number | undefined {
    const recent = this.recentFailures(key);
    if (recent.length === 0 && !this.failures.has(key) && !this.hasRoom()) {
      return this.secondsUntil(this.earliestUnlock());
    }
    if (recent.length < this.options.maxFailures) return undefined;
    return this.secondsUntil(recent[0]! + this.options.windowMs);
  }

  /**
   * Records one failure and returns its timestamp, which `refund` takes back.
   * Returns undefined when the name is refused because the table is full and every
   * tracked key is locked. Nothing is recorded in that case, and the caller must not
   * check the password.
   */
  recordFailure(key: string): number | undefined {
    const now = this.now();
    const recent = this.recentFailures(key);
    recent.push(now);
    this.failures.delete(key);
    this.failures.set(key, recent);
    if (this.failures.size > this.options.maxKeys && !this.makeRoom(key)) {
      this.failures.delete(key);
      return undefined;
    }
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

  /** Drops keys whose failures have all left the window. Stops at the first live key, since Map order is oldest first. */
  private dropExpired(): void {
    const cutoff = this.now() - this.options.windowMs;
    for (const [key, stamps] of this.failures) {
      if (stamps[stamps.length - 1]! > cutoff) break;
      this.failures.delete(key);
    }
  }

  /** Whether a name with no record could be tracked now, without evicting a lock. */
  private hasRoom(): boolean {
    if (this.failures.size < this.options.maxKeys) return true;
    this.dropExpired();
    return this.failures.size < this.options.maxKeys || this.findUnlocked(undefined) !== undefined;
  }

  /** Brings the table back to maxKeys. Returns false when every key left is a live lock. */
  private makeRoom(keep: string): boolean {
    this.dropExpired();
    while (this.failures.size > this.options.maxKeys) {
      const victim = this.findUnlocked(keep);
      if (victim === undefined) return false;
      this.failures.delete(victim);
    }
    return true;
  }

  /**
   * The oldest key still under the limit, or undefined when every key is locked. The
   * scan covers the whole table. It stops at the first unlocked key, and it runs only
   * when an insert meets a full table.
   */
  private findUnlocked(keep: string | undefined): string | undefined {
    const cutoff = this.now() - this.options.windowMs;
    for (const [key, stamps] of this.failures) {
      if (key === keep) continue;
      if (stamps.filter((at) => at > cutoff).length < this.options.maxFailures) return key;
    }
    return undefined;
  }

  /** The instant the earliest live lock lapses, which is when room next opens. Used only while the table has no room. */
  private earliestUnlock(): number {
    const cutoff = this.now() - this.options.windowMs;
    let earliest = Number.POSITIVE_INFINITY;
    for (const stamps of this.failures.values()) {
      const live = stamps.filter((at) => at > cutoff);
      if (live.length < this.options.maxFailures) return this.now();
      // The key unlocks when its oldest (live.length - maxFailures + 1) failures have expired.
      const lapse = live[live.length - this.options.maxFailures]! + this.options.windowMs;
      if (lapse < earliest) earliest = lapse;
    }
    return earliest;
  }

  private secondsUntil(instant: number): number {
    return Math.max(1, Math.ceil((instant - this.now()) / 1000));
  }
}
