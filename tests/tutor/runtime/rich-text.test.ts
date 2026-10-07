import { describe, expect, it } from 'vitest';
import { hasMath, splitMath } from '@/lib/tutor/runtime/rich-text';

describe('splitMath', () => {
  it('cuts text and formulas in order and keeps the source of each part', () => {
    expect(splitMath('Ta có \\(a^2+b^2\\) và \\( x \\) rồi.')).toEqual([
      { tex: null, text: 'Ta có ' },
      { tex: 'a^2+b^2', text: '\\(a^2+b^2\\)' },
      { tex: null, text: ' và ' },
      { tex: 'x', text: '\\( x \\)' },
      { tex: null, text: ' rồi.' },
    ]);
  });

  it('plain text is one part; empty text has none', () => {
    expect(splitMath('no formula')).toEqual([{ tex: null, text: 'no formula' }]);
    expect(splitMath('')).toEqual([]);
  });

  it('an unclosed or empty delimiter stays plain text', () => {
    expect(splitMath('open \\(x')).toEqual([{ tex: null, text: 'open \\(x' }]);
    expect(splitMath('empty \\(  \\) end')).toEqual([{ tex: null, text: 'empty \\(  \\) end' }]);
    expect(hasMath('close \\)')).toBe(false);
  });

  it('a formula alone, and two formulas back to back', () => {
    expect(splitMath('\\(x\\)')).toEqual([{ tex: 'x', text: '\\(x\\)' }]);
    expect(splitMath('\\(a\\)\\(b\\)').map((p) => p.tex)).toEqual(['a', 'b']);
  });

  it('is lazy: the first closing delimiter ends a formula', () => {
    expect(
      splitMath('\\(a\\) mid \\(b\\)')
        .filter((p) => p.tex)
        .map((p) => p.tex),
    ).toEqual(['a', 'b']);
  });

  it('hasMath is true only when a formula part exists', () => {
    expect(hasMath('\\(x\\)')).toBe(true);
    expect(hasMath('plain')).toBe(false);
  });
});
