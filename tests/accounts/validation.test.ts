import { describe, expect, it } from 'vitest';

import {
  isAcceptablePassword,
  normalizeUsername,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/server/accounts/validation';

const MALFORMED_USERNAMES: Array<[string, unknown]> = [
  ['2 characters', 'ab'],
  ['33 characters', 'a'.repeat(33)],
  ['a leading dot', '.alice'],
  ['a leading underscore', '_alice'],
  ['a leading hyphen', '-alice'],
  ['an embedded space', 'al ice'],
  ['an accented Latin letter', 'álice'],
  ['a Cyrillic look-alike', 'аlice'],
  ['a fullwidth letter', 'ａlice'],
  ['an empty string', ''],
  ['a number', 123],
  ['null', null],
  ['undefined', undefined],
  ['an array', ['alice']],
  ['an object', { username: 'alice' }],
];

const NON_STRING_PASSWORDS: Array<[string, unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['a number', 12345678],
  ['an array', ['password123']],
];

describe('normalizeUsername', () => {
  it('trims surrounding whitespace and lowercases the result', () => {
    expect(normalizeUsername('  Alice.Smith_1-x  ')).toBe('alice.smith_1-x');
  });

  it('accepts the length boundaries of 3 and 32 characters', () => {
    expect(normalizeUsername('abc')).toBe('abc');
    expect(normalizeUsername('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it('rejects malformed usernames and non-string input', () => {
    const accepted = MALFORMED_USERNAMES.filter(
      ([, input]) => normalizeUsername(input) !== undefined,
    ).map(([label]) => label);
    expect(accepted).toEqual([]);
  });

  it('rejects non-ASCII input even when lowercasing would map it to ASCII', () => {
    // U+212A KELVIN SIGN lowercases to ASCII "k", so lowercasing before the
    // ASCII check lets it through and stores "karl". The policy says ASCII only.
    expect(normalizeUsername('Karl')).toBeUndefined();
  });
});

describe('isAcceptablePassword', () => {
  it('sets the floor at 8 and the ceiling at 256 code points', () => {
    expect([PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]).toEqual([8, 256]);
    expect(isAcceptablePassword('a'.repeat(7))).toBe(false);
    expect(isAcceptablePassword('a'.repeat(8))).toBe(true);
    expect(isAcceptablePassword('a'.repeat(256))).toBe(true);
    expect(isAcceptablePassword('a'.repeat(257))).toBe(false);
  });

  it('counts code points rather than UTF-16 units', () => {
    // Each emoji is one code point but two UTF-16 units.
    expect(isAcceptablePassword('\u{1F600}'.repeat(7))).toBe(false);
    expect(isAcceptablePassword('\u{1F600}'.repeat(8))).toBe(true);
    expect(isAcceptablePassword('\u{1F600}'.repeat(256))).toBe(true);
    expect(isAcceptablePassword('\u{1F600}'.repeat(257))).toBe(false);
  });

  it('rejects a NUL character anywhere in the password', () => {
    expect(isAcceptablePassword('pass\u0000word1')).toBe(false);
    expect(isAcceptablePassword('\u0000password1')).toBe(false);
  });

  it('does not trim, so surrounding spaces are kept and counted', () => {
    expect(isAcceptablePassword(' abcdefg')).toBe(true); // 8 with the leading space
    expect(isAcceptablePassword('abc     ')).toBe(true); // 3 letters + 5 spaces
    expect(isAcceptablePassword('        ')).toBe(true); // 8 spaces, empty if trimmed
  });

  it('rejects non-string input', () => {
    const accepted = NON_STRING_PASSWORDS.filter(([, input]) => isAcceptablePassword(input)).map(
      ([label]) => label,
    );
    expect(accepted).toEqual([]);
  });
});
