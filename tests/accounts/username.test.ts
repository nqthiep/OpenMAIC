import { describe, expect, it } from 'vitest';

import { isUsernameShape, normalizeUsername, usernameProblem } from '@/lib/accounts/username';

describe('usernames', () => {
  it('normalizes surrounding space and case', () => {
    expect(normalizeUsername('  Alice.Smith  ')).toBe('alice.smith');
  });

  it('accepts 3 to 32 characters of the allowed set, starting with a letter or digit', () => {
    expect(isUsernameShape('abc')).toBe(true);
    expect(isUsernameShape('a'.repeat(32))).toBe(true);
    expect(isUsernameShape('9lives-_.x')).toBe(true);
  });

  it('refuses names shorter than 3 or longer than 32 characters', () => {
    expect(isUsernameShape('ab')).toBe(false);
    expect(isUsernameShape('a'.repeat(33))).toBe(false);
  });

  it.each([
    '.alice',
    '-alice',
    '_alice',
    'al ice',
    'al:ice',
    'ali/ce',
    'alicé',
    'ａｄｍｉｎ',
    'Alice',
  ])('refuses %s: outside the allowed set or not normalized', (value) => {
    expect(isUsernameShape(value)).toBe(false);
  });

  it.each(['admin', 'root', 'system', 'api', 'login', 'account', 'support', 'openmaic'])(
    'reserves %s',
    (name) => {
      expect(usernameProblem(name)).toBe('reserved');
    },
  );

  it('issues an ordinary name and reports the shape problem of a short one', () => {
    expect(usernameProblem('teacher.tin')).toBeUndefined();
    expect(usernameProblem('ab')).toBe('format');
  });
});
