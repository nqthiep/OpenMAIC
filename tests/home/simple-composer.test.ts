import { describe, expect, it } from 'vitest';
import type { AccountSession } from '@/components/account/account-api';
import { canChooseProvider, TEMPLATE_BLANK } from '@/lib/home/simple-composer';

describe('canChooseProvider', () => {
  const as = (s: Partial<AccountSession>) => s as AccountSession;
  it('is for operators, administrators and the single local user only', () => {
    expect(canChooseProvider(as({ enabled: true, role: 'admin' }))).toBe(true);
    expect(canChooseProvider(as({ enabled: true, role: 'operator' }))).toBe(true);
    expect(canChooseProvider(as({ enabled: false }))).toBe(true);
    expect(canChooseProvider(as({ enabled: true, role: 'learner' }))).toBe(false);
    expect(canChooseProvider(as({ enabled: true }))).toBe(false);
    expect(canChooseProvider(undefined)).toBe(false);
    expect(canChooseProvider(null)).toBe(false);
  });
});

describe('TEMPLATE_BLANK', () => {
  it('matches a starter prompt that still has its blank', () => {
    expect(TEMPLATE_BLANK.test('Giải thích [chủ đề] cho người mới bắt đầu')).toBe(true);
  });
  it('lets a filled prompt through', () => {
    expect(TEMPLATE_BLANK.test('Giải thích đạo hàm cho người mới bắt đầu')).toBe(false);
    expect(TEMPLATE_BLANK.test('Giải thích []')).toBe(false);
  });
});
