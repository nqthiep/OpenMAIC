import { describe, expect, it } from 'vitest';

import { normalizeMathDelimiters } from '@/lib/utils/math-delimiters';

describe('normalizeMathDelimiters', () => {
  it('turns LaTeX delimiters into the dollar delimiters the math plugin reads', () => {
    expect(normalizeMathDelimiters('slope \\(f(x_0)\\) is')).toBe('slope $f(x_0)$ is');
    expect(normalizeMathDelimiters('\\[ \\frac{a}{b} \\]')).toBe('$$ \\frac{a}{b} $$');
    expect(normalizeMathDelimiters('a \\[x\\]\nand \\(y\\)')).toBe('a $$x$$\nand $y$');
  });

  it('leaves text without them alone', () => {
    expect(normalizeMathDelimiters('$x^2$ and (plain) [text]')).toBe('$x^2$ and (plain) [text]');
  });
});
