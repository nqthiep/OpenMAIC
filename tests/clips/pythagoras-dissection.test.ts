import { describe, expect, it } from 'vitest';
import pythagorasDissection, {
  expectedDisplay,
  pythagorasDissectionEntry as entry,
} from '@/lib/subjects/math/clips/pythagoras-dissection';
import { clipContract } from './clip-contract';

type In = { a: number; b: number };

const sweep: In[] = [];
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) sweep.push({ a, b });

clipContract<In>({
  module: pythagorasDissection,
  presets: ['three-four', 'equal', 'thin', 'six-eight'],
  chapters: [
    { id: 'triangles', range: [8, 12] },
    { id: 'big-square', range: [10, 12] },
    { id: 'rearrange', range: [12, 16] },
    { id: 'conclude', range: [10, 12] },
  ],
  bad: [
    { a: 0, b: 3 },
    { a: 3, b: 0 },
    { a: 10, b: 3 },
    { a: 3, b: 10 },
    { a: 2.5, b: 3 },
    { a: 3 },
    { a: 3, b: 4, c: 5 },
    { a: '3', b: 4 },
    null,
  ],
  edges: [
    { a: 1, b: 1 },
    { a: 9, b: 9 },
    { a: 1, b: 9 },
    { a: 9, b: 1 },
  ],
  // independent: the hypotenuse by the distance between the ends of the two legs, and c² by counting unit cells
  display: ({ a, b }) => {
    let cells = 0;
    for (let x = 0; x < a; x++) for (let y = 0; y < a; y++) cells++;
    for (let x = 0; x < b; x++) for (let y = 0; y < b; y++) cells++;
    return { c2: cells, c: Math.round(Math.hypot(a, b) * 1000) / 1000 };
  },
  sweep,
});

describe('pythagoras-dissection: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { c2: 25, c: 5 },
      { c2: 8, c: 2.828 },
      { c2: 82, c: 9.055 },
      { c2: 100, c: 10 },
    ]);
  });

  it('the big square splits as (a + b)² = four triangles of area ab/2 plus the gap c², on the whole grid', () => {
    for (const { a, b } of sweep) {
      const triangles = 4 * ((a * b) / 2);
      expect(triangles + expectedDisplay({ a, b }).c2).toBe((a + b) ** 2);
    }
  });

  it('the second arrangement leaves a² and b² as the gap, and the two gaps are equal', () => {
    for (const { a, b } of sweep) {
      expect((a + b) ** 2 - 2 * a * b).toBe(a * a + b * b);
      expect(expectedDisplay({ a, b }).c2).toBe(a * a + b * b);
    }
  });

  it('c is a whole number only for Pythagorean triples among the presets: 3-4-5 and 6-8-10', () => {
    const whole = entry.presets
      .filter((p) => Number.isInteger(expectedDisplay(p.input).c))
      .map((p) => p.id);
    expect(whole).toEqual(['three-four', 'six-eight']);
  });

  it('the theorem is not special to 3-4-5: it holds for the thin and the isosceles presets too', () => {
    for (const id of ['equal', 'thin']) {
      const { a, b } = entry.presets.find((p) => p.id === id)!.input;
      expect(expectedDisplay({ a, b }).c2).toBe(a * a + b * b);
    }
  });
});
