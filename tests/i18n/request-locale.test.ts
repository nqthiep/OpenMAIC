import { describe, expect, it } from 'vitest';

import { REQUEST_LOCALE_FALLBACK, resolveRequestLocale } from '@/lib/i18n/request-locale';

describe('resolveRequestLocale', () => {
  it('uses the cookie over the browser language', () => {
    expect(resolveRequestLocale('en-US', 'vi-VN,vi;q=0.9')).toBe('en-US');
  });

  it('ignores a cookie that names no supported locale', () => {
    expect(resolveRequestLocale('xx-YY', 'en-US')).toBe('en-US');
    expect(resolveRequestLocale('"><script>', undefined)).toBe(REQUEST_LOCALE_FALLBACK);
  });

  it('takes the highest-weighted tag the app supports', () => {
    expect(resolveRequestLocale(undefined, 'fr-CA;q=0.4, en-GB;q=0.8, vi;q=0.9')).toBe('vi-VN');
    expect(resolveRequestLocale(undefined, 'ja;q=0.5, de;q=0.9')).toBe('de-DE');
  });

  it('keeps the browser order when weights are equal', () => {
    expect(resolveRequestLocale(undefined, 'ko-KR, ja-JP')).toBe('ko-KR');
  });

  it('matches a bare language to its supported locale and an exact tag to itself', () => {
    expect(resolveRequestLocale(undefined, 'en')).toBe('en-US');
    expect(resolveRequestLocale(undefined, 'zh-TW')).toBe('zh-TW');
  });

  it('drops refused and unparsable weights', () => {
    expect(resolveRequestLocale(undefined, 'en;q=0, vi;q=0.5')).toBe('vi-VN');
    expect(resolveRequestLocale(undefined, 'en;q=abc')).toBe(REQUEST_LOCALE_FALLBACK);
  });

  it('falls back to Vietnamese when no tag is supported', () => {
    expect(resolveRequestLocale(undefined, 'th-TH,th;q=0.9, *;q=0.1')).toBe('vi-VN');
    expect(resolveRequestLocale(undefined, null)).toBe('vi-VN');
    expect(resolveRequestLocale(undefined, '')).toBe('vi-VN');
  });

  it('skips an unsupported tag and takes the next supported one', () => {
    expect(resolveRequestLocale(undefined, 'th-TH, ja;q=0.5')).toBe('ja-JP');
  });

  it('keeps English for an English browser', () => {
    expect(resolveRequestLocale(undefined, 'en-US,en;q=0.9')).toBe('en-US');
  });

  it('answers in Vietnamese when the cookie and every tag are unsupported', () => {
    expect(resolveRequestLocale('xx-YY', 'sw-KE, th;q=0.5')).toBe('vi-VN');
  });
});
