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

/** A hex value of a custom property in the `.dark` block of globals.css. */
function darkVar(name: string): string {
  const block = globals.match(/\.dark\s*\{[^}]*\}/)?.[0] ?? '';
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`${name} is not a hex value in the .dark block of app/globals.css`);
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

describe('brand tokens (KHAITAM, brand board of 2026-10-22)', () => {
  it('carries the four colours the brand board names, and the tints derived from them', () => {
    expect(token('brand-900')).toBe('#102541'); // Xanh đêm
    expect(token('brand-yellow')).toBe('#f4c66d'); // Vàng khai mở
    expect(token('brand-teal')).toBe('#2e8278'); // Xanh ngọc
    expect(token('brand-page')).toBe('#f3f0e8'); // Trắng giấy
    // Derived, not named by the board: the mid steps that must read on both themes,
    // the readable teals and the muted text.
    expect(token('brand-600')).toBe('#426fab');
    expect(token('brand-teal-ink')).toBe('#23695f');
    expect(token('brand-mint')).toBe('#76d5c1');
    expect(token('brand-peach')).toBe('#f4cab1'); // the fourth icon tint, sampled from the board
    expect(token('brand-ink')).toBe('#102541');
    expect(token('brand-mute')).toBe('#586274');
    expect(DEFAULT_BRAND.themeColor.toLowerCase()).toBe(token('brand-900'));
  });

  it('remaps the legacy violet, purple, indigo and blue palettes onto the brand ramp', () => {
    for (const palette of ['violet', 'purple', 'indigo', 'blue']) {
      for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
        expect(css).toContain(`--color-${palette}-${step}: var(--color-brand-${step});`);
      }
    }
  });

  it('runs the neutrals from paper to night, with muted text that reads on paper', () => {
    // text-gray-500 is the muted text of the whole app, and the app's pages are paper now.
    for (const surface of [token('brand-page'), token('gray-100'), '#ffffff']) {
      expect(contrast(token('gray-500'), surface)).toBeGreaterThanOrEqual(4.5);
    }
    // text-gray-400 stays the placeholder tone of Tailwind's gray-400 (about 2.5:1 on white).
    expect(
      Math.abs(contrast(token('gray-400'), '#ffffff') - contrast('#9ca3af', '#ffffff')),
    ).toBeLessThan(0.25);
    expect(contrast(token('gray-600'), '#ffffff')).toBeGreaterThanOrEqual(7);
    expect(token('gray-900')).toBe(token('brand-900'));
    expect(token('gray-950')).toBe(darkVar('--background'));
    expect(css).toContain('--color-slate-500: var(--color-gray-500);');
  });

  it('keeps the ramp ordered from light to dark', () => {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) =>
      luminance(token(`brand-${n}`)),
    );
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it('keeps text pairs at WCAG AA (4.5:1), or 3:1 for non-text', () => {
    const white = '#ffffff';
    const page = token('brand-page');
    const darkBg = darkVar('--background');
    const navy = token('brand-900');

    // Light theme: navy button with a white label, ink on paper, links and the teal.
    expect(contrast(white, navy)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-ink'), page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-mute'), page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-700'), page)).toBeGreaterThanOrEqual(4.5); // link on paper
    expect(contrast(token('brand-800'), white)).toBeGreaterThanOrEqual(4.5); // headings
    expect(contrast(token('brand-teal-ink'), page)).toBeGreaterThanOrEqual(4.5); // teal text
    expect(contrast(white, token('brand-teal'))).toBeGreaterThanOrEqual(4.5); // label on a teal fill
    expect(contrast(navy, token('brand-yellow'))).toBeGreaterThanOrEqual(4.5); // label on gold
    expect(contrast(navy, token('brand-peach'))).toBeGreaterThanOrEqual(4.5); // icon on a peach tile

    // Dark theme: gold button with a navy label, mint text, light accent text.
    expect(contrast(navy, token('brand-yellow'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-yellow'), darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-mint'), navy)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-300'), navy)).toBeGreaterThanOrEqual(4.5); // accent text on a card
    expect(contrast(darkVar('--muted-foreground'), navy)).toBeGreaterThanOrEqual(4.5); // muted text on a card

    // The ramp is static, so its middle step must be visible on both themes: 3:1 against the
    // dark page and the dark card (non-text), and a white label on it reads at 4.5:1.
    expect(contrast(white, token('brand-600'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('brand-600'), page)).toBeGreaterThanOrEqual(4.5); // small text on paper
    expect(contrast(token('brand-600'), darkBg)).toBeGreaterThanOrEqual(3);
    expect(contrast(token('brand-600'), navy)).toBeGreaterThanOrEqual(3);
  });

  it('has no CSS filter that would flatten the logo to one colour', () => {
    // A filter would drop the gold dot; the dark surfaces use the *-dark.svg files instead.
    expect(css).not.toContain('filter: brightness');
    expect(css).not.toContain('.logo-on-brand');
    expect(css).not.toContain('img[src=');
  });

  it('points the semantic tokens at the brand, per theme', () => {
    const root = globals.match(/:root\s*\{[^}]*\}/)?.[0] ?? '';
    const dark = globals.match(/\.dark\s*\{[^}]*\}/)?.[0] ?? '';
    expect(root).toMatch(/--background:\s*var\(--color-brand-page\)/);
    expect(root).toMatch(/--primary:\s*var\(--color-brand-900\)/);
    expect(root).toMatch(/--primary-foreground:\s*#ffffff/);
    expect(root).toMatch(/--ring:\s*var\(--color-brand-teal\)/);
    expect(dark).toMatch(/--primary:\s*var\(--color-brand-yellow\)/);
    expect(dark).toMatch(/--primary-foreground:\s*var\(--color-brand-900\)/);
    expect(dark).toMatch(/--ring:\s*var\(--color-brand-mint\)/);
    expect(dark).toMatch(/--card:\s*var\(--color-brand-900\)/);
  });

  it('ships the logo and icon files, and no leftover of the previous brand', () => {
    for (const file of [
      DEFAULT_BRAND.logoSrc,
      DEFAULT_BRAND.logoSrcOnDark,
      DEFAULT_BRAND.markSrc,
      DEFAULT_BRAND.markSrcOnDark,
    ]) {
      expect(existsSync(`public${file}`)).toBe(true);
    }
    for (const file of ['app/icon.png', 'app/apple-icon.png', 'app/favicon.ico']) {
      expect(existsSync(file)).toBe(true);
    }
    // The share image is 1200 x 630 (width and height sit at bytes 16 to 23 of a PNG).
    const og = readFileSync('app/opengraph-image.png');
    expect([og.readUInt32BE(16), og.readUInt32BE(20)]).toEqual([1200, 630]);
    for (const gone of ['public/brand/logo-horizontal.png', 'public/brand/mark.png']) {
      expect(existsSync(gone)).toBe(false);
    }
  });
});
