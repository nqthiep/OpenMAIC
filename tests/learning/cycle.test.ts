import { describe, expect, it } from 'vitest';
import {
  addMonths,
  cycleOf,
  periodAt,
  resolvePeriods,
  type QuotaPeriod,
} from '@/lib/server/learning/cycle';

const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();

// 21:15 in Vietnam on 20/10/2026 is 14:15 UTC.
const START = at('2026-10-20T14:15:00.000Z');

const period = (startsAt: string, endsAt: string, monthlyQuota: number): QuotaPeriod => ({
  startsAt: at(startsAt),
  endsAt: at(endsAt),
  monthlyQuota,
});

describe('addMonths', () => {
  it('keeps the day and the time of day: 20/10 21:15 plus a month is 20/11 21:15', () => {
    expect(iso(addMonths(START, 1))).toBe('2026-11-20T14:15:00.000Z');
    expect(iso(addMonths(START, 2))).toBe('2026-12-20T14:15:00.000Z');
  });

  it('crosses the year and counts back', () => {
    expect(iso(addMonths(START, 3))).toBe('2027-01-20T14:15:00.000Z');
    expect(iso(addMonths(START, 12))).toBe('2027-10-20T14:15:00.000Z');
    expect(iso(addMonths(START, -1))).toBe('2026-09-20T14:15:00.000Z');
  });

  it('falls back to the last day of a shorter month, and does not drift afterwards', () => {
    const jan31 = at('2027-01-31T03:00:00.000Z');
    expect(iso(addMonths(jan31, 1))).toBe('2027-02-28T03:00:00.000Z');
    expect(iso(addMonths(jan31, 2))).toBe('2027-03-31T03:00:00.000Z');
    expect(iso(addMonths(jan31, 13))).toBe('2028-02-29T03:00:00.000Z'); // 2028 is a leap year
  });

  it('reads the day on the Vietnam calendar, not the UTC one', () => {
    // 01:00 in Vietnam on 21/10 is still 20/10 in UTC; the member signed up on the 21st.
    const lateNight = at('2026-10-20T18:00:00.000Z');
    expect(iso(addMonths(lateNight, 1))).toBe('2026-11-20T18:00:00.000Z');
    // and the 31st in Vietnam falls back by Vietnamese days: 23:00 UTC on 30/1 is 06:00 on 31/1.
    const jan31Vn = at('2027-01-30T23:00:00.000Z');
    expect(iso(addMonths(jan31Vn, 1))).toBe('2027-02-27T23:00:00.000Z'); // 28/2 06:00 in Vietnam
  });
});

describe('cycleOf: the allowance comes back on the day the period started, each month', () => {
  const paid = period('2026-10-20T14:15:00.000Z', '2027-04-20T14:15:00.000Z', 1_000_000);

  it('is the first month from the start until the instant of the anniversary', () => {
    const early = cycleOf(paid, at('2026-10-20T14:15:00.000Z'));
    expect(iso(early.start)).toBe('2026-10-20T14:15:00.000Z');
    expect(iso(early.end)).toBe('2026-11-20T14:15:00.000Z');
    const late = cycleOf(paid, at('2026-11-20T14:14:59.999Z'));
    expect(late.key).toBe(early.key);
  });

  it('starts the next cycle at the instant of the anniversary, not at midnight', () => {
    const next = cycleOf(paid, at('2026-11-20T14:15:00.000Z'));
    expect(iso(next.start)).toBe('2026-11-20T14:15:00.000Z');
    expect(iso(next.end)).toBe('2026-12-20T14:15:00.000Z');
    // The first of the month is nothing special.
    expect(cycleOf(paid, at('2026-11-01T00:00:00.000Z')).key).toBe(
      cycleOf(paid, at('2026-10-25T00:00:00.000Z')).key,
    );
  });

  it('gives each cycle its own key, and the same key all through one cycle', () => {
    const keys = new Set<string>();
    for (let day = 0; day < 180; day += 1) {
      keys.add(cycleOf(paid, new Date(START.getTime() + day * 86_400_000)).key);
    }
    expect(keys.size).toBe(6);
  });

  it('ends a cycle at the end of the period when that comes first', () => {
    const trial = period('2026-10-20T14:15:00.000Z', '2026-11-19T14:15:00.000Z', 500_000);
    const cycle = cycleOf(trial, at('2026-11-10T00:00:00.000Z'));
    expect(iso(cycle.start)).toBe('2026-10-20T14:15:00.000Z');
    expect(iso(cycle.end)).toBe('2026-11-19T14:15:00.000Z');
  });

  it('follows a start on the 31st through the short months', () => {
    const p = period('2027-01-31T03:00:00.000Z', '2027-07-31T03:00:00.000Z', 1);
    expect(iso(cycleOf(p, at('2027-02-27T00:00:00.000Z')).end)).toBe('2027-02-28T03:00:00.000Z');
    const march = cycleOf(p, at('2027-03-05T00:00:00.000Z'));
    expect(iso(march.start)).toBe('2027-02-28T03:00:00.000Z');
    expect(iso(march.end)).toBe('2027-03-31T03:00:00.000Z');
  });

  it('reads a clock before the start as the first cycle', () => {
    const first = cycleOf(paid, at('2026-01-01T00:00:00.000Z'));
    expect(iso(first.start)).toBe('2026-10-20T14:15:00.000Z');
  });
});

describe('periodAt and resolvePeriods', () => {
  const trial = period('2026-10-20T14:15:00.000Z', '2026-11-19T14:15:00.000Z', 500_000);
  const paid = period('2026-11-19T14:15:00.000Z', '2026-12-19T14:15:00.000Z', 1_000_000);

  it('uses the quota of the period that is running, so a purchase waits for the next period', () => {
    const duringTrial = resolvePeriods([trial, paid], at('2026-11-05T00:00:00.000Z'));
    expect(duringTrial.monthlyQuota).toBe(500_000);
    expect(iso(duringTrial.cycle!.end)).toBe('2026-11-19T14:15:00.000Z');
    const afterTrial = resolvePeriods([trial, paid], at('2026-11-19T14:15:00.000Z'));
    expect(afterTrial.monthlyQuota).toBe(1_000_000);
    expect(iso(afterTrial.cycle!.start)).toBe('2026-11-19T14:15:00.000Z');
  });

  it('starts the cycles of a stacked period on the day it begins, not on the old anchor', () => {
    const later = resolvePeriods([trial, paid], at('2026-12-01T00:00:00.000Z'));
    expect(iso(later.cycle!.start)).toBe('2026-11-19T14:15:00.000Z');
    expect(iso(later.cycle!.end)).toBe('2026-12-19T14:15:00.000Z');
  });

  it('has no cycle after the last period, and keeps the last quota for display', () => {
    const over = resolvePeriods([trial, paid], at('2026-12-20T00:00:00.000Z'));
    expect(over.cycle).toBeUndefined();
    expect(over.monthlyQuota).toBe(1_000_000);
    expect(iso(over.expiresAt)).toBe('2026-12-19T14:15:00.000Z');
  });

  it('has no cycle in a gap between two periods', () => {
    const gapped = [trial, period('2026-12-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z', 1)];
    expect(periodAt(gapped, at('2026-11-25T00:00:00.000Z'))).toBeUndefined();
    expect(resolvePeriods(gapped, at('2026-11-25T00:00:00.000Z')).monthlyQuota).toBe(500_000);
  });

  it('lets the first period cover the time before it began (rows written before periods)', () => {
    expect(periodAt([trial], at('2026-01-01T00:00:00.000Z'))).toBe(trial);
  });
});
