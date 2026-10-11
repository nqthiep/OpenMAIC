import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The colour tokens in app/globals.css, checked against WCAG 2.x contrast.
const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const lightBlock = css.match(/^:root \{([\s\S]*?)^\}/m)![1];
const darkBlock = css.match(/^\.dark \{([\s\S]*?)^\}/m)![1];

const token = (block: string, name: string): string => {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`missing token --${name}`);
  return match[1].trim();
};

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Relative luminance of a hex colour, or of a neutral oklch grey (OKLab L cubed). */
function luminance(value: string): number {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return (
      0.2126 * linear(((n >> 16) & 255) / 255) +
      0.7152 * linear(((n >> 8) & 255) / 255) +
      0.0722 * linear((n & 255) / 255)
    );
  }
  const grey = value.match(/^oklch\(([\d.]+) 0 0\)$/);
  if (grey) return Number(grey[1]) ** 3;
  throw new Error(`unsupported colour ${value}`);
}

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('colour tokens in app/globals.css', () => {
  it('light: button text, muted text and the focus ring reach their WCAG levels', () => {
    const t = (name: string) => token(lightBlock, name);
    expect(contrast(t('primary-foreground'), t('primary'))).toBeGreaterThanOrEqual(4.5);
    for (const surface of ['background', 'muted', 'sidebar', 'card']) {
      expect(contrast(t('muted-foreground'), t(surface))).toBeGreaterThanOrEqual(4.5);
    }
    for (const surface of ['background', 'muted', 'sidebar']) {
      expect(contrast(t('ring'), t(surface))).toBeGreaterThanOrEqual(3);
    }
  });

  it('dark: button text, muted text and the focus ring reach their WCAG levels', () => {
    const t = (name: string) => token(darkBlock, name);
    expect(contrast(t('primary-foreground'), t('primary'))).toBeGreaterThanOrEqual(4.5);
    for (const surface of ['background', 'card', 'muted', 'accent']) {
      expect(contrast(t('muted-foreground'), t(surface))).toBeGreaterThanOrEqual(4.5);
    }
    for (const surface of ['background', 'card', 'muted', 'accent']) {
      expect(contrast(t('ring'), t(surface))).toBeGreaterThanOrEqual(3);
    }
  });

  it('the base focus outline is the ring colour itself, not a 50% tint', () => {
    expect(css).toMatch(/\*\s*\{\s*@apply border-border outline-ring;\s*\}/);
  });
});
