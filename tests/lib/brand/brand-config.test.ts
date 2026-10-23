import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

describe('DEFAULT_BRAND (single-brand build)', () => {
  it('uses the KHAITAM identity for full chrome', () => {
    expect(DEFAULT_BRAND.productName).toBe('KHAITAM');
    expect(DEFAULT_BRAND.shortName).toBe('KHAITAM');
    expect(DEFAULT_BRAND.domain).toBe('khaitam.ai.vn');
    expect(DEFAULT_BRAND.themeColor).toBe('#102541');
  });

  it('marks its horizontal logo as already containing the wordmark', () => {
    expect(DEFAULT_BRAND.logoHasWordmark).toBe(true);
  });

  it('has a light-surface and a dark-surface file for the logo and the mark', () => {
    expect(DEFAULT_BRAND.logoSrc).toBe('/brand/logo-horizontal.svg');
    expect(DEFAULT_BRAND.logoSrcOnDark).toBe('/brand/logo-horizontal-dark.svg');
    expect(DEFAULT_BRAND.markSrc).toBe('/brand/mark.svg');
    expect(DEFAULT_BRAND.markSrcOnDark).toBe('/brand/mark-dark.svg');
  });
});
