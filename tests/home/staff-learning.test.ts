import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberStaffLearning, staffChoseLearning } from '@/lib/home/staff-learning';

describe('staff learning-home choice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is kept until the dashboard clears it', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    expect(staffChoseLearning()).toBe(false);
    rememberStaffLearning(true);
    expect(staffChoseLearning()).toBe(true);
    rememberStaffLearning(false);
    expect(staffChoseLearning()).toBe(false);
  });

  it('reads as not chosen when storage is blocked', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberStaffLearning(true)).not.toThrow();
    expect(staffChoseLearning()).toBe(false);
  });
});
