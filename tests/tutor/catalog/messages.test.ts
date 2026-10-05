import { describe, expect, it } from 'vitest';
import { fill, hasRequiredLocales, msg, unresolved } from '@/lib/tutor/catalog/messages';

describe('msg', () => {
  const m = { 'vi-VN': 'xin chào', 'en-US': 'hello' };
  it('picks the locale, falls back to en-US, then to empty string', () => {
    expect(msg(m, 'vi-VN')).toBe('xin chào');
    expect(msg(m, 'fr-FR')).toBe('hello');
    expect(msg({ 'vi-VN': 'chỉ vi' }, 'en-US')).toBe('');
    expect(msg({}, 'vi-VN')).toBe('');
  });
  it('ignores prototype keys', () => {
    expect(msg({}, 'constructor')).toBe('');
    expect(msg({ 'en-US': 'x' }, 'toString')).toBe('x');
  });
});

describe('fill', () => {
  it('replaces known vars, keeps unknown ones', () => {
    expect(fill('lo={lo}, hi={hi}, mid={mid}', { lo: 0, hi: 'n' })).toBe('lo=0, hi=n, mid={mid}');
  });
  it('replaces every occurrence and keeps 0 / empty string', () => {
    expect(fill('{a}{a}{b}', { a: 0, b: '' })).toBe('00');
  });
  it('returns the template when vars is missing or has no match', () => {
    expect(fill('x={x}')).toBe('x={x}');
    expect(fill('x={x}', {})).toBe('x={x}');
  });
  it('only treats {identifier} as a placeholder', () => {
    expect(fill('{1a} { a } {a-b} {}', { a: 1, '1a': 2 })).toBe('{1a} { a } {a-b} {}');
  });
  it('is safe with "$" in values and prototype names', () => {
    expect(fill('{a}', { a: '$&$1' })).toBe('$&$1');
    expect(fill('{constructor} {toString}', { x: 1 })).toBe('{constructor} {toString}');
  });
});

describe('unresolved', () => {
  it('lists leftover placeholders in order', () => {
    expect(unresolved('a {x} b {y_1} c {x}')).toEqual(['{x}', '{y_1}', '{x}']);
  });
  it('is empty when nothing is left', () => {
    expect(unresolved('plain { text }')).toEqual([]);
    expect(unresolved(fill('{a}', { a: 1 }))).toEqual([]);
  });
});

describe('hasRequiredLocales', () => {
  it('needs both vi-VN and en-US, non-empty', () => {
    expect(hasRequiredLocales({ 'vi-VN': 'a', 'en-US': 'b' })).toBe(true);
    expect(hasRequiredLocales({ 'vi-VN': 'a', 'en-US': 'b', 'fr-FR': 'c' })).toBe(true);
    expect(hasRequiredLocales({ 'vi-VN': 'a' })).toBe(false);
    expect(hasRequiredLocales({ 'en-US': 'b' })).toBe(false);
    expect(hasRequiredLocales({ 'vi-VN': '', 'en-US': 'b' })).toBe(false);
    expect(hasRequiredLocales({})).toBe(false);
  });
});
