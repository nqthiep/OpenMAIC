/**
 * The home's two decisions: which message the status strip shows, and which course it offers to
 * continue. The boundaries are the ones the strip promises: 7 days, 80% and 100% of the allowance.
 */
import { describe, expect, it } from 'vitest';
import {
  membershipNotice,
  nextMonthStart,
  pickContinue,
  type MembershipLike,
  type UsageLike,
} from '@/lib/home/learner-status';

const NOW = new Date('2026-10-17T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function member(overrides: Partial<MembershipLike> = {}, daysLeft = 30): MembershipLike {
  return {
    status: 'active',
    active: true,
    expiresAt: new Date(NOW.getTime() + daysLeft * DAY).toISOString(),
    ...overrides,
  };
}

function usage(used: number, quota = 1000, bonus = 0): UsageLike {
  return { active: true, quota, bonus, used };
}

describe('membershipNotice', () => {
  it('says nothing about a visitor without a membership', () => {
    expect(membershipNotice(null, undefined, NOW).kind).toBe('none');
    expect(membershipNotice(undefined, usage(0), NOW).kind).toBe('none');
  });

  it('puts a suspended or expired membership before everything else', () => {
    const exhausted = usage(5000);
    expect(
      membershipNotice(member({ status: 'suspended', active: false }), exhausted, NOW).kind,
    ).toBe('suspended');
    expect(membershipNotice(member({ active: false }), exhausted, NOW).kind).toBe('expired');
    // A cached session can still say active after the end date has passed.
    expect(membershipNotice(member({}, -1), usage(0), NOW).kind).toBe('expired');
    expect(membershipNotice(member({ expiresAt: 'not a date' }), usage(0), NOW).kind).toBe(
      'expired',
    );
  });

  it('locks at the server threshold: used >= quota + bonus', () => {
    expect(membershipNotice(member(), usage(999), NOW).kind).not.toBe('quotaOut');
    expect(membershipNotice(member(), usage(1000), NOW).kind).toBe('quotaOut');
    expect(membershipNotice(member(), usage(1000, 1000, 200), NOW).kind).not.toBe('quotaOut');
    expect(membershipNotice(member(), usage(1200, 1000, 200), NOW).kind).toBe('quotaOut');
    // A membership granted with no allowance is used up at once.
    expect(membershipNotice(member(), usage(0, 0), NOW)).toMatchObject({
      kind: 'quotaOut',
      percentUsed: 100,
    });
  });

  it('warns from 80% of the allowance, counting the bonus', () => {
    expect(membershipNotice(member(), usage(799), NOW).kind).toBe('ok');
    expect(membershipNotice(member(), usage(800), NOW)).toMatchObject({
      kind: 'quotaNear',
      percentUsed: 80,
    });
    expect(membershipNotice(member(), usage(900, 1000, 500), NOW).kind).toBe('ok');
  });

  it('warns when fewer than 7 days are left and rounds the days up', () => {
    expect(membershipNotice(member({}, 7), usage(0), NOW).kind).toBe('ok');
    expect(membershipNotice(member({}, 6.5), usage(0), NOW)).toMatchObject({
      kind: 'expiring',
      daysLeft: 7,
    });
    expect(membershipNotice(member({}, 0.25), usage(0), NOW)).toMatchObject({
      kind: 'expiring',
      daysLeft: 1,
    });
  });

  it('ranks the used-up allowance above the expiry warning', () => {
    expect(membershipNotice(member({}, 2), usage(1000), NOW).kind).toBe('quotaOut');
    expect(membershipNotice(member({}, 2), usage(850), NOW).kind).toBe('expiring');
  });

  it('is ok, without a percentage, while the usage is unknown', () => {
    const notice = membershipNotice(member(), undefined, NOW);
    expect(notice.kind).toBe('ok');
    expect(notice.percentUsed).toBeUndefined();
    expect(membershipNotice(member(), { active: false }, NOW).percentUsed).toBeUndefined();
  });
});

describe('pickContinue', () => {
  const course = (id: string, updatedAt: number, sceneCount = 5) => ({ id, updatedAt, sceneCount });

  it('returns nothing for an empty list', () => {
    expect(pickContinue([], new Map())).toBeUndefined();
  });

  it('prefers the course with the latest saved position over a newer edit', () => {
    const list = [course('edited', 3000), course('studied', 1000)];
    expect(pickContinue(list, new Map([['studied', 2000]]))?.id).toBe('studied');
  });

  it('offers the course changed last when no course has a position yet', () => {
    const list = [course('fresh', 3000), course('old', 1000)];
    expect(pickContinue(list, new Map())?.id).toBe('fresh');
  });

  it('skips courses without scenes and keeps the first on a tie', () => {
    expect(pickContinue([course('empty', 9000, 0), course('a', 100)], new Map())?.id).toBe('a');
    expect(pickContinue([course('a', 100), course('b', 100)], new Map())?.id).toBe('a');
    expect(pickContinue([course('empty', 9000, 0)], new Map())).toBeUndefined();
  });
});

describe('nextMonthStart', () => {
  it('is the first of next month in UTC, across a year end', () => {
    expect(nextMonthStart(new Date('2026-10-17T12:00:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(nextMonthStart(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});
