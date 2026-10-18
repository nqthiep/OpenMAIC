import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

describe('DEFAULT_BRAND (single-brand build)', () => {
  it('uses the ÔN THI identity for full chrome', () => {
    expect(DEFAULT_BRAND.productName).toBe('ÔN THI');
    expect(DEFAULT_BRAND.shortName).toBe('ÔN THI');
    expect(DEFAULT_BRAND.domain).toBe('onthi.ap.vn');
    expect(DEFAULT_BRAND.markSrc).toBe('/brand/mark.png');
    expect(DEFAULT_BRAND.themeColor).toBe('#2563EB');
  });

  it('marks its horizontal logo as already containing the wordmark', () => {
    expect(DEFAULT_BRAND.logoHasWordmark).toBe(true);
    expect(DEFAULT_BRAND.logoSrc).toBe('/brand/logo-horizontal.png');
  });
});
