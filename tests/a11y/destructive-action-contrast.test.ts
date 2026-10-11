import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The destructive buttons (variant "destructive") draw their text on a tint of
 * the destructive colour: bg-destructive/10 (light) and /20 on hover, and
 * dark:bg-destructive/20 with /30 on hover. The token's own colour falls below
 * 4.5:1 on that tint, so the account pages set a darker red for light mode and
 * a lighter one for dark mode.
 */
const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const lightBlock = css.match(/^:root \{([\s\S]*?)^\}/m)![1];
const darkBlock = css.match(/^\.dark \{([\s\S]*?)^\}/m)![1];

const token = (block: string, name: string): string => {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`missing token --${name}`);
  return match[1].trim();
};

type Rgb = [number, number, number];

function oklchToRgb(value: string): Rgb {
  const match = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/);
  if (!match) throw new Error(`unsupported colour ${value}`);
  const L = Number(match[1]);
  const C = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const a = C * Math.cos(hue);
  const b = C * Math.sin(hue);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((value) => {
    const c = Math.min(1, Math.max(0, value));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as Rgb;
}

const colour = (value: string): Rgb =>
  value.startsWith('#') ? hexToRgb(value) : oklchToRgb(value);

/** `fg` at `alpha` drawn over `bg`, as the browser paints bg-*\/N. */
const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb =>
  fg.map((v, i) => alpha * v + (1 - alpha) * bg[i]) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const light = (name: string) => colour(token(lightBlock, name));
const dark = (name: string) => colour(token(darkBlock, name));

describe('destructive button text on its tint', () => {
  it('light: the text class the account pages use (Tailwind red-800) keeps 4.5:1 at rest and on hover', () => {
    const red800 = hexToRgb('#991b1b');
    const card = light('card');
    const destructive = light('destructive');
    expect(contrast(red800, over(destructive, 0.1, card))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(red800, over(destructive, 0.2, card))).toBeGreaterThanOrEqual(4.5);
  });

  it('dark: the text class the account pages use (Tailwind red-200) keeps 4.5:1 at rest and on hover', () => {
    const red200 = hexToRgb('#fecaca');
    const card = dark('card');
    const destructive = dark('destructive');
    expect(contrast(red200, over(destructive, 0.2, card))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(red200, over(destructive, 0.3, card))).toBeGreaterThanOrEqual(4.5);
  });

  it('the token colour itself falls short on the light tint, which is why the class is overridden', () => {
    const card = light('card');
    const destructive = light('destructive');
    expect(contrast(destructive, over(destructive, 0.1, card))).toBeLessThan(4.5);
  });
});
