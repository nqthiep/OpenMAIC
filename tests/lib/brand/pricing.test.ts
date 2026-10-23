import { describe, expect, it } from 'vitest';
import { formatDong, PRICING, savingPercent } from '@/lib/brand/pricing';

describe('PRICING', () => {
  it('has a monthly, a half-year and a yearly plan, cheapest per month last', () => {
    expect(PRICING.map((plan) => plan.id)).toEqual(['m1', 'm6', 'm12']);
    expect(PRICING.map((plan) => plan.months)).toEqual([1, 6, 12]);
    const perMonth = PRICING.map((plan) => plan.price / plan.months);
    expect([...perMonth].sort((a, b) => b - a)).toEqual(perMonth);
  });

  it('prices in whole thousands of dong, as a bank transfer is easy to read', () => {
    for (const plan of PRICING) expect(plan.price % 1000).toBe(0);
  });
});

describe('savingPercent', () => {
  it('is 0 for the monthly plan and what the longer plans save against it', () => {
    const [m1, m6, m12] = PRICING;
    expect(savingPercent(m1!)).toBe(0);
    expect(savingPercent(m6!)).toBe(16);
    expect(savingPercent(m12!)).toBe(24);
  });
});

describe('formatDong', () => {
  it('writes dong the way Vietnamese readers do', () => {
    expect(formatDong(99_000, 'vi-VN')).toMatch(/^99\.000\s?₫$/);
  });

  it('uses the language of the reader', () => {
    expect(formatDong(899_000, 'en-US')).toContain('899,000');
  });

  it('falls back to plain text for a locale the runtime does not know', () => {
    expect(formatDong(99_000, 'not a locale')).toBe('99,000 VND');
  });
});
