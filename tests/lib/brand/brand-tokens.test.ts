import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

const css = readFileSync('app/brand.css', 'utf8');
const globals = readFileSync('app/globals.css', 'utf8');

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} missing in app/brand.css`);
  return m[1].toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('brand tokens (guidelines v1.0, section 5)', () => {
  it('carries the colors the guidelines name', () => {
    expect(token('brand-600')).toBe('#2563eb'); // Xanh tri thức
    expect(token('brand-800')).toBe('#0b44aa'); // Xanh đậm
    expect(token('brand-yellow')).toBe('#fbbf24'); // Vàng thành công
    expect(token('brand-ink')).toBe('#1f2937');
    expect(token('brand-mute')).toBe('#667085');
    expect(token('brand-line')).toBe('#e5e7eb');
    expect(token('brand-page')).toBe('#f8fafc');
    expect(DEFAULT_BRAND.themeColor.toLowerCase()).toBe(token('brand-600'));
  });

  it('remaps the legacy violet, purple and indigo palettes onto the brand ramp', () => {
    for (const palette of ['violet', 'purple', 'indigo']) {
      for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
        expect(css).toContain(`--color-${palette}-${step}: var(--color-brand-${step});`);
      }
    }
  });

  it('keeps text pairs at WCAG AA (4.5:1), or 3:1 for non-text', () => {
    const white = '#ffffff';
    const page = token('brand-page');
    expect(contrast(white, token('brand-600'))).toBeGreaterThanOrEqual(4.5); // primary button label
    expect(contrast(token('brand-600'), white)).toBeGreaterThanOrEqual(4.5); // link on a card
    expect(contrast(token('brand-800'), white)).toBeGreaterThanOrEqual(4.5); // headings, secondary label
    expect(contrast(token('brand-ink'), page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-mute'), page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-ink'), token('brand-yellow'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-line'), white)).toBeLessThan(3); // a divider, never text

    // Dark theme: primary is the 500 step with navy text.
    const darkBg = '#0b1220';
    const darkCard = '#111a2e';
    expect(contrast(darkBg, token('brand-500'))).toBeGreaterThanOrEqual(4.5); // button label
    expect(contrast(token('brand-500'), darkBg)).toBeGreaterThanOrEqual(4.5); // link
    expect(contrast(token('brand-400'), darkCard)).toBeGreaterThanOrEqual(4.5); // accent text
    expect(contrast('#98a2b3', darkCard)).toBeGreaterThanOrEqual(4.5); // muted text
  });

  it('gives the dark theme a white logo and the band a one-colour logo', () => {
    expect(css).toMatch(/\.logo-on-brand\s*\{\s*filter:\s*brightness\(0\) invert\(1\)/);
    expect(css).toContain(".dark img[src='/brand/logo-horizontal.png']");
  });

  it('points the semantic tokens at the brand and ships the logo files', () => {
    expect(globals).toMatch(/--primary:\s*var\(--color-brand-600\)/);
    expect(globals).toMatch(/--ring:\s*var\(--color-brand-600\)/);
    for (const file of [DEFAULT_BRAND.logoSrc, DEFAULT_BRAND.markSrc]) {
      expect(existsSync(`public${file}`)).toBe(true);
    }
    for (const file of ['app/icon.png', 'app/apple-icon.png', 'app/favicon.ico']) {
      expect(existsSync(file)).toBe(true);
    }
  });
});
