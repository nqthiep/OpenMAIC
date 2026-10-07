import { describe, expect, it } from 'vitest';
import algIdentityArea, {
  algIdentityAreaEntry as entry,
  expectedDisplay,
} from '@/lib/subjects/math/clips/alg-identity-area';
import { clipContract } from './clip-contract';

type In = { id: 'square-sum' | 'diff-squares'; a: number; b: number };

const sweep: In[] = [];
for (let a = 1; a <= 9; a++)
  for (let b = 1; b <= 9; b++) {
    sweep.push({ id: 'square-sum', a, b });
    if (a > b) sweep.push({ id: 'diff-squares', a, b });
  }

clipContract<In>({
  module: algIdentityArea,
  presets: ['sum-3-2', 'sum-1-1', 'diff-5-2', 'diff-9-1'],
  chapters: [
    { id: 'figure', range: [8, 12] },
    { id: 'decompose', range: [10, 15] },
    { id: 'rearrange', range: [10, 15] },
    { id: 'formula', range: [8, 12] },
  ],
  bad: [
    { id: 'diff-squares', a: 2, b: 5 },
    { id: 'diff-squares', a: 4, b: 4 },
    { id: 'cube-sum', a: 3, b: 2 },
    { id: 'square-sum', a: 0, b: 2 },
    { id: 'square-sum', a: 10, b: 2 },
    { id: 'square-sum', a: 3, b: 10 },
    { id: 'square-sum', a: 1.5, b: 2 },
    { id: 'square-sum', a: 3 },
    { id: 'square-sum', a: 3, b: 2, c: 1 },
    { a: 3, b: 2 },
    null,
  ],
  edges: [
    { id: 'square-sum', a: 1, b: 1 },
    { id: 'square-sum', a: 9, b: 9 },
    { id: 'square-sum', a: 1, b: 9 },
    { id: 'diff-squares', a: 2, b: 1 },
    { id: 'diff-squares', a: 9, b: 1 },
    { id: 'diff-squares', a: 9, b: 8 },
  ],
  // independent: count unit cells of the picture instead of using the algebra
  display: ({ id, a, b }): Record<string, number> => {
    if (id === 'square-sum') {
      let cells = 0;
      for (let x = 0; x < a + b; x++) for (let y = 0; y < a + b; y++) cells++;
      let a2 = 0;
      for (let x = 0; x < a; x++) for (let y = 0; y < a; y++) a2++;
      let b2 = 0;
      for (let x = 0; x < b; x++) for (let y = 0; y < b; y++) b2++;
      let ab = 0;
      for (let x = 0; x < a; x++) for (let y = 0; y < b; y++) ab++;
      return { total: cells, a2, ab, b2 };
    }
    // the L-shape of the square of side a without the corner b×b, cut into a strip (a−b)×b and a rectangle a×(a−b)
    const L = a * a - b * b;
    const rect = (a - b) * b + a * (a - b);
    let prod = 0;
    for (let x = 0; x < a + b; x++) for (let y = 0; y < a - b; y++) prod++;
    return { a2: a * a, b2: b * b, diff: L === rect ? L : -1, prod };
  },
  sweep,
});

describe('alg-identity-area: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { total: 25, a2: 9, ab: 6, b2: 4 },
      { total: 4, a2: 1, ab: 1, b2: 1 },
      { a2: 25, b2: 4, diff: 21, prod: 21 },
      { a2: 81, b2: 1, diff: 80, prod: 80 },
    ]);
  });

  it('the four pieces of the square sum add up to the whole: a² + ab + ab + b² = (a+b)², and the false rule a² + b² does not', () => {
    for (const { a, b } of sweep.filter((x) => x.id === 'square-sum')) {
      const d = expectedDisplay({ id: 'square-sum', a, b });
      expect(d.a2 + 2 * d.ab + d.b2).toBe(d.total);
      expect(d.a2 + d.b2).toBeLessThan(d.total); // the common mistake always loses the two rectangles
    }
  });

  it('the difference of squares equals the product on the whole grid', () => {
    for (const { a, b } of sweep.filter((x) => x.id === 'diff-squares')) {
      const d = expectedDisplay({ id: 'diff-squares', a, b });
      expect(d.diff).toBe(d.prod);
      expect(d.diff).toBeGreaterThan(0);
    }
  });

  it('the display keys depend on the identity', () => {
    expect(Object.keys(expectedDisplay({ id: 'square-sum', a: 2, b: 1 }))).toEqual([
      'total',
      'a2',
      'ab',
      'b2',
    ]);
    expect(Object.keys(expectedDisplay({ id: 'diff-squares', a: 2, b: 1 }))).toEqual([
      'a2',
      'b2',
      'diff',
      'prod',
    ]);
  });

  it('check says why a diff-squares input is refused', () => {
    expect(entry.check!({ id: 'diff-squares', a: 3, b: 3 })).toEqual([
      'diff-squares-needs-a-greater-than-b',
    ]);
    expect(entry.check!({ id: 'square-sum', a: 1, b: 9 })).toEqual([]);
  });
});
