import { describe, expect, it } from 'vitest';
import amgm, {
  amgmSemicircleEntry as entry,
  expectedDisplay,
} from '@/lib/subjects/math/clips/amgm-semicircle';
import { validateClipInput } from '@/lib/clips/validate';
import { clipContract } from './clip-contract';

type In = { a: number; b: number };

const sweep: In[] = [];
for (let a = 1; a <= 20; a++) for (let b = 1; b <= 20; b++) sweep.push({ a, b });

clipContract<In>({
  module: amgm,
  presets: ['two-eight', 'equal', 'far', 'nine-sixteen'],
  chapters: [
    { id: 'setup', range: [8, 12] },
    { id: 'height', range: [10, 15] },
    { id: 'compare', range: [8, 12] },
    { id: 'equality', range: [10, 15] },
  ],
  bad: [
    { a: 0, b: 5 },
    { a: 5, b: 0 },
    { a: 21, b: 5 },
    { a: 5, b: 21 },
    { a: -1, b: 5 },
    { a: 2.5, b: 5 },
    { a: 2, b: 5, c: 1 },
    { a: 2 },
    { a: '2', b: 5 },
    null,
    [2, 5],
  ],
  edges: [
    { a: 1, b: 1 },
    { a: 1, b: 20 },
    { a: 20, b: 1 },
    { a: 20, b: 20 },
  ],
  // independent: the altitude to the hypotenuse of the triangle on diameter a + b, from the two pieces
  display: ({ a, b }) => {
    const h = Math.round(Math.sqrt(a * b) * 1000) / 1000;
    return { a, b, r: (a + b) / 2, h };
  },
  sweep,
});

describe('amgm-semicircle: specifics', () => {
  it('the four presets show the numbers from the card', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { a: 2, b: 8, r: 5, h: 4 },
      { a: 4, b: 4, r: 4, h: 4 },
      { a: 1, b: 20, r: 10.5, h: 4.472 },
      { a: 9, b: 16, r: 12.5, h: 12 },
    ]);
  });

  it('h = r exactly when a = b, over the whole 20 × 20 grid', () => {
    for (const { a, b } of sweep) {
      const d = expectedDisplay({ a, b });
      expect(d.h <= d.r + 1e-9).toBe(true);
      expect(Math.abs(Math.sqrt(a * b) - d.r) < 1e-9).toBe(a === b);
    }
  });

  it('every preset is the equal case only for "equal"; the others leave a strict gap', () => {
    const gap = entry.presets.map((p) => {
      const d = expectedDisplay(p.input);
      return d.r - d.h;
    });
    expect(gap[1]).toBe(0);
    for (const i of [0, 2, 3]) expect(gap[i]).toBeGreaterThan(0.4);
  });

  it('a and b are numbers and enums only: no string field that could carry LaTeX', () => {
    expect(JSON.stringify(entry.inputSpec)).not.toContain('"string"');
    expect(validateClipInput(entry, { a: '\\input{x}', b: 5 }).ok).toBe(false);
  });

  it('the caption of the equality chapter states the condition, and the sheet names the common mistake', () => {
    expect(entry.chapters.find((c) => c.id === 'equality')!.caption!['en-US']).toContain('a = b');
    expect(entry.sheet.chapters[1].misconceptions[0]['vi-VN']).toContain('trung bình cộng');
  });
});
