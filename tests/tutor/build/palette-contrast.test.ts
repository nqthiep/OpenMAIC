import { describe, expect, it } from 'vitest';
import { SHELL_CSS } from '@/lib/tutor/build/shell';

const KINDS = ['active', 'compare', 'result', 'visited', 'muted'] as const;
const MIN_RATIO = 3; // WCAG 2.2 SC 1.4.11 (non-text contrast)

/** Custom properties of the `:root` rule (light) or of the dark media block. */
function palette(scheme: 'light' | 'dark'): Record<string, string> {
  const block =
    scheme === 'dark'
      ? SHELL_CSS.match(/@media \(prefers-color-scheme:dark\)\{:root\{([^}]*)\}/)![1]
      : SHELL_CSS.match(/^:root\{([^}]*)\}/m)![1];
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+):(#[0-9a-f]{3,6})/gi)) vars[m[1]] = m[2];
  return vars;
}

function luminance(short: string): number {
  const hex = short.length === 4 ? `#${[...short.slice(1)].map((c) => c + c).join('')}` : short;
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

/** Declarations of `.wt-hl-<kind>{...}` as a map. */
function rule(kind: string): Record<string, string> {
  const body = SHELL_CSS.match(new RegExp(`\\.wt-hl-${kind}\\{([^}]*)\\}`))![1];
  return Object.fromEntries(
    body.split(';').map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]),
  );
}

describe('highlight palette', () => {
  it.each(['light', 'dark'] as const)(
    '%s: every kind stroke is >= 3:1 against --wt-bg',
    (scheme) => {
      const vars = palette(scheme);
      for (const kind of KINDS) {
        const colour = vars[`--wt-k-${kind}`];
        expect(colour, `${scheme} --wt-k-${kind}`).toBeDefined();
        expect(contrast(colour, vars['--wt-bg']), `${scheme} ${kind}`).toBeGreaterThanOrEqual(
          MIN_RATIO,
        );
      }
    },
  );

  it('each kind has its own stroke colour, width and dash (state is not colour/fill alone)', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const vars = palette(scheme);
      const colours = KINDS.map((k) => vars[`--wt-k-${k}`]);
      expect(new Set(colours).size).toBe(KINDS.length);
    }
    const looks = KINDS.map((k) => {
      const r = rule(k);
      expect(r.stroke).toBe(`var(--wt-k-${k})`);
      return `${r['stroke-width']}|${r['stroke-dasharray'] ?? 'solid'}`;
    });
    expect(new Set(looks).size).toBe(KINDS.length);
    // widths differ even ignoring the dash pattern
    expect(new Set(KINDS.map((k) => rule(k)['stroke-width'])).size).toBeGreaterThanOrEqual(4);
  });

  it('declares color-scheme for both schemes', () => {
    expect(SHELL_CSS).toMatch(/^:root\{color-scheme:light;/m);
    expect(SHELL_CSS).toMatch(/prefers-color-scheme:dark\)\{:root\{color-scheme:dark;/);
  });
});
