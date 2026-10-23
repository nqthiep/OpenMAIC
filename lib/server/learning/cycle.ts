/**
 * The cycles of a membership. A plan runs as one or more periods, each with its own monthly quota.
 * A period is cut into cycles of one calendar month counted from the day the period started: a
 * period that starts on 20/10 has cycles 20/10 to 20/11, 20/11 to 20/12, and so on, and the quota
 * of a cycle is the quota of its period. The allowance comes back at the instant a cycle ends.
 *
 * Dates are read on the Vietnam calendar (UTC+7, no daylight saving), so "20/10" is 20/10 for a
 * Vietnamese member whatever the hour. ponytail: one fixed zone, because the service is Vietnamese;
 * if members in other zones matter, store a zone per account and pass its offset in.
 */
export const VIETNAM_OFFSET_MS = 7 * 3_600_000;

export interface QuotaPeriod {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly monthlyQuota: number;
}

export interface Cycle {
  readonly start: Date;
  /** The end of the month, or the end of the period when that comes first. */
  readonly end: Date;
  /** Names the cycle, for what is kept per cycle (reward tokens). Unique per account. */
  readonly key: string;
}

/**
 * `anchor` plus `months` calendar months, at the same time of day. A day the target month does
 * not have falls back to its last day (31/1 plus one month is 28/2). Always counted from the
 * anchor and never from the previous result, so 31/1, 28/2, 31/3 does not drift to the 28th.
 */
export function addMonths(anchor: Date, months: number): Date {
  const local = new Date(anchor.getTime() + VIETNAM_OFFSET_MS);
  const day = local.getUTCDate();
  const target = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth() + months,
      1,
      local.getUTCHours(),
      local.getUTCMinutes(),
      local.getUTCSeconds(),
      local.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return new Date(target.getTime() - VIETNAM_OFFSET_MS);
}

/** The cycle of `period` that contains `now`. `now` before the period reads as its first cycle. */
export function cycleOf(period: QuotaPeriod, now: Date): Cycle {
  const from = new Date(period.startsAt.getTime() + VIETNAM_OFFSET_MS);
  const at = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  let k =
    (at.getUTCFullYear() - from.getUTCFullYear()) * 12 + at.getUTCMonth() - from.getUTCMonth();
  k = Math.max(0, k);
  // The month difference can be one too many (the day has not come yet) or, after a clamp, one too few.
  while (k > 0 && addMonths(period.startsAt, k).getTime() > now.getTime()) k -= 1;
  while (addMonths(period.startsAt, k + 1).getTime() <= now.getTime()) k += 1;
  const start = addMonths(period.startsAt, k);
  const end = new Date(
    Math.min(addMonths(period.startsAt, k + 1).getTime(), period.endsAt.getTime()),
  );
  return { start, end, key: start.toISOString() };
}

/**
 * The period running at `now`, from the periods of one account. The first period also covers any
 * time before it began, so a membership row written before periods existed (and test rows with a
 * fixed clock) read as running until they end.
 */
export function periodAt(periods: readonly QuotaPeriod[], now: Date): QuotaPeriod | undefined {
  const t = now.getTime();
  let hit: QuotaPeriod | undefined;
  periods.forEach((period, index) => {
    if (t < period.endsAt.getTime() && (index === 0 || t >= period.startsAt.getTime())) {
      hit = period;
    }
  });
  return hit;
}

export interface ResolvedPeriods {
  /** The cycle in force, when a period is running. */
  readonly cycle?: Cycle;
  /** The quota of that cycle; after the end, the quota of the last period that began. */
  readonly monthlyQuota: number;
  /** The end of the last period. */
  readonly expiresAt: Date;
}

/** What `periods` (oldest first, at least one) mean at `now`. */
export function resolvePeriods(periods: readonly QuotaPeriod[], now: Date): ResolvedPeriods {
  const running = periodAt(periods, now);
  const began = periods.filter((p) => p.startsAt.getTime() <= now.getTime());
  const last = began[began.length - 1] ?? periods[0]!;
  return {
    ...(running ? { cycle: cycleOf(running, now) } : {}),
    monthlyQuota: (running ?? last).monthlyQuota,
    expiresAt: new Date(Math.max(...periods.map((p) => p.endsAt.getTime()))),
  };
}
